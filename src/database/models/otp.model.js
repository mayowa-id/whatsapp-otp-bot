const redisClient = require('../redis');
const logger = require('../../utils/logger');
const { STATUS } = require('../../utils/constants');

class OTPModel {
  constructor() {
    this.keyPrefix = 'otp_request:';
    this.defaultExpiry = 600; // 10 minutes
  }

  async create(requestId, data) {
    try {
      const otpRequest = {
        requestId,
        phoneNumber: data.phoneNumber,
        status: STATUS.PENDING,
        priority: data.priority || 'normal',
        createdAt: new Date().toISOString(),
        attempts: 0,
        otp: null,
        error: null,
        emulatorId: null,
        smsNumber: null
      };

      await redisClient.setWithExpiry(
        `${this.keyPrefix}${requestId}`,
        otpRequest,
        this.defaultExpiry
      );

      logger.info('OTP request created', { requestId });
      return otpRequest;
    } catch (error) {
      logger.error('Error creating OTP request:', error);
      throw error;
    }
  }

  async findById(requestId) {
    try {
      const data = await redisClient.get(`${this.keyPrefix}${requestId}`);
      return data;
    } catch (error) {
      logger.error('Error finding OTP request:', error);
      throw error;
    }
  }

  async update(requestId, updates) {
    try {
      const existing = await this.findById(requestId);
      
      if (!existing) {
        throw new Error('Request not found');
      }

      const updated = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await redisClient.setWithExpiry(
        `${this.keyPrefix}${requestId}`,
        updated,
        this.defaultExpiry
      );

      logger.debug('OTP request updated', { requestId, updates });
      return updated;
    } catch (error) {
      logger.error('Error updating OTP request:', error);
      throw error;
    }
  }

  async updateStatus(requestId, status, additionalData = {}) {
    try {
      return await this.update(requestId, {
        status,
        ...additionalData
      });
    } catch (error) {
      logger.error('Error updating status:', error);
      throw error;
    }
  }

  async setOTP(requestId, otp) {
    try {
      return await this.update(requestId, {
        otp,
        status: STATUS.COMPLETED,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error setting OTP:', error);
      throw error;
    }
  }

  async setError(requestId, error) {
    try {
      return await this.update(requestId, {
        error: error.message || error,
        status: STATUS.FAILED,
        failedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error setting error:', error);
      throw error;
    }
  }

  async delete(requestId) {
    try {
      await redisClient.delete(`${this.keyPrefix}${requestId}`);
      logger.info('OTP request deleted', { requestId });
      return true;
    } catch (error) {
      logger.error('Error deleting OTP request:', error);
      throw error;
    }
  }

  async findAll() {
    try {
      const keys = await redisClient.getKeys(`${this.keyPrefix}*`);
      const requests = [];

      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          requests.push(data);
        }
      }

      return requests;
    } catch (error) {
      logger.error('Error finding all requests:', error);
      throw error;
    }
  }

  async countByStatus() {
    try {
      const requests = await this.findAll();
      const counts = {
        total: requests.length,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0
      };

      requests.forEach(req => {
        if (counts.hasOwnProperty(req.status)) {
          counts[req.status]++;
        }
      });

      return counts;
    } catch (error) {
      logger.error('Error counting by status:', error);
      throw error;
    }
  }
}

module.exports = new OTPModel();