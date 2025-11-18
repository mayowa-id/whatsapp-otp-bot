const logger = require('../utils/logger');
const OTPExtractor = require('./otpExtractor');
const { sleep } = require('../utils/helpers');

class WhatsAppMonitor {
  constructor(emulator) {
    this.emulator = emulator;
    this.extractor = new OTPExtractor(emulator);
    this.isMonitoring = false;
    this.callbacks = [];
  }

  /**
   * Add callback for OTP detection
   */
  onOTPDetected(callback) {
    this.callbacks.push(callback);
  }

  /**
   * Start monitoring
   */
  async startMonitoring(interval = 5000) {
    try {
      logger.info('Starting WhatsApp monitoring');
      this.isMonitoring = true;
      
      while (this.isMonitoring) {
        const otp = await this.extractor.extractFromScreen();
        
        if (otp) {
          logger.info('OTP detected', { otp });
          
          // Call all callbacks
          for (const callback of this.callbacks) {
            try {
              await callback(otp);
            } catch (error) {
              logger.error('Error in OTP callback:', error);
            }
          }
        }
        
        await sleep(interval);
      }
      
    } catch (error) {
      logger.error('Error in monitoring:', error);
      this.isMonitoring = false;
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    logger.info('Stopping WhatsApp monitoring');
    this.isMonitoring = false;
  }

  /**
   * Clear callbacks
   */
  clearCallbacks() {
    this.callbacks = [];
  }
}

module.exports = WhatsAppMonitor;