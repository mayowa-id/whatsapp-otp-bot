const Queue = require('bull');
const logger = require('../utils/logger');
const config = require('../emulator/config');

// Create queue
const otpRequestQueue = new Queue('otp-requests', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  }
});

// Queue events
otpRequestQueue.on('completed', (job, result) => {
  logger.info('Job completed', {
    jobId: job.id,
    requestId: job.data.requestId
  });
});

otpRequestQueue.on('failed', (job, err) => {
  logger.error('Job failed', {
    jobId: job.id,
    requestId: job.data.requestId,
    error: err.message
  });
});

otpRequestQueue.on('error', (error) => {
  logger.error('Queue error:', error);
});

module.exports = otpRequestQueue;