require('dotenv').config();
const { remote } = require('webdriverio');
const { initializeSmsClient, getOTPFromActivation } = require('./src/services/smsActivate');
const { handleAlternateVerificationFlow } = require('./src/services/whatsappHelpers');
const { checkEmulator, retry } = require('./src/utils/emulator');

// Logger setup
let logger;
try {
  logger = require('./src/utils/logger');
  console.log('Logger loaded');
} catch (err) {
  console.log('Logger failed, using console:', err.message);
  logger = console;
}

// Appium capabilities
const capabilities = {
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

const wdioLogLevel = 'error';

// Initialize SMS client
let smsClient;
(async () => {
  try {
    if (!process.env.SMS_ACTIVATE_API_KEY) {
      throw new Error('SMS_ACTIVATE_API_KEY missing in .env');
    }

    smsClient = initializeSmsClient(process.env.SMS_ACTIVATE_API_KEY, logger);
    
    if (smsClient && typeof smsClient.then === 'function') {
      smsClient = await smsClient;
    }
    
    logger.info('SMS client initialized successfully');
    const methods = Object.keys(smsClient).filter(k => typeof smsClient[k] === 'function').join(', ');
    logger.info(`Available methods: ${methods}`);
  } catch (err) {
    console.error('Failed to initialize SMS client:', err.message);
    process.exit(1);
  }
})();

async function registerWhatsApp() {
  let driver = null;

  try {
    logger.info('Starting WhatsApp registration...');

    // 1. Check emulator
    logger.info('Step 1/9: Checking emulator...');
    const emulatorReady = await checkEmulator(logger);
    if (!emulatorReady) {
      throw new Error('Emulator not reachable. Make sure MuMu Player is running.');
    }
    logger.info('Emulator ready');

    // 2. Start Appium session
    logger.info('Step 2/9: Starting Appium session...');
    driver = await remote({
      path: '/',
      port: 4723,
      logLevel: wdioLogLevel,
      capabilities
    });
    logger.info('Appium session started');

    // 3. Agree to terms
    logger.info('Step 3/9: Agreeing to terms (if any)...');
    await retry('Agree', async () => {
      const btn = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/eula_accept")');
      await btn.waitForDisplayed({ timeout: 15000 });
      await btn.click();
      await driver.pause(2000);
    }).catch(() => logger.info('Agree step skipped or already accepted'));
    logger.info('Agree step done');

    // 4. Enter country code
    logger.info('Step 4/9: Entering country code...');
    await retry('Country', async () => {
      const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_cc")');
      await el.waitForDisplayed({ timeout: 10000 });
      await el.click();
      await driver.pause(500);
      await el.clearValue();
      await driver.pause(500);
      await el.setValue(process.env.SMS_ACTIVATE_COUNTRY_CODE || '62');
      await driver.pause(500);
    });
    logger.info('Country code entered');

    // 5. Enter phone number
    const localNumber = process.env.SMS_ACTIVATE_NUMBER;
    if (!localNumber) throw new Error('SMS_ACTIVATE_NUMBER missing in .env');
    
    logger.info('Step 5/9: Entering phone number...');
    await retry('Phone', async () => {
      const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_phone")');
      await el.waitForDisplayed({ timeout: 5000 });
      await el.click();
      await driver.pause(300);
      await el.setValue(localNumber);
      await driver.pause(500);
    });
    logger.info('Phone number entered');

    // 6. Click Next
    logger.info('Step 6/9: Clicking Next...');
    await retry('Next', async () => {
      const btn = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_submit")');
      await btn.click();
      await driver.pause(2000);
    });
    logger.info('Next clicked');

    // 7. Confirm phone number
    logger.info('Step 7/9: Confirming phone number...');
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
            logger.info(`Clicked confirm via selector: ${s}`);
            break;
          }
        } catch (e) {}
      }
      if (!confirmed) throw new Error('Could not find confirmation button');
    });
    logger.info('Phone confirmed (verification request should now be sent by WhatsApp)');

    // Handle alternate verification flow (force SMS)
    await handleAlternateVerificationFlow(driver, { log: logger });

    // 8. Start SMS-Activate polling (concurrent)
    logger.info('Step 8/9: Starting SMS-Activate polling for OTP (concurrent)...');
    const otpPromise = getOTPFromActivation(smsClient, logger);

    // 9. Wait for OTP input UI
    logger.info('Step 9/9: Waiting for OTP input to appear in WhatsApp UI...');
    await retry('OTP screen', async () => {
      const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/verify_sms_code_input")');
      await el.waitForDisplayed({ timeout: 60000 });
    });
    logger.info('OTP input detected in UI');

    // 10. Wait for OTP from SMS-Activate
    logger.info('Waiting for OTP value from SMS-Activate (max 3 minutes)...');
    const otpResult = await Promise.race([
      otpPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('OTP wait timed out')), 3 * 60 * 1000))
    ]);

    if (!otpResult || !otpResult.otp) {
      throw new Error('No OTP received from SMS-Activate');
    }

    // 11. Enter OTP
    logger.info('Entering OTP into WhatsApp UI...');
    await retry('Enter OTP', async () => {
      const el = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/verify_sms_code_input")');
      await el.setValue(otpResult.otp);
      await driver.pause(3000);
    });
    logger.info('OTP entered');

    // 12. Profile setup
    try {
      const name = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_name")');
      if (await name.isDisplayed()) {
        await name.setValue('Bot');
        const done = await driver.$('android=new UiSelector().text("Done")');
        await done.click();
        await driver.pause(2000);
        logger.info('Profile setup completed');
      }
    } catch (e) {
      logger.info('No profile setup needed');
    }

    // Skip backup
    try {
      const skip = await driver.$('android=new UiSelector().textContains("Skip")');
      await skip.waitForDisplayed({ timeout: 10000 });
      await skip.click();
      logger.info('Backup skipped');
    } catch (e) {
      logger.info('No backup prompt');
    }

    // Verify registration complete
    try {
      await driver.$('~New chat').waitForDisplayed({ timeout: 20000 });
      logger.info('SUCCESS: WhatsApp fully registered!');
    } catch (e) {
      logger.info('Registration may be complete (New chat not found)');
    }

    await driver.deleteSession();
    process.exit(0);

  } catch (err) {
    logger.error('FAILED:', err && err.message ? err.message : err);
    console.error('Full error:', err);
    if (driver) {
      try { await driver.deleteSession(); } catch (e) {}
    }
    process.exit(1);
  }
}

// Environment check
console.log('Environment check:');
console.log('- EMULATOR_DEVICE:', process.env.EMULATOR_DEVICE || '127.0.0.1:7555');
console.log('- ADB_PATH:', process.env.ADB_PATH ? 'Set' : 'Not set (using default)');
console.log('- SMS_ACTIVATE_API_KEY:', process.env.SMS_ACTIVATE_API_KEY ? 'Set' : 'NOT SET ❌');
console.log('- SMS_ACTIVATE_ACTIVATION_ID:', process.env.SMS_ACTIVATE_ACTIVATION_ID ? 'Set' : 'NOT SET ❌');
console.log('- SMS_ACTIVATE_NUMBER:', process.env.SMS_ACTIVATE_NUMBER ? 'Set' : 'NOT SET ❌');
console.log('- SMS_ACTIVATE_COUNTRY_CODE:', process.env.SMS_ACTIVATE_COUNTRY_CODE || '62 (default)');
console.log('');

registerWhatsApp().catch(err => {
  console.error('Fatal error in registerWhatsApp:', err);
  process.exit(1);
});