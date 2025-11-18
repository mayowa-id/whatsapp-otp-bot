//  Sleep/delay function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//  Generate unique ID
const generateId = (prefix = 'id') => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

//  Retry async function
const retry = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);
  }
};

/**
  Parse OTP from text

const extractOTP = (text) => {
  const otpRegex = /\b\d{6}\b/g;
  const matches = text.match(otpRegex);
  return matches ? matches[0] : null;
};

/**
 * Validate phone number format
 */
const isValidPhoneNumber = (phoneNumber) => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
};

/**
 * Format duration in human readable format
 */
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};


//  Sanitize object for logging (remove sensitive data)
 
const sanitizeForLogging = (obj) => {
  const sanitized = { ...obj };
  const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'otp'];
  
  for (const key in sanitized) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '***REDACTED***';
    }
  }
  
  return sanitized;
};

module.exports = {
  sleep,
  generateId,
  retry,
  extractOTP,
  isValidPhoneNumber,
  formatDuration,
  sanitizeForLogging
};