const logger = require('../../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  logger.error('Error caught:', {
    requestId: req.id,
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  let statusCode = error.statusCode || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Internal server error';

  if (err.name === 'CastError') {
    message = 'Resource not found';
    statusCode = 404;
    code = 'NOT_FOUND';
  }

  if (err.code === 11000) {
    message = 'Duplicate field value entered';
    statusCode = 400;
    code = 'DUPLICATE_ERROR';
  }

  if (err.name === 'ValidationError') {
    message = Object.values(err.errors).map(val => val.message).join(', ');
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  }

  if (err.name === 'JsonWebTokenError') {
    message = 'Invalid token';
    statusCode = 401;
    code = 'INVALID_TOKEN';
  }

  if (err.name === 'TokenExpiredError') {
    message = 'Token expired';
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        details: error
      })
    },
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;
module.exports.AppError = AppError;