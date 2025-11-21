const express = require('express');
const router = express.Router();
const phoneMessagesController = require('../controllers/phone-messages.controller');

/**
 * GET /whatsapp/phone/{phoneNumber}/messages
 * Get all messages for a phone number (PRIMARY - PERSISTS ACROSS SESSIONS)
 */
router.get('/:phoneNumber/messages', phoneMessagesController.getMessagesByPhone);

/**
 * GET /whatsapp/phone/{phoneNumber}/latest-code
 * Get latest verification code (RECOMMENDED ENDPOINT)
 */
router.get('/:phoneNumber/latest-code', phoneMessagesController.getLatestCodeByPhone);

/**
 * GET /whatsapp/phone/{phoneNumber}/codes
 * Get all verification codes for a phone
 */
router.get('/:phoneNumber/codes', phoneMessagesController.getCodesByPhone);

/**
 * GET /whatsapp/phone/{phoneNumber}/info
 * Get full account information
 */
router.get('/:phoneNumber/info', phoneMessagesController.getPhoneInfo);

/**
 * GET /whatsapp/phones
 * List all registered phones
 */
router.get('/', phoneMessagesController.listAllPhones);

module.exports = router;