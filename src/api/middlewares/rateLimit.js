const redisClient = require('../../database/redis');
const logger = require('../../utils/logger');

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000;
    this.maxRequests = options.maxRequests || 100;
    this.keyPrefix = options.keyPrefix || 'ratelimit:';
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
  }

  generateKey(req) {
    const identifier = req.ip || req.connection?.remoteAddress || 'unknown';
    return `${this.keyPrefix}${identifier}`;
  }

  middleware() {
    return async (req, res, next) => {
      try {
        const key = this.generateKey(req);
        const now = Date.now();
        const windowStart = now - this.windowMs;

        const requests = await this.getRequestCount(key, windowStart, now);

        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - requests - 1));
        res.setHeader('X-RateLimit-Reset', new Date(now + this.windowMs).toISOString());

        if (requests >= this.maxRequests) {
          logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path, requests, limit: this.maxRequests });
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests. Please try again later.',
              retryAfter: Math.ceil(this.windowMs / 1000)
            },
            requestId: req.id
          });
        }

        await this.recordRequest(key, now);
        next();
      } catch (error) {
        logger.error('Rate limiter error:', error);
        next();
      }
    };
  }

  async getRequestCount(key, windowStart /*, now*/) {
    try {
      const client = redisClient.getClient();
      await client.zremrangebyscore(key, 0, windowStart);
      const count = await client.zcard(key);
      return count;
    } catch (error) {
      logger.error('Error getting request count:', error);
      return 0;
    }
  }

  async recordRequest(key, timestamp) {
    try {
      const client = redisClient.getClient();
      await client.zadd(key, timestamp, `${timestamp}-${Math.random()}`);
      await client.expire(key, Math.ceil(this.windowMs / 1000) + 1);
      return true;
    } catch (error) {
      logger.error('Error recording request:', error);
      return false;
    }
  }

  async reset(identifier) {
    try {
      const key = `${this.keyPrefix}${identifier}`;
      await redisClient.delete(key);
      logger.info(`Rate limit reset for: ${identifier}`);
      return true;
    } catch (error) {
      logger.error('Error resetting rate limit:', error);
      return false;
    }
  }
}

// Instances
const defaultLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 100,
  keyPrefix: 'ratelimit:default:'
});

const otpLimiterInstance = new RateLimiter({
  windowMs: 3600000,
  maxRequests: 500,
  keyPrefix: 'ratelimit:otp:'
});

// Export a default middleware function for backwards compatibility,
// plus named exports for other uses.
module.exports = defaultLimiter.middleware();            // require('./rateLimit') -> function
module.exports.default = module.exports;                 // also support .default interop
module.exports.RateLimiter = RateLimiter;                // class
module.exports.otpLimiter = otpLimiterInstance.middleware();
module.exports.defaultLimiter = defaultLimiter.middleware();