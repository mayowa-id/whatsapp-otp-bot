const twilio = require('twilio');
const logger = require('../../utils/logger');

class TwilioProvider {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
    } else {
      throw new Error('Twilio credentials not configured in .env');
    }
  }

  async getPhoneNumber() {
    try {
      logger.info('Using Twilio phone number');
      
      if (!this.phoneNumber) {
        throw new Error('TWILIO_PHONE_NUMBER not set in .env');
      }
      
      return {
        number: this.phoneNumber,
        provider: 'twilio',
        expiresAt: null
      };
    } catch (error) {
      logger.error('Error getting Twilio number:', error);
      throw error;
    }
  }

  async checkMessages(phoneNumber, since = null) {
    try {
      logger.debug('Checking Twilio messages');
      
      const filters = {
        to: phoneNumber
      };
      
      if (since) {
        filters.dateSentAfter = since;
      }
      
      const messages = await this.client.messages.list(filters);
      
      return messages.map(msg => ({
        from: msg.from,
        to: msg.to,
        body: msg.body,
        timestamp: msg.dateCreated
      }));
      
    } catch (error) {
      logger.error('Error checking messages:', error);
      throw error;
    }
  }

  async getLatestOTP(phoneNumber, timeout = 60000) {
    try {
      logger.info('Monitoring Twilio for OTP');
      
      const startTime = Date.now();
      const checkSince = new Date();
      
      while (Date.now() - startTime < timeout) {
        const messages = await this.checkMessages(phoneNumber, checkSince);
        
        for (const msg of messages) {
          // Look for WhatsApp verification messages
          if (msg.body && (
            msg.body.includes('WhatsApp') || 
            msg.body.includes('code') ||
            msg.body.includes('verification')
          )) {
            // Extract 6-digit OTP
            const otpMatch = msg.body.match(/\b\d{6}\b/);
            if (otpMatch) {
              logger.info('OTP found in SMS');
              return otpMatch[0];
            }
          }
        }
        
        logger.debug('No OTP yet, checking again in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      throw new Error('OTP not received within timeout');
      
    } catch (error) {
      logger.error('Error getting OTP:', error);
      throw error;
    }
  }
}

module.exports = TwilioProvider;