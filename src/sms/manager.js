const SMSActivateProvider = require('./providers/smsactivate');
const TwilioProvider = require('./providers/twilio');  // Fallback
const logger = require('../utils/logger');

class SMSManager {
  constructor() {
    this.primary = new SMSActivateProvider();
    this.fallback = new TwilioProvider();
  }

  async getNumberWithOTP() {
    try {
      return await this.primary.getNumberWithOTP();
    } catch (error) {
      logger.warn('Primary (SMS-Activate) failed, trying fallback (Twilio)');
      return await this.fallback.getNumberWithOTP();
    }
  }

  async getBalance() {
    return await this.primary.getBalance();
  }
}

module.exports = SMSManager;