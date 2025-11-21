const logger = require('../../utils/logger');
const sessionManager = require('../../services/PersistentSessionManager');

/**
 * Extract verification code from message text
 */
function extractVerificationCode(text) {
  if (!text) return null;
  
  // Pattern 1: Six digits
  const sixDigitMatch = text.match(/\b(\d{6})\b/);
  if (sixDigitMatch) {
    return {
      code: sixDigitMatch[1],
      type: 'verification_code',
      pattern: 'six_digit'
    };
  }
  
  // Pattern 2: code is/: XXX
  const codeMatch = text.match(/code\s*(?:is|:)?\s*(\d{4,8})/i);
  if (codeMatch) {
    return {
      code: codeMatch[1],
      type: 'verification_code',
      pattern: 'code_pattern'
    };
  }
  
  // Pattern 3: OTP
  const otpMatch = text.match(/otp\s*:?\s*(\d{4,8})/i);
  if (otpMatch) {
    return {
      code: otpMatch[1],
      type: 'otp',
      pattern: 'otp_pattern'
    };
  }
  
  // Pattern 4: confirmation code
  const confMatch = text.match(/confirmation\s*code\s*:?\s*(\d{4,8})/i);
  if (confMatch) {
    return {
      code: confMatch[1],
      type: 'confirmation_code',
      pattern: 'confirmation_pattern'
    };
  }
  
  return null;
}

/**
 * Parse messages and extract codes
 */
function parseMessages(messages) {
  return messages.map((msg, index) => {
    const code = extractVerificationCode(msg.text);
    
    return {
      index,
      text: msg.text,
      code: code ? code.code : null,
      codeType: code ? code.type : null,
      pattern: code ? code.pattern : null,
      timestamp: msg.timestamp || new Date().toISOString(),
      isVerificationMessage: !!code
    };
  });
}

/**
 * GET /whatsapp/phone/{phoneNumber}/messages
 * Get all messages for a phone number (PRIMARY ENDPOINT - PERSISTS ACROSS SESSIONS)
 */
exports.getMessagesByPhone = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber is required'
      });
    }

    const normalizedPhone = sessionManager.normalizePhoneNumber(phoneNumber);
    
    // Check if phone has any data
    if (!sessionManager.phoneExists(normalizedPhone)) {
      return res.status(404).json({
        success: false,
        error: 'No WhatsApp account found for this phone number',
        phoneNumber: normalizedPhone,
        hint: 'Register WhatsApp first with this number'
      });
    }

    // Try to extract fresh messages if session is active
    if (sessionManager.isSessionActive(normalizedPhone)) {
      await sessionManager.extractMessagesForPhone(normalizedPhone);
    }

    // Get stored messages
    const messages = sessionManager.getMessages(normalizedPhone);
    const parsedMessages = parseMessages(messages);
    const verificationCodes = parsedMessages
      .filter(msg => msg.code)
      .map(msg => ({
        code: msg.code,
        type: msg.codeType,
        source: msg.text,
        timestamp: msg.timestamp
      }));

    const sessionInfo = sessionManager.getSessionInfo(normalizedPhone);

    res.json({
      success: true,
      phoneNumber: normalizedPhone,
      sessionStatus: sessionInfo ? sessionInfo.status : 'no_session',
      totalMessages: messages.length,
      messagesWithCodes: verificationCodes.length,
      verificationCodes: verificationCodes.length > 0 ? verificationCodes : null,
      allMessages: parsedMessages,
      sessionInfo,
      note: 'Data persists across API restarts and tunnel changes'
    });
    
  } catch (error) {
    logger.error('Failed to get messages by phone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve messages',
      details: error.message
    });
  }
};

/**
 * GET /whatsapp/phone/{phoneNumber}/latest-code
 * Get latest verification code by phone number
 */
exports.getLatestCodeByPhone = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber is required'
      });
    }

    const normalizedPhone = sessionManager.normalizePhoneNumber(phoneNumber);

    if (!sessionManager.phoneExists(normalizedPhone)) {
      return res.status(404).json({
        success: false,
        error: 'No WhatsApp account found for this phone number',
        phoneNumber: normalizedPhone
      });
    }

    // Extract fresh if active
    if (sessionManager.isSessionActive(normalizedPhone)) {
      await sessionManager.extractMessagesForPhone(normalizedPhone);
    }

    const messages = sessionManager.getMessages(normalizedPhone);
    const parsedMessages = parseMessages(messages);
    const messagesWithCodes = parsedMessages.filter(msg => msg.code);

    if (messagesWithCodes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No verification codes found',
        phoneNumber: normalizedPhone,
        totalMessages: messages.length
      });
    }

    const latestMessage = messagesWithCodes[messagesWithCodes.length - 1];

    res.json({
      success: true,
      phoneNumber: normalizedPhone,
      code: latestMessage.code,
      codeType: latestMessage.codeType,
      pattern: latestMessage.pattern,
      source: latestMessage.text,
      timestamp: latestMessage.timestamp,
      message: `Use code ${latestMessage.code} for verification`,
      note: 'Works even if tunnel changed or API restarted'
    });
    
  } catch (error) {
    logger.error('Failed to get latest code by phone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve verification code',
      details: error.message
    });
  }
};

/**
 * GET /whatsapp/phone/{phoneNumber}/info
 * Get full information about a phone's account
 */
exports.getPhoneInfo = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber is required'
      });
    }

    const normalizedPhone = sessionManager.normalizePhoneNumber(phoneNumber);
    const fullData = sessionManager.getFullPhoneData(normalizedPhone);

    if (!fullData.sessionInfo && fullData.messages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No account data found for this phone',
        phoneNumber: normalizedPhone
      });
    }

    res.json({
      success: true,
      phoneNumber: normalizedPhone,
      accountData: fullData
    });
    
  } catch (error) {
    logger.error('Failed to get phone info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve phone information',
      details: error.message
    });
  }
};

/**
 * GET /whatsapp/phone/{phoneNumber}/codes
 * Get all verification codes by phone
 */
exports.getCodesByPhone = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber is required'
      });
    }

    const normalizedPhone = sessionManager.normalizePhoneNumber(phoneNumber);

    if (!sessionManager.phoneExists(normalizedPhone)) {
      return res.status(404).json({
        success: false,
        error: 'No account found',
        phoneNumber: normalizedPhone
      });
    }

    if (sessionManager.isSessionActive(normalizedPhone)) {
      await sessionManager.extractMessagesForPhone(normalizedPhone);
    }

    const messages = sessionManager.getMessages(normalizedPhone);
    const parsedMessages = parseMessages(messages);
    const codes = parsedMessages
      .filter(msg => msg.code)
      .map(msg => ({
        code: msg.code,
        type: msg.codeType,
        pattern: msg.pattern,
        source: msg.text,
        timestamp: msg.timestamp
      }));

    if (codes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No verification codes found',
        phoneNumber: normalizedPhone
      });
    }

    res.json({
      success: true,
      phoneNumber: normalizedPhone,
      codesFound: codes.length,
      codes,
      latestCode: codes[codes.length - 1]
    });
    
  } catch (error) {
    logger.error('Failed to get codes by phone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve codes',
      details: error.message
    });
  }
};

/**
 * GET /whatsapp/phones
 * List all phone numbers with active or stored data
 */
exports.listAllPhones = async (req, res) => {
  try {
    const sessions = sessionManager.listActiveSessions();

    res.json({
      success: true,
      totalPhones: sessions.length,
      phones: sessions.map(s => ({
        phoneNumber: s.phoneNumber,
        sessionId: s.sessionId,
        status: s.status,
        createdAt: s.createdAt,
        messagesCount: s.messagesCount,
        link: `/whatsapp/phone/${s.phoneNumber}/latest-code`
      }))
    });
    
  } catch (error) {
    logger.error('Failed to list phones:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list phones',
      details: error.message
    });
  }
};

/**
 * Export for internal use
 */
module.exports.extractVerificationCode = extractVerificationCode;
module.exports.parseMessages = parseMessages;