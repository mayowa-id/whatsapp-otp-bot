const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('config');
const logger = require('../utils/logger');
const errorHandler = require('./middlewares/errorHandler');

const otpRoutes = require('./routes/otp.routes');
const healthRoutes = require('./routes/health.routes');

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || config.get('server.port') || 3000;
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddlewares() {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging middleware
    if (process.env.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    logger.info('Middlewares initialized');
  }

  setupRoutes() {
    // Health check route
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/otp', otpRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'WhatsApp OTP Bot API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          path: req.path
        }
      });
    });

    logger.info('Routes initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info(`Server running on port ${this.port}`);
          logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
          resolve(this.server);
        });

        this.server.on('error', (error) => {
          logger.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start server:', error);
        reject(error);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = Server;