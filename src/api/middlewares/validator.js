const Joi = require('joi');
const logger = require('../../utils/logger');

const otpRequestSchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)',
      'any.required': 'Phone number is required'
    }),
  countryCode: Joi.string()
    .length(2)
    .optional()
    .messages({
      'string.length': 'Country code must be 2 characters (e.g., US, NG)'
    }),
  priority: Joi.string()
    .valid('low', 'normal', 'high')
    .default('normal')
    .optional()
});

const requestIdSchema = Joi.object({
  requestId: Joi.string()
    .pattern(/^req_[a-zA-Z0-9_]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid request ID format',
      'any.required': 'Request ID is required'
    })
});

const validateOTPRequest = (req, res, next) => {
  const { error, value } = otpRequestSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    logger.warn('Validation failed:', {
      requestId: req.id,
      errors
    });

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors
      },
      requestId: req.id
    });
  }

  req.validatedData = value;
  next();
};

const validateRequestId = (req, res, next) => {
  const { error, value } = requestIdSchema.validate({
    requestId: req.params.requestId
  });

  if (error) {
    logger.warn('Request ID validation failed:', {
      requestId: req.id,
      providedRequestId: req.params.requestId,
      error: error.message
    });

    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST_ID',
        message: error.details[0].message
      },
      requestId: req.id
    });
  }

  req.validatedRequestId = value.requestId;
  next();
};

const sanitizePhoneNumber = (phoneNumber) => {
  return phoneNumber.replace(/[\s\-()]/g, '');
};

const formatPhoneNumber = (phoneNumber, countryCode = null) => {
  let sanitized = sanitizePhoneNumber(phoneNumber);
  
  if (!sanitized.startsWith('+')) {
    if (countryCode) {
      const countryCodes = {
        'US': '1',
        'NG': '234',
        'GB': '44',
        'IN': '91'
      };
      
      const code = countryCodes[countryCode.toUpperCase()];
      if (code) {
        sanitized = `+${code}${sanitized}`;
      } else {
        sanitized = `+${sanitized}`;
      }
    } else {
      sanitized = `+${sanitized}`;
    }
  }
  
  return sanitized;
};

module.exports = {
  validateOTPRequest,
  validateRequestId,
  sanitizePhoneNumber,
  formatPhoneNumber
};