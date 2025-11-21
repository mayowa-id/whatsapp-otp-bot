const { EventEmitter } = require('events');
const { remote } = require('webdriverio');
const logger = require('../utils/logger');
const { checkEmulator, retry } = require('../utils/emulator');
const { handleAlternateVerificationFlow } = require('./whatsappHelpers');
const sessionManager = require('./PersistentSessionManager');

class RegistrationService extends EventEmitter {
  constructor() {
    super();
    this.activeSessions = new Map();
    this.capabilities = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'MuMu',
      'appium:udid': process.env.EMULATOR_DEVICE || '127.0.0.1:7555',
      'appium:appPackage': 'com.whatsapp',
      'appium:appActivity': '.Main',
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 300
    };
    this.wdioLogLevel = 'error';
  }

  /**
   * Start registration process (stops at OTP input)
   * Returns when ready for OTP
   */
  async startRegistration(sessionId, phoneNumber, countryCode) {
    let driver = null;

    try {
      logger.info(`[${sessionId}] Starting registration for ${phoneNumber}`);
      
      // Emit status update
      this.emit('status', { sessionId, status: 'checking_emulator' });

      // 1. Check emulator
      const emulatorReady = await checkEmulator(logger);
      if (!emulatorReady) {
        throw new Error('Emulator not reachable. Make sure MuMu Player is running.');
      }
      logger.info(`[${sessionId}] Emulator ready`);

      this.emit('status', { sessionId, status: 'starting_appium' });

      // 2. Start Appium session
      driver = await remote({
        path: '/',
        port: 4723,
        logLevel: this.wdioLogLevel,
        capabilities: this.capabilities
      });
      logger.info(`[${sessionId}] Appium session started`);

      // Register with persistent session manager (FIXED: Do this BEFORE storing in activeSessions)
      sessionManager.registerSession(phoneNumber, driver, sessionId);
      logger.info(`[${sessionId}] Session registered with PersistentSessionManager`);

      // Store driver for later use in this service
      this.activeSessions.set(sessionId, { driver, phoneNumber, countryCode });

      this.emit('status', { sessionId, status: 'agreeing_terms' });

      // 3. Agree to terms
      await retry('Agree', async () => {
        const btn = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/eula_accept")');
        await btn.waitForDisplayed({ timeout: 15000 });
        await btn.click();
        await driver.pause(2000);
      }).catch(() => logger.info(`[${sessionId}] Agree step skipped or already accepted`));

      this.emit('status', { sessionId, status: 'entering_country_code' });

      // 4. Enter country code
      await retry('Country', async () => {
        const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_cc")');
        await el.waitForDisplayed({ timeout: 10000 });
        await el.click();
        await driver.pause(500);
        await el.clearValue();
        await driver.pause(500);
        await el.setValue(countryCode);
        await driver.pause(500);
      });
      logger.info(`[${sessionId}] Country code entered: ${countryCode}`);

      this.emit('status', { sessionId, status: 'entering_phone_number' });

      // 5. Enter phone number (local part only)
      const localNumber = phoneNumber.replace(/^\+/, '').replace(new RegExp(`^${countryCode}`), '');
      await retry('Phone', async () => {
        const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_phone")');
        await el.waitForDisplayed({ timeout: 5000 });
        await el.click();
        await driver.pause(300);
        await el.setValue(localNumber);
        await driver.pause(500);
      });
      logger.info(`[${sessionId}] Phone number entered: ${localNumber}`);

      this.emit('status', { sessionId, status: 'clicking_next' });

      // 6. Click Next
      await retry('Next', async () => {
        const btn = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_submit")');
        await btn.click();
        await driver.pause(2000);
      });

      this.emit('status', { sessionId, status: 'confirming_number' });

      // 7. Confirm phone number
      await retry('Confirm', async () => {
        const selectors = [
          'android=new UiSelector().text("Yes")',
          'android=new UiSelector().textContains("Yes")',
          'android=new UiSelector().resourceId("android:id/button1")'
        ];
        let confirmed = false;
        for (const s of selectors) {
          try {
            const b = await driver.$(s);
            if (await b.isDisplayed()) {
              await b.click();
              await driver.pause(1500);
              confirmed = true;
              logger.info(`[${sessionId}] Confirmed via selector: ${s}`);
              break;
            }
          } catch (e) {}
        }
        if (!confirmed) throw new Error('Could not find confirmation button');
      });

      this.emit('status', { sessionId, status: 'handling_verification_flow' });

      // 8. Handle alternate verification flow
      await handleAlternateVerificationFlow(driver, { log: logger });

      this.emit('status', { sessionId, status: 'waiting_for_otp_screen' });

      // 9. Wait for OTP input screen to appear
      await retry('OTP screen', async () => {
        const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/verify_sms_code_input")');
        await el.waitForDisplayed({ timeout: 60000 });
      });
      
      logger.info(`[${sessionId}] OTP input screen detected - READY FOR OTP`);
      this.emit('status', { sessionId, status: 'waiting_for_otp' });

      return {
        success: true,
        status: 'waiting_for_otp',
        message: 'WhatsApp is ready for OTP input'
      };

    } catch (error) {
      logger.error(`[${sessionId}] Registration failed:`, error);
      
      // Clean up driver
      if (driver) {
        try { 
          await driver.deleteSession(); 
        } catch (e) {
          logger.warn(`[${sessionId}] Error closing driver:`, e.message);
        }
      }
      this.activeSessions.delete(sessionId);

      this.emit('status', { sessionId, status: 'failed', error: error.message });

      throw error;
    }
  }

  /**
   * Submit OTP and complete registration
   */
  async submitOTP(sessionId, otp) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      throw new Error('Session not found. Registration may have timed out.');
    }

    const { driver, phoneNumber } = session;

    try {
      logger.info(`[${sessionId}] Submitting OTP: ${otp}`);
      this.emit('status', { sessionId, status: 'entering_otp' });

      // Enter OTP
      await retry('Enter OTP', async () => {
        const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/verify_sms_code_input")');
        await el.setValue(otp);
        await driver.pause(3000);
      });

      logger.info(`[${sessionId}] OTP entered, waiting for verification...`);
      this.emit('status', { sessionId, status: 'verifying_otp' });

      // Wait a bit for verification
      await driver.pause(5000);

      // Check if OTP was accepted (profile setup screen appears)
      this.emit('status', { sessionId, status: 'setting_up_profile' });

      // Profile setup - Enter random name
      try {
        const nameField = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_name")');
        if (await nameField.isDisplayed()) {
          // Generate random name
          const names = ['Sofia', 'Marco', 'Yuki', 'Amara', 'Chen', 'Lara', 'Ahmed', 'Priya'];
          const randomName = names[Math.floor(Math.random() * names.length)];
          
          await nameField.click();
          await driver.pause(300);
          await nameField.clearValue();
          await driver.pause(200);
          await nameField.setValue(randomName);
          await driver.pause(500);
          logger.info(`[${sessionId}] Entered random name: ${randomName}`);
          
          // Click Done button
          try {
            const doneBtn = await driver.$('android=new UiSelector().text("Done")');
            if (await doneBtn.isDisplayed()) {
              await doneBtn.click();
              await driver.pause(2000);
              logger.info(`[${sessionId}] Name submitted`);
            }
          } catch (e) {
            logger.info(`[${sessionId}] No Done button found after name entry`);
          }
        }
      } catch (e) {
        logger.info(`[${sessionId}] No name input field found`);
      }

      this.emit('status', { sessionId, status: 'skipping_backup' });

      // Skip backup/email prompts
      try {
        const skipBtn = await driver.$('android=new UiSelector().textContains("Skip")');
        if (await skipBtn.isDisplayed()) {
          await skipBtn.click();
          await driver.pause(2000);
          logger.info(`[${sessionId}] Backup/Email skipped`);
        }
      } catch (e) {
        logger.info(`[${sessionId}] No skip button for backup`);
      }

      this.emit('status', { sessionId, status: 'verifying_completion' });

      // Verify registration complete
      try {
        await driver.$('~New chat').waitForDisplayed({ timeout: 20000 });
        logger.info(`[${sessionId}] SUCCESS: WhatsApp fully registered!`);
      } catch (e) {
        logger.info(`[${sessionId}] Registration may be complete (New chat not found)`);
      }

      // Extract messages BEFORE closing driver
      logger.info(`[${sessionId}] WhatsApp setup complete, extracting messages...`);
      const messages = await this.extractAndStoreMessages(sessionId, phoneNumber);
      logger.info(`[${sessionId}] Messages extracted: ${messages ? messages.length : 0}`);

      // Close driver after message extraction
      await driver.deleteSession();
      logger.info(`[${sessionId}] Driver session closed`);
      this.activeSessions.delete(sessionId);

      this.emit('status', { sessionId, status: 'registered' });

      return {
        success: true,
        status: 'registered',
        phoneNumber,
        messagesExtracted: messages ? messages.length : 0,
        message: 'WhatsApp account successfully registered'
      };

    } catch (error) {
      logger.error(`[${sessionId}] OTP submission failed:`, error);

      // Clean up
      if (driver) {
        try { 
          await driver.deleteSession(); 
        } catch (e) {
          logger.warn(`[${sessionId}] Error closing driver:`, e.message);
        }
      }
      this.activeSessions.delete(sessionId);

      this.emit('status', { sessionId, status: 'failed', error: error.message });

      throw error;
    }
  }

  /**
   * Extract and store messages from WhatsApp
   * Stores both in controller AND in PersistentSessionManager
   */
  async extractAndStoreMessages(sessionId, phoneNumber) {
    try {
      if (!this.activeSessions.has(sessionId)) {
        logger.warn(`[${sessionId}] No active session for message extraction`);
        return null;
      }

      const { driver } = this.activeSessions.get(sessionId);
      if (!driver) {
        logger.warn(`[${sessionId}] No driver available for message extraction`);
        return null;
      }

      logger.info(`[${sessionId}] Extracting messages for phone: ${phoneNumber}...`);

      // Wait for UI to settle
      await driver.pause(1000);

      // Get all message elements
      const messageElements = await driver.$$('android=new UiSelector().resourceId("com.whatsapp:id/chat_list_item_line")');
      
      logger.info(`[${sessionId}] Found ${messageElements.length} message elements`);

      const messages = [];

      // Extract each message
      for (let i = 0; i < messageElements.length; i++) {
        try {
          const messageText = await messageElements[i].getText();
          
          if (messageText && messageText.trim()) {
            messages.push({
              index: i,
              text: messageText,
              timestamp: new Date().toISOString()
            });
            
            logger.info(`[${sessionId}] Message ${i + 1}: ${messageText.substring(0, 100)}...`);
          }
        } catch (e) {
          logger.warn(`[${sessionId}] Failed to extract message ${i}:`, e.message);
        }
      }

      // Store messages in PersistentSessionManager (by phone number - PERSISTS!)
      if (messages.length > 0) {
        sessionManager.storeMessages(phoneNumber, messages);
        logger.info(`[${sessionId}] Stored ${messages.length} messages in PersistentSessionManager for phone: ${phoneNumber}`);
        
        // Emit event so API knows messages are available
        this.emit('messages_updated', { sessionId, phoneNumber, count: messages.length });
      } else {
        logger.info(`[${sessionId}] No messages found to extract`);
      }

      return messages;

    } catch (error) {
      logger.error(`[${sessionId}] Failed to extract messages:`, error);
      return null;
    }
  }

  /**
   * Cancel a registration session
   */
  async cancelSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (session && session.driver) {
      try {
        await session.driver.deleteSession();
        logger.info(`[${sessionId}] Driver closed`);
      } catch (e) {
        logger.warn(`[${sessionId}] Error closing driver:`, e.message);
      }
    }

    this.activeSessions.delete(sessionId);
    this.emit('status', { sessionId, status: 'cancelled' });
    
    logger.info(`[${sessionId}] Session cancelled`);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId) {
    return this.activeSessions.has(sessionId);
  }
}

// Export singleton instance
module.exports = new RegistrationService();