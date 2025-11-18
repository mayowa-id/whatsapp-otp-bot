const util = require('util');

// Robust SMS client initialization
function initializeSmsClient(apiKey, logger = console) {
  const SmsPkgCandidates = [
    { name: 'sms-activate', pkg: (() => { try { return require('sms-activate'); } catch(e){ return null; } })() },
    { name: 'sms-activate-org', pkg: (() => { try { return require('sms-activate-org'); } catch(e){ return null; } })() }
  ];

  const SmsPkgInfo = SmsPkgCandidates.find(x => x.pkg);
  if (!SmsPkgInfo) {
    throw new Error('No sms-activate package found. Install one: npm i sms-activate');
  }
  
  logger.info(`Using SMS package: ${SmsPkgInfo.name}`);

  const pkg = SmsPkgInfo.pkg;
  const attempts = [];

  if (typeof pkg === 'function') attempts.push(() => pkg(apiKey));
  if (pkg && typeof pkg.default === 'function') attempts.push(() => pkg.default(apiKey));
  if (pkg && typeof pkg.create === 'function') attempts.push(() => pkg.create(apiKey));
  if (pkg && typeof pkg.api === 'function') attempts.push(() => pkg.api(apiKey));

  const ctorNames = ['SMSActivate', 'SmsActivate', 'Client', 'SmsActivateClient', 'smsactivate'];
  if (pkg && typeof pkg === 'object') {
    for (const n of ctorNames) {
      if (typeof pkg[n] === 'function') {
        attempts.push(() => {
          try { return new pkg[n](apiKey); } catch (e) { return pkg[n](apiKey); }
        });
      }
    }
  }

  let lastErr = null;
  for (const fn of attempts) {
    try {
      const client = fn();
      if (!client) continue;
      if (typeof client.then === 'function') return client;
      if (typeof client.getStatus === 'function' || typeof client.getNumber === 'function' || typeof client.setStatus === 'function') {
        return client;
      }
      if (client.api && (typeof client.api.getStatus === 'function' || client.api.getNumber === 'function')) {
        return client.api;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  const shape = (() => { try { return Object.keys(pkg || {}).join(', '); } catch(e){ return '<unknown>'; } })();
  throw new Error(`Unable to create SMS client. Package shape: ${shape}. Last error: ${lastErr && lastErr.message}`);
}

// Get OTP from SMS-Activate activation
async function getOTPFromActivation(smsClient, logger = console) {
  const activationId = process.env.SMS_ACTIVATE_ACTIVATION_ID?.trim();
  const localNumber = process.env.SMS_ACTIVATE_NUMBER?.trim();
  const countryCode = process.env.SMS_ACTIVATE_COUNTRY_CODE || '62';

  logger.info('Checking environment variables for activation...');
  logger.info(`Activation ID: ${activationId ? 'Set' : 'Missing'}`);
  logger.info(`Local number: ${localNumber ? 'Set' : 'Missing'}`);
  logger.info(`Country code: ${countryCode}`);

  if (!activationId || !localNumber) {
    throw new Error('SMS_ACTIVATE_ACTIVATION_ID and SMS_ACTIVATE_NUMBER are required in .env');
  }

  const fullNumber = `+${countryCode}${localNumber}`;
  logger.info(`Polling activation ${activationId} for ${fullNumber}`);

  const maxWait = Number(process.env.SMS_ACTIVATE_TIMEOUT_SEC || 180);
  const startedAt = Date.now();

  let attempt = 0;
  while (Date.now() - startedAt < maxWait * 1000) {
    attempt++;
    try {
      const rawStatus = await smsClient.getStatus(activationId);
      logger.info(`Activation raw status (attempt ${attempt}): ${util.inspect(rawStatus, { depth: 3 })}`);

      let code = null;
      let message = null;

      if (typeof rawStatus === 'string') {
        message = rawStatus;
        const m0 = message.match(/\b(\d{4,8})\b/);
        if (m0) {
          const otp = m0[1];
          if (typeof smsClient.setStatus === 'function') {
            try { await smsClient.setStatus(activationId, 6); } catch (_) {}
          }
          logger.info(`OTP extracted from string status: ${otp}`);
          return { number: fullNumber, otp, localNumber, countryCode };
        }
        if (message.includes('STATUS_OK')) code = 'STATUS_OK';
      } else if (typeof rawStatus === 'object' && rawStatus !== null) {
        code = rawStatus.code || rawStatus.status || null;
        message = rawStatus.message || rawStatus.text || rawStatus.sms || rawStatus.body || null;

        const joined = Object.values(rawStatus).map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
        const m1 = joined.match(/\b(\d{4,8})\b/);
        if (m1) {
          const otp = m1[1];
          if (typeof smsClient.setStatus === 'function') {
            try { await smsClient.setStatus(activationId, 6); } catch (_) {}
          }
          logger.info(`OTP extracted from object payload: ${otp}`);
          return { number: fullNumber, otp, localNumber, countryCode };
        }
      }

      if (code === 'STATUS_WAIT_CODE' || (message && /wait/i.test(String(message)))) {
        logger.info('Activation still waiting for code; sleeping before next poll...');
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      if (code === 'STATUS_OK' && message) {
        const m2 = String(message).match(/\b(\d{4,8})\b/);
        if (m2) {
          const otp = m2[1];
          if (typeof smsClient.setStatus === 'function') {
            try { await smsClient.setStatus(activationId, 6); } catch (_) {}
          }
          logger.info(`OTP extracted from STATUS_OK message: ${otp}`);
          return { number: fullNumber, otp, localNumber, countryCode };
        }
      }

      if (code === 'STATUS_CANCEL' || message && /cancel/i.test(String(message))) {
        try { if (typeof smsClient.setStatus === 'function') await smsClient.setStatus(activationId, 3); } catch (_) {}
        throw new Error(`Activation cancelled or errored: ${util.inspect(rawStatus, { depth: 2 })}`);
      }

    } catch (err) {
      logger.error('Error checking activation status:', err && err.stack ? err.stack : err);
    }

    const sleepMs = Math.min(1000 + attempt * 1000, 10000);
    await new Promise(r => setTimeout(r, sleepMs));
  }

  try { if (typeof smsClient.setStatus === 'function') await smsClient.setStatus(activationId, 3); } catch (_) {}
  throw new Error(`OTP timeout after ${maxWait} seconds for activation ${activationId}`);
}

module.exports = {
  initializeSmsClient,
  getOTPFromActivation
};