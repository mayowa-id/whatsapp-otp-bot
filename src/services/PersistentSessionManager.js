const logger = require('../utils/logger');

/**
 * Manages persistent WhatsApp sessions
 * Maps phone numbers to active Appium driver instances
 * Survives tunnel disconnections and API restarts
 */
class PersistentSessionManager {
  constructor() {
    // phone -> { driver, sessionId, createdAt, messages, lastMessageCheck }
    this.activeSessions = new Map();
    
    // Store message history per phone
    this.messageHistory = new Map();
    
    // Track last extraction time per phone
    this.lastExtractionTime = new Map();
  }

  /**
   * Register a new WhatsApp session by phone number
   */
  registerSession(phoneNumber, driver, sessionId) {
    if (!phoneNumber || !driver) {
      throw new Error('phoneNumber and driver are required');
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    const sessionData = {
      phoneNumber: normalizedPhone,
      sessionId,
      driver,
      createdAt: new Date().toISOString(),
      status: 'active',
      lastMessageCheck: null,
      messageCount: 0
    };

    this.activeSessions.set(normalizedPhone, sessionData);
    this.messageHistory.set(normalizedPhone, []);
    
    logger.info(`Session registered for phone: ${normalizedPhone} (sessionId: ${sessionId})`);
    
    return sessionData;
  }

  /**
   * Get session by phone number (PRIMARY LOOKUP)
   */
  getSessionByPhone(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    return this.activeSessions.get(normalizedPhone) || null;
  }

  /**
   * Get session by sessionId (LEGACY LOOKUP)
   */
  getSessionBySessionId(sessionId) {
    for (const [phone, session] of this.activeSessions.entries()) {
      if (session.sessionId === sessionId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Store messages for a phone number
   */
  storeMessages(phoneNumber, messages) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    if (!this.messageHistory.has(normalizedPhone)) {
      this.messageHistory.set(normalizedPhone, []);
    }

    const existingMessages = this.messageHistory.get(normalizedPhone);
    
    // Merge with existing, avoiding duplicates
    const mergedMessages = this.mergeMessages(existingMessages, messages);
    
    this.messageHistory.set(normalizedPhone, mergedMessages);
    this.lastExtractionTime.set(normalizedPhone, new Date().toISOString());
    
    logger.info(`Stored ${mergedMessages.length} total messages for phone: ${normalizedPhone}`);
    
    return mergedMessages;
  }

  /**
   * Get messages for a phone number
   */
  getMessages(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    return this.messageHistory.get(normalizedPhone) || [];
  }

  /**
   * Get driver for a phone number (to continue monitoring)
   */
  getDriver(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const session = this.activeSessions.get(normalizedPhone);
    return session ? session.driver : null;
  }

  /**
   * Check if phone has active session
   */
  isSessionActive(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const session = this.activeSessions.get(normalizedPhone);
    return session && session.status === 'active';
  }

  /**
   * Extract messages for a phone (works with or without sessionId)
   */
  async extractMessagesForPhone(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const session = this.activeSessions.get(normalizedPhone);

    if (!session) {
      logger.warn(`No active session for phone: ${normalizedPhone}`);
      return null;
    }

    if (!session.driver) {
      logger.warn(`No driver available for phone: ${normalizedPhone}`);
      return null;
    }

    try {
      logger.info(`Extracting messages for phone: ${normalizedPhone}`);
      
      const driver = session.driver;
      await driver.pause(1000);

      // Get all message elements
      const messageElements = await driver.$$('android=new UiSelector().resourceId("com.whatsapp:id/chat_list_item_line")');
      
      logger.info(`Found ${messageElements.length} message elements for phone: ${normalizedPhone}`);

      const messages = [];

      for (let i = 0; i < messageElements.length; i++) {
        try {
          const messageText = await messageElements[i].getText();
          
          if (messageText && messageText.trim()) {
            messages.push({
              index: i,
              text: messageText,
              timestamp: new Date().toISOString(),
              phoneNumber: normalizedPhone
            });
          }
        } catch (e) {
          logger.warn(`Failed to extract message ${i} for phone ${normalizedPhone}:`, e.message);
        }
      }

      // Store messages
      if (messages.length > 0) {
        this.storeMessages(normalizedPhone, messages);
        session.messageCount = messages.length;
        session.lastMessageCheck = new Date().toISOString();
      }

      return messages;

    } catch (error) {
      logger.error(`Failed to extract messages for phone ${normalizedPhone}:`, error);
      return null;
    }
  }

  /**
   * Normalize phone number (remove special chars, ensure consistent format)
   */
  normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    // Remove +, -, spaces, parentheses
    return phoneNumber.replace(/[^\d]/g, '');
  }

  /**
   * Merge new messages with existing, removing duplicates
   */
  mergeMessages(existing, newMessages) {
    if (!newMessages || newMessages.length === 0) return existing;

    const existingTexts = new Set(existing.map(m => m.text));
    const uniqueNew = newMessages.filter(m => !existingTexts.has(m.text));
    
    return [...existing, ...uniqueNew];
  }

  /**
   * Get session info (for debugging)
   */
  getSessionInfo(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const session = this.activeSessions.get(normalizedPhone);

    if (!session) return null;

    return {
      phoneNumber: normalizedPhone,
      sessionId: session.sessionId,
      status: session.status,
      createdAt: session.createdAt,
      lastMessageCheck: session.lastMessageCheck,
      messageCount: session.messageCount,
      messagesAvailable: this.getMessages(normalizedPhone).length
    };
  }

  /**
   * List all active sessions
   */
  listActiveSessions() {
    const sessions = [];
    
    for (const [phone, session] of this.activeSessions.entries()) {
      sessions.push({
        phoneNumber: phone,
        sessionId: session.sessionId,
        status: session.status,
        createdAt: session.createdAt,
        messagesCount: this.getMessages(phone).length
      });
    }

    return sessions;
  }

  /**
   * Close session (cleanup)
   */
  async closeSession(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const session = this.activeSessions.get(normalizedPhone);

    if (session && session.driver) {
      try {
        await session.driver.deleteSession();
        logger.info(`Closed driver for phone: ${normalizedPhone}`);
      } catch (e) {
        logger.warn(`Failed to close driver for phone ${normalizedPhone}:`, e.message);
      }
    }

    this.activeSessions.delete(normalizedPhone);
    logger.info(`Session closed for phone: ${normalizedPhone}`);
  }

  /**
   * Check if phone exists (regardless of session state)
   */
  phoneExists(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    return this.activeSessions.has(normalizedPhone) || this.messageHistory.has(normalizedPhone);
  }

  /**
   * Get all stored data for a phone (sessions, messages, metadata)
   */
  getFullPhoneData(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    return {
      phoneNumber: normalizedPhone,
      sessionInfo: this.getSessionInfo(normalizedPhone),
      messages: this.getMessages(normalizedPhone),
      lastExtractionTime: this.lastExtractionTime.get(normalizedPhone) || null,
      isActive: this.isSessionActive(normalizedPhone)
    };
  }
}

// Export singleton instance
module.exports = new PersistentSessionManager();