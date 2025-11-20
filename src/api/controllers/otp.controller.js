// src/controllers/otp.controller.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const logger = require('../../utils/logger');
const registrationService = require('../../services/RegistrationService');
const redis = require('../../database/redis');

// Try to load libphonenumber-js (optional, recommended)
let phoneParser = null;
try {
  // parsePhoneNumberFromString is the main helper
  phoneParser = require('libphonenumber-js');
  logger.info('Phone parsing: libphonenumber-js loaded');
} catch (e) {
  phoneParser = null;
  logger.warn('Phone parsing: libphonenumber-js not installed; using fallback parsing');
}

// Fallback list of country calling codes (common + extended).
// Sorted intentionally by string length desc (we'll sort later) so longer codes match first.
const COUNTRY_CODES = [
  '1','7','20','27','30','31','32','33','34','36','39','40','41','44','45','46','47','48','49',
  '51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84','86',
  '90','91','92','93','94','98','212','213','216','218','220','221','222','223','224','225','226',
  '227','228','229','230','231','232','233','234','235','236','237','238','239','240','241','242',
  '243','244','245','246','248','249','250','251','252','253','254','255','256','257','258','260',
  '261','262','263','264','265','266','267','268','269','290','291','297','298','299','350','351',
  '352','353','354','355','356','357','358','359','370','371','372','373','374','375','376','377',
  '378','380','381','382','383','385','386','387','389','420','421','423','500','501','502','503',
  '504','505','506','507','508','509','590','591','592','593','594','595','596','597','598','599',
  '670','672','673','674','675','676','677','678','679','680','681','682','683','685','686','687',
  '688','689','690','691','692','850','852','853','855','856','880','886','960','961','962','963',
  '964','965','966','967','968','970','971','972','973','974','975','976','977','992','993','994',
  '995','996','998'
];
// ensure longest-first matching
COUNTRY_CODES.sort((a, b) => b.length - a.length);

/**
 * Robust fallback extractor (uses COUNTRY_CODES).
 * Accepts phone number in E.164 or similar (with or without leading +).
 * Returns the country calling code as a string (e.g. "1", "234"), or null if none found.
 */
function extractCountryCallingCodeFallback(phoneNumber) {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/^\+/, '').replace(/\D/g, '');
  for (const code of COUNTRY_CODES) {
    if (digits.startsWith(code)) {
      return code;
    }
  }
  // Final fallback: if digits length > 4 assume first 1-3 digits may be country code; try 1-3 longest-first
  for (let len = 3; len >= 1; len--) {
    if (digits.length > len + 3) {
      return digits.slice(0, len);
    }
  }
  return digits.slice(0, 1);
}

/**
 * Spawn helper to run testwhatsapp.js as a separate Node process.
 * - sessionId: used for logging context
 * - phoneNumber, countryCode: injected into child env
 */
function spawnTestWhatsapp(sessionId, phoneNumber, countryCode) {
  // Resolve script path from project root (process.cwd())
  const scriptPath = path.join(process.cwd(), 'testwhatsapp.js');

  if (!fs.existsSync(scriptPath)) {
    logger.error(`[${sessionId}] Registration child script not found at ${scriptPath}`);
    return null;
  }

  const env = Object.assign({}, process.env, {
    SMS_ACTIVATE_NUMBER: phoneNumber,
    SMS_ACTIVATE_COUNTRY_CODE: countryCode
  });

  logger.info(
    `[${sessionId}] Spawning registration child: ${process.execPath} ${scriptPath} (phone=${phoneNumber})`
  );

  // Use pipes so we can capture stdout/stderr for logs
  const child = spawn(process.execPath, [scriptPath], {
    env,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });

  child.stdout.on('data', chunk => {
    const txt = chunk.toString().trim();
    if (txt) logger.info(`[child ${sessionId}] ${txt}`);
  });

  child.stderr.on('data', chunk => {
    const txt = chunk.toString().trim();
    if (txt) logger.error(`[child ${sessionId}] ${txt}`);
  });

  child.on('error', err => {
    logger.error(`[child ${sessionId}] spawn error:`, err);
  });

  child.on('exit', (code, signal) => {
    logger.info(`[child ${sessionId}] exited with code=${code} signal=${signal}`);
  });

  // Let parent exit independently but keep child running
  try {
    child.unref();
  } catch (e) {
    // some environments may throw; not fatal
    logger.warn(`[child ${sessionId}] unref() failed: ${e.message}`);
  }

  return child.pid;
}

// In-memory storage for sessions (backed by Redis)
const sessions = new Map();

// Listen to registration service events
registrationService.on('status', async ({ sessionId, status, error }) => {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    session.lastUpdated = new Date().toISOString();
    if (error) session.error = error;

    sessions.set(sessionId, session);

    // Update Redis with FIXED syntax (setEx instead of setex)
    try {
      await redis.setEx(`session:${sessionId}`, 900, JSON.stringify(session));
    } catch (err) {
      logger.warn(`Failed to update Redis for ${sessionId}:`, err.message);
    }
  }
});

/**
 * POST /api/whatsapp/register
 * Initiate WhatsApp registration
 */
exports.registerAccount = async (req, res) => {
  try {
    const { phoneNumber: rawPhoneNumber, countryCode } = req.body;
    const phoneNumber = rawPhoneNumber && typeof rawPhoneNumber === 'string' ? rawPhoneNumber.trim() : rawPhoneNumber;

    // Validate phone number (E.164-ish)
    if (!phoneNumber || !phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)'
      });
    }

    // Check if emulator is available (only 1 concurrent session for now)
    if (registrationService.getActiveSessionCount() >= 1) {
      return res.status(503).json({
        success: false,
        error: 'Emulator is busy with another registration. Please try again in 2-3 minutes.',
        activeRegistrations: registrationService.getActiveSessionCount()
      });
    }

    // Generate session ID
    const sessionId = `whatsapp_${Date.now()}_${uuidv4().split('-')[0]}`;

    // Extract country code if not provided
    let finalCountryCode = countryCode;
    if (!finalCountryCode) {
      try {
        if (phoneParser && typeof phoneParser.parsePhoneNumberFromString === 'function') {
          const pn = phoneParser.parsePhoneNumberFromString(phoneNumber);
          if (pn && pn.countryCallingCode) {
            finalCountryCode = pn.countryCallingCode;
          } else {
            finalCountryCode = extractCountryCallingCodeFallback(phoneNumber);
          }
        } else {
          finalCountryCode = extractCountryCallingCodeFallback(phoneNumber);
        }
      } catch (err) {
        logger.warn(`[${sessionId}] phone parsing error, using fallback: ${err.message}`);
        finalCountryCode = extractCountryCallingCodeFallback(phoneNumber);
      }
    }

    // Create session object
    const session = {
      sessionId,
      phoneNumber,
      countryCode: finalCountryCode,
      status: 'pending',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      otpAttempts: 0
    };

    // Store session
    sessions.set(sessionId, session);

    // Store in Redis with FIXED syntax (setEx instead of setex)
    try {
      await redis.setEx(`session:${sessionId}`, 900, JSON.stringify(session));
    } catch (err) {
      logger.warn('Redis storage failed, continuing with in-memory only:', err.message);
    }

    logger.info(`New registration session created: ${sessionId} for ${phoneNumber} (countryCode=${finalCountryCode})`);

    // Return response immediately
    res.status(202).json({
      success: true,
      sessionId,
      status: 'pending',
      phoneNumber,
      countryCode: finalCountryCode,
      message: 'Registration initiated. WhatsApp will be prepared for OTP input.',
      estimatedTime: '2-3 minutes',
      nextStep: 'Check status endpoint, then submit OTP when you receive the SMS'
    });

    // Start background process to perform the registration
    try {
      // Prefer internal service orchestration if available
      if (typeof registrationService.startRegistration === 'function') {
        // Start the registration in the background (non-blocking)
        registrationService.startRegistration(sessionId, phoneNumber, finalCountryCode)
          .then(() => logger.info(`[${sessionId}] registrationService.startRegistration finished`))
          .catch(err => logger.error(`[${sessionId}] registrationService.startRegistration failed:`, err));
      } else {
        // Fallback: spawn testwhatsapp.js directly
        const pid = spawnTestWhatsapp(sessionId, phoneNumber, finalCountryCode);
        if (pid) logger.info(`Launched testwhatsapp.js for session ${sessionId} as PID ${pid}`);
        else logger.error(`[${sessionId}] Failed to launch testwhatsapp.js`);
      }
    } catch (err) {
      logger.error(`[${sessionId}] Failed to kick off background registration:`, err);
      // Update session status to failed
      const s = sessions.get(sessionId);
      if (s) {
        s.status = 'failed';
        s.error = err.message;
        s.lastUpdated = new Date().toISOString();
        sessions.set(sessionId, s);
        try {
          await redis.setEx(`session:${sessionId}`, 900, JSON.stringify(s));
        } catch (e) {
          logger.warn('Failed to update error status in Redis:', e.message);
        }
      }
    }
  } catch (error) {
    logger.error('Registration initiation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate registration',
      details: error.message
    });
  }
};

/**
 * POST /api/whatsapp/verify
 * Submit OTP for verification
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { sessionId, otp } = req.body;

    // Validate inputs
    if (!sessionId || !otp) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and otp are required'
      });
    }

    if (!otp.match(/^\d{6}$/)) {
      return res.status(400).json({
        success: false,
        error: 'OTP must be a 6-digit number (e.g., "123456")'
      });
    }

    // Get session
    let session = sessions.get(sessionId);
    if (!session) {
      // Try Redis with FIXED syntax
      try {
        const cached = await redis.get(`session:${sessionId}`);
        if (cached) {
          session = JSON.parse(cached);
          sessions.set(sessionId, session);
        }
      } catch (err) {
        logger.warn('Redis fetch failed:', err.message);
      }

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found or expired',
          hint: 'Session may have timed out. Please start a new registration.'
        });
      }
    }

    // Check OTP attempts
    if (session.otpAttempts >= 3) {
      return res.status(429).json({
        success: false,
        error: 'Maximum OTP attempts exceeded (3 attempts)',
        sessionId,
        hint: 'Please start a new registration'
      });
    }

    // Check session status
    if (session.status !== 'waiting_for_otp') {
      return res.status(400).json({
        success: false,
        error: `Cannot verify OTP. Current status: ${session.status}`,
        sessionId,
        currentStatus: session.status,
        hint: session.status === 'pending' || session.status === 'in_progress'
          ? 'Wait for status to be "waiting_for_otp" before submitting OTP'
          : session.status === 'registered'
            ? 'This account is already registered'
            : 'Please start a new registration'
      });
    }

    // Check if registration service has this session
    if (!registrationService.hasSession(sessionId)) {
      return res.status(400).json({
        success: false,
        error: 'Registration session expired or was cancelled',
        sessionId,
        hint: 'Please start a new registration'
      });
    }

    // Update session
    session.otp = otp;
    session.status = 'verifying';
    session.otpAttempts += 1;
    session.lastUpdated = new Date().toISOString();

    sessions.set(sessionId, session);
    // Update Redis with FIXED syntax (setEx instead of setex)
    try {
      await redis.setEx(`session:${sessionId}`, 900, JSON.stringify(session));
    } catch (err) {
      logger.warn('Redis update failed:', err.message);
    }

    logger.info(`OTP received for session ${sessionId}: ${otp}`);

    // Return immediately
    res.json({
      success: true,
      sessionId,
      status: 'verifying',
      message: 'OTP submitted. Verification in progress (15-30 seconds).',
      phoneNumber: session.phoneNumber,
      hint: 'Check status endpoint for completion'
    });

    // Process OTP verification in background
    verifyOTPInBackground(sessionId, otp);

  } catch (error) {
    logger.error('OTP verification failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP',
      details: error.message
    });
  }
};

/**
 * GET /api/whatsapp/status/:sessionId
 * Get registration status
 */
exports.getStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session
    let session = sessions.get(sessionId);
    if (!session) {
      // Try Redis with FIXED syntax
      try {
        const cached = await redis.get(`session:${sessionId}`);
        if (cached) {
          session = JSON.parse(cached);
          sessions.set(sessionId, session);
        }
      } catch (err) {
        logger.warn('Redis fetch failed:', err.message);
      }

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }
    }

    // Build response with helpful hints
    const response = {
      success: true,
      sessionId: session.sessionId,
      status: session.status,
      phoneNumber: session.phoneNumber,
      countryCode: session.countryCode,
      createdAt: session.createdAt,
      lastUpdated: session.lastUpdated
    };

    // Add helpful messages based on status
    if (session.status === 'waiting_for_otp') {
      response.message = 'Ready for OTP. Please submit the 6-digit code via /verify endpoint.';
      response.nextStep = 'POST /api/whatsapp/verify with your OTP';
    } else if (session.status === 'registered') {
      response.message = 'WhatsApp account successfully registered!';
      response.completedAt = session.lastUpdated;
    } else if (session.status === 'failed') {
      response.error = session.error || 'Registration failed';
      response.hint = 'Please start a new registration';
    } else if (session.status === 'pending' || session.status === 'in_progress') {
      response.message = 'Registration in progress. Please wait...';
      response.hint = 'This typically takes 1-2 minutes';
    }

    if (session.error) response.errorDetails = session.error;

    res.json(response);

  } catch (error) {
    logger.error('Status check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status',
      details: error.message
    });
  }
};

/**
 * DELETE /api/whatsapp/cancel/:sessionId
 * Cancel registration
 */
exports.cancelRegistration = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Cancel in registration service
    await registrationService.cancelSession(sessionId);

    // Update session
    session.status = 'cancelled';
    session.lastUpdated = new Date().toISOString();
    sessions.set(sessionId, session);

    // Update Redis with FIXED syntax (setEx instead of setex)
    try {
      await redis.setEx(`session:${sessionId}`, 900, JSON.stringify(session));
    } catch (err) {
      logger.warn('Redis update failed:', err.message);
    }

    logger.info(`Session cancelled: ${sessionId}`);

    res.json({
      success: true,
      message: 'Registration cancelled',
      sessionId
    });

  } catch (error) {
    logger.error('Cancellation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel registration',
      details: error.message
    });
  }
};

/**
 * GET /api/whatsapp/sessions
 * List all active sessions
 */
exports.listSessions = async (req, res) => {
  try {
    const allSessions = Array.from(sessions.values()).map(s => ({
      sessionId: s.sessionId,
      phoneNumber: s.phoneNumber,
      status: s.status,
      createdAt: s.createdAt,
      lastUpdated: s.lastUpdated
    }));

    res.json({
      success: true,
      sessions: allSessions,
      total: allSessions.length,
      activeRegistrations: registrationService.getActiveSessionCount()
    });

  } catch (error) {
    logger.error('Session list failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list sessions',
      details: error.message
    });
  }
};

// ===== BACKGROUND WORKERS =====

/**
 * Verify OTP in background
 */
async function verifyOTPInBackground(sessionId, otp) {
  try {
    logger.info(`[${sessionId}] Starting OTP verification`);

    const result = await registrationService.submitOTP(sessionId, otp);

    // Update session
    const session = sessions.get(sessionId);
    if (session) {
      session.status = 'registered';
      session.completedAt = new Date().toISOString();
      session.lastUpdated = new Date().toISOString();
      sessions.set(sessionId, session);

      // Update Redis with FIXED syntax (setEx instead of setex)
      try {
        await redis.setEx(`session:${sessionId}`, 900, JSON.stringify(session));
      } catch (err) {
        logger.warn('Redis update failed:', err.message);
      }
    }

    logger.info(`[${sessionId}] OTP verification complete: SUCCESS`);

  } catch (error) {
    logger.error(`[${sessionId}] OTP verification failed:`, error);

    // Update session with error
    const session = sessions.get(sessionId);
    if (session) {
      session.status = 'failed';
      session.error = `OTP verification failed: ${error.message}`;
      session.lastUpdated = new Date().toISOString();
      sessions.set(sessionId, session);

      // Update Redis with FIXED syntax (setEx instead of setex)
      try {
        await redis.setEx(`session:${sessionId}`, 900, JSON.stringify(session));
      } catch (err) {
        logger.warn('Redis update failed:', err.message);
      }
    }
  }
}

module.exports = {
  registerAccount: exports.registerAccount,
  verifyOTP: exports.verifyOTP,
  getStatus: exports.getStatus,
  cancelRegistration: exports.cancelRegistration,
  listSessions: exports.listSessions
};
