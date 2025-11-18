const logger = require('../utils/logger');
const otpRequestQueue = require('./requestQueue');
const emulatorPool = require('../emulator/pool');
const WhatsAppAutomation = require('../whatsapp/automation');
const OTPExtractor = require('../whatsapp/otpExtractor');
const redisClient = require('../database/redis');

// Process OTP requests
otpRequestQueue.process(async (job) => {
  const { requestId, phoneNumber, priority } = job.data;
  
  logger.info('Processing OTP request', { requestId, phoneNumber });
  
  try {
    // Update status to processing
    await redisClient.update(`otp_request:${requestId}`, {
      status: 'processing',
      processingStartedAt: new Date().toISOString()
    });
    
    // Acquire emulator
    const emulator = await emulatorPool.acquireEmulator();
    
    try {
      // Initialize WhatsApp automation
      const automation = new WhatsAppAutomation(emulator);
      const extractor = new OTPExtractor(emulator);
      
      // Launch WhatsApp
      await automation.launchWhatsApp();
      
      // Input phone number
      await automation.inputPhoneNumber(phoneNumber);
      
      // Monitor for OTP
      const otp = await extractor.monitorMessages(60000);
      
      // Update request with OTP
      await redisClient.update(`otp_request:${requestId}`, {
        status: 'completed',
        otp,
        completedAt: new Date().toISOString()
      });
      
      logger.info('OTP request completed', { requestId, otp });
      
      return { success: true, otp };
      
    } finally {
      // Release emulator
      emulatorPool.releaseEmulator(emulator.emulatorId);
    }
    
  } catch (error) {
    logger.error('Error processing OTP request:', error);
    
    await redisClient.update(`otp_request:${requestId}`, {
      status: 'failed',
      error: error.message,
      failedAt: new Date().toISOString()
    });
    
    throw error;
  }
});

module.exports = otpRequestQueue;