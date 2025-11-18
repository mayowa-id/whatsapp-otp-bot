const express = require('express');
const router = express.Router();
const redisClient = require('../../database/redis');
const logger = require('../../utils/logger');

router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error.message
      }
    });
  }
});

router.get('/health', async (req, res) => {
    try {
    const health = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error.message
      }
    });
  }
});

router.get('/detailed', async (req, res) => {
  try {
    let redisStatus = 'DOWN';
    let redisLatency = null;
    
    if (redisClient.isReady()) {
      const startTime = Date.now();
      await redisClient.set('health_check', 'ok', 10);
      const value = await redisClient.get('health_check');
      redisLatency = Date.now() - startTime;
      redisStatus = value === 'ok' ? 'UP' : 'DOWN';
    }

    const memUsage = process.memoryUsage();
    
    const health = {
      status: redisStatus === 'UP' ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      services: {
        api: {
          status: 'UP',
          uptime: process.uptime()
        },
        redis: {
          status: redisStatus,
          latency: redisLatency ? `${redisLatency}ms` : 'N/A'
        }
      },
      system: {
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        },
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    const statusCode = health.status === 'UP' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.status === 'UP',
      data: health
    });
  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error.message
      }
    });
  }
});

module.exports = router;