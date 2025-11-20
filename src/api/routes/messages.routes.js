const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messages.controller');

/**
 * GET /whatsapp/messages/:sessionId
 * Get all messages from a WhatsApp session
 */
router.get('/:sessionId', messagesController.getMessages);

/**
 * GET /whatsapp/messages/:sessionId/codes
 * Get only verification codes from messages
 */
router.get('/:sessionId/codes', messagesController.getVerificationCodes);

/**
 * GET /whatsapp/messages/:sessionId/latest-code
 * Get the latest verification code
 */
router.get('/:sessionId/latest-code', messagesController.getLatestCode);

/**
 * POST /whatsapp/messages/:sessionId/update
 * Update messages for a session (internal use)
 */
router.post('/:sessionId/update', messagesController.updateMessages);

/**
 * POST /whatsapp/messages/:sessionId/search
 * Search messages by keyword
 */
router.post('/:sessionId/search', messagesController.searchMessages);

/**
 * DELETE /whatsapp/messages/:sessionId
 * Clear messages for a session
 */
router.delete('/:sessionId', messagesController.clearMessages);

module.exports = router;