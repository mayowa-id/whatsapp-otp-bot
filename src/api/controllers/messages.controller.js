const logger = require('../../utils/logger');

// Store for session message data (maps sessionId to messages array)
const sessionMessages = new Map();

/**
 * Store messages from WhatsApp session
 * Called by RegistrationService when messages are extracted
 */
function storeMessages(sessionId, messages) {
  if (!sessionId || !messages) return;
  
  logger.info(`[Messages] Storing ${messages.length} messages for session ${sessionId}`);
  sessionMessages.set(sessionId, {
    messages,
    lastUpdated: new Date().toISOString(),
    count: messages.length
  });
}

/**
 * Extract verification code from message text
 * Looks for: 6-digit codes, OTP patterns, verification codes
 */
function extractVerificationCode(text) {
  if (!text) return null;
  
  // Pattern 1: Any 6-digit number
  const sixDigitMatch = text.match(/\b(\d{6})\b/);
  if (sixDigitMatch) {
    return {
      code: sixDigitMatch[1],
      type: 'verification_code',
      pattern: 'six_digit'
    };
  }
  
  // Pattern 2: "code is XXX" or similar
  const codeMatch = text.match(/code\s*(?:is|:)?\s*(\d{4,8})/i);
  if (codeMatch) {
    return {
      code: codeMatch[1],
      type: 'verification_code',
      pattern: 'code_pattern'
    };
  }
  
  // Pattern 3: "OTP XXXX" or similar
  const otpMatch = text.match(/otp\s*:?\s*(\d{4,8})/i);
  if (otpMatch) {
    return {
      code: otpMatch[1],
      type: 'otp',
      pattern: 'otp_pattern'
    };
  }
  
  // Pattern 4: "confirmation code XXXX"
  const confMatch = text.match(/confirmation\s*code\s*:?\s*(\d{4,8})/i);
  if (confMatch) {
    return {
      code: confMatch[1],
      type: 'confirmation_code',
      pattern: 'confirmation_pattern'
    };
  }
  
  return null;
}

/**
 * Parse messages and extract all verification codes
 */
function parseMessages(messages) {
  const parsed = [];
  
  messages.forEach((msg, index) => {
    const code = extractVerificationCode(msg.text);
    
    parsed.push({
      index,
      text: msg.text,
      code: code ? code.code : null,
      codeType: code ? code.type : null,
      pattern: code ? code.pattern : null,
      timestamp: msg.timestamp || new Date().toISOString(),
      isVerificationMessage: !!code
    });
  });
  
  return parsed;
}

/**
 * GET /whatsapp/messages/:sessionId
 * Get all messages from a WhatsApp session
 */
exports.getMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }
    
    const sessionData = sessionMessages.get(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'No messages found for this session',
        sessionId,
        hint: 'Session may not have any messages yet or session has expired'
      });
    }
    
    // Parse messages to extract codes
    const parsedMessages = parseMessages(sessionData.messages);
    
    // Find verification codes
    const verificationCodes = parsedMessages
      .filter(msg => msg.code)
      .map(msg => ({
        code: msg.code,
        type: msg.codeType,
        source: msg.text,
        timestamp: msg.timestamp
      }));
    
    res.json({
      success: true,
      sessionId,
      totalMessages: sessionData.count,
      messagesWithCodes: verificationCodes.length,
      verificationCodes: verificationCodes.length > 0 ? verificationCodes : null,
      allMessages: parsedMessages,
      lastUpdated: sessionData.lastUpdated
    });
    
  } catch (error) {
    logger.error('Failed to get messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve messages',
      details: error.message
    });
  }
};

/**
 * GET /whatsapp/messages/:sessionId/codes
 * Get only verification codes from messages
 */
exports.getVerificationCodes = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }
    
    const sessionData = sessionMessages.get(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'No messages found for this session',
        sessionId
      });
    }
    
    // Parse and extract codes
    const parsedMessages = parseMessages(sessionData.messages);
    const codes = parsedMessages
      .filter(msg => msg.code)
      .map(msg => ({
        code: msg.code,
        type: msg.codeType,
        pattern: msg.pattern,
        source: msg.text,
        timestamp: msg.timestamp
      }));
    
    if (codes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No verification codes found in messages',
        sessionId,
        totalMessages: sessionData.count
      });
    }
    
    res.json({
      success: true,
      sessionId,
      codesFound: codes.length,
      codes: codes,
      latestCode: codes[codes.length - 1]
    });
    
  } catch (error) {
    logger.error('Failed to get verification codes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve verification codes',
      details: error.message
    });
  }
};

/**
 * GET /whatsapp/messages/:sessionId/latest-code
 * Get the latest verification code (most useful for Instagram)
 */
exports.getLatestCode = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }
    
    const sessionData = sessionMessages.get(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'No messages found for this session',
        sessionId
      });
    }
    
    // Parse and find latest code
    const parsedMessages = parseMessages(sessionData.messages);
    const messagesWithCodes = parsedMessages.filter(msg => msg.code);
    
    if (messagesWithCodes.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No verification codes found in messages',
        sessionId,
        totalMessages: sessionData.count
      });
    }
    
    const latestMessage = messagesWithCodes[messagesWithCodes.length - 1];
    
    res.json({
      success: true,
      sessionId,
      code: latestMessage.code,
      codeType: latestMessage.codeType,
      pattern: latestMessage.pattern,
      source: latestMessage.text,
      timestamp: latestMessage.timestamp,
      message: `Use code ${latestMessage.code} for verification`
    });
    
  } catch (error) {
    logger.error('Failed to get latest code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve latest verification code',
      details: error.message
    });
  }
};

/**
 * POST /whatsapp/messages/:sessionId/update
 * Update messages for a session (called internally by registration service)
 */
exports.updateMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { messages } = req.body;
    
    if (!sessionId || !messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and messages array are required'
      });
    }
    
    storeMessages(sessionId, messages);
    
    // Parse to get codes
    const parsedMessages = parseMessages(messages);
    const codesFound = parsedMessages.filter(msg => msg.code);
    
    res.json({
      success: true,
      sessionId,
      messagesStored: messages.length,
      codesFound: codesFound.length,
      codes: codesFound.map(msg => msg.code)
    });
    
  } catch (error) {
    logger.error('Failed to update messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update messages',
      details: error.message
    });
  }
};

/**
 * GET /whatsapp/messages/:sessionId/search
 * Search messages by keyword or pattern
 */
exports.searchMessages = async (req, res) => {
  try {
    const { sessionId } = req.query;
    const { keyword } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }
    
    if (!keyword) {
      return res.status(400).json({
        success: false,
        error: 'search keyword is required'
      });
    }
    
    const sessionData = sessionMessages.get(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'No messages found for this session',
        sessionId
      });
    }
    
    // Search messages
    const results = sessionData.messages.filter(msg =>
      msg.text.toLowerCase().includes(keyword.toLowerCase())
    );
    
    res.json({
      success: true,
      sessionId,
      keyword,
      resultsFound: results.length,
      messages: results
    });
    
  } catch (error) {
    logger.error('Failed to search messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search messages',
      details: error.message
    });
  }
};

/**
 * DELETE /whatsapp/messages/:sessionId
 * Clear messages for a session
 */
exports.clearMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }
    
    if (sessionMessages.has(sessionId)) {
      sessionMessages.delete(sessionId);
      logger.info(`Cleared messages for session ${sessionId}`);
    }
    
    res.json({
      success: true,
      message: 'Messages cleared',
      sessionId
    });
    
  } catch (error) {
    logger.error('Failed to clear messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear messages',
      details: error.message
    });
  }
};

module.exports.storeMessages = storeMessages;