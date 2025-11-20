const express = require('express');
const router = express.Router();
const otpController = require('../controllers/otp.controller');

// Validate that all controller methods exist and are functions
const requiredMethods = ['registerAccount', 'verifyOTP', 'getStatus', 'cancelRegistration', 'listSessions'];
const missingMethods = requiredMethods.filter(method => typeof otpController[method] !== 'function');

if (missingMethods.length > 0) {
  console.error('ERROR: Missing or invalid controller methods:', missingMethods);
  console.error('Available methods:', Object.keys(otpController));
  throw new Error(`Controller is missing required methods: ${missingMethods.join(', ')}`);
}

// Routes (mounted at /whatsapp in server.js)
router.post('/register', otpController.registerAccount);
router.post('/verify', otpController.verifyOTP);
router.get('/status/:sessionId', otpController.getStatus);
router.delete('/cancel/:sessionId', otpController.cancelRegistration);
router.get('/sessions', otpController.listSessions);

module.exports = router;
