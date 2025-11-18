const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.logger = null;
  }

  setLogger(logger) {
    this.logger = logger;
  }

  log(level, message, meta) {
    if (this.logger) {
      this.logger[level](message, meta);
    } else {
      console.log(`[${level.toUpperCase()}]`, message, meta || '');
    }
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const redisConfig = {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            this.log('warn', `Redis reconnecting... Attempt ${times}`);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false
        };

        this.client = new Redis(redisConfig);

        this.client.on('connect', () => {
          this.log('info', 'Redis: Connecting...');
        });

        this.client.on('ready', () => {
          this.isConnected = true;
          this.log('info', 'Redis: Connected and ready');
          resolve(this.client);
        });

        this.client.on('error', (error) => {
          this.isConnected = false;
          this.log('error', 'Redis error:', error);
          if (!this.client) {
            reject(error);
          }
        });

        this.client.on('close', () => {
          this.isConnected = false;
          this.log('warn', 'Redis: Connection closed');
        });

        this.client.on('reconnecting', () => {
          this.log('info', 'Redis: Reconnecting...');
        });

      } catch (error) {
        this.log('error', 'Failed to initialize Redis client:', error);
        reject(error);
      }
    });
  }

  async disconnect() {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.quit(() => {
          this.isConnected = false;
          this.log('info', 'Redis: Disconnected');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async set(key, value, expirySeconds = null) {
    try {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }

      if (expirySeconds) {
        await this.client.setex(key, expirySeconds, value);
      } else {
        await this.client.set(key, value);
      }

      this.log('debug', `Redis SET: ${key}`);
      return true;
    } catch (error) {
      this.log('error', `Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      
      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      this.log('error', `Redis GET error for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key) {
    try {
      const result = await this.client.del(key);
      this.log('debug', `Redis DELETE: ${key}`);
      return result > 0;
    } catch (error) {
      this.log('error', `Redis DELETE error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key) {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.log('error', `Redis EXISTS error for key ${key}:`, error);
      throw error;
    }
  }

  async setWithExpiry(key, value, seconds) {
    return this.set(key, value, seconds);
  }

  async getKeys(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      return keys;
    } catch (error) {
      this.log('error', `Redis KEYS error for pattern ${pattern}:`, error);
      throw error;
    }
  }

  async increment(key) {
    try {
      const result = await this.client.incr(key);
      return result;
    } catch (error) {
      this.log('error', `Redis INCR error for key ${key}:`, error);
      throw error;
    }
  }

  async decrement(key) {
    try {
      const result = await this.client.decr(key);
      return result;
    } catch (error) {
      this.log('error', `Redis DECR error for key ${key}:`, error);
      throw error;
    }
  }

  async setHash(key, field, value) {
    try {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      await this.client.hset(key, field, value);
      return true;
    } catch (error) {
      this.log('error', `Redis HSET error for key ${key}:`, error);
      throw error;
    }
  }

  async getHash(key, field) {
    try {
      const value = await this.client.hget(key, field);
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      this.log('error', `Redis HGET error for key ${key}:`, error);
      throw error;
    }
  }

  async getAllHash(key) {
    try {
      const hashData = await this.client.hgetall(key);
      const parsed = {};
      
      for (const [field, value] of Object.entries(hashData)) {
        try {
          parsed[field] = JSON.parse(value);
        } catch {
          parsed[field] = value;
        }
      }
      
      return parsed;
    } catch (error) {
      this.log('error', `Redis HGETALL error for key ${key}:`, error);
      throw error;
    }
  }

  getClient() {
    return this.client;
  }

  isReady() {
    return this.isConnected;
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;