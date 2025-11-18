const logger = require('../utils/logger');
const ElementFinder = require('./elementFinder');
const { extractOTP, sleep } = require('../utils/helpers');

class OTPExtractor {
  constructor(emulator) {
    this.emulator = emulator;
    this.finder = new ElementFinder(emulator);
  }

  /**
   * Extract OTP from current screen
   */
  async extractFromScreen() {
    try {
      logger.debug('Extracting OTP from screen');
      
      const texts = await this.finder.extractAllText();
      
      for (const text of texts) {
        const otp = extractOTP(text);
        if (otp) {
          logger.info('OTP found on screen', { otp });
          return otp;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error extracting OTP:', error);
      throw error;
    }
  }

  /**
   * Monitor screen for OTP
   */
  async monitorForOTP(timeout = 60000, interval = 5000) {
    try {
      logger.info('Monitoring for OTP', { timeout, interval });
      
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        const otp = await this.extractFromScreen();
        
        if (otp) {
          return otp;
        }
        
        await sleep(interval);
      }
      
      throw new Error('OTP not found within timeout');
    } catch (error) {
      logger.error('Error monitoring for OTP:', error);
      throw error;
    }
  }

  /**
   * Extract OTP from specific message
   */
  async extractFromMessage(messageCriteria) {
    try {
      const element = await this.finder.findElement(messageCriteria);
      
      if (element && element.text) {
        return extractOTP(element.text);
      }
      
      return null;
    } catch (error) {
      logger.error('Error extracting OTP from message:', error);
      throw error;
    }
  }
}

module.exports = OTPExtractor;