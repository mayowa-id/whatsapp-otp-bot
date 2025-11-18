const { remote } = require('webdriverio');
const logger = require('../utils/logger');
const ElementInteraction = require('./elementInteraction');
const ElementFinder = require('./elementFinder');
const OTPExtractor = require('./otpExtractor');
const WhatsAppRegistration = require('./registration');
const { sleep } = require('../utils/helpers');
const config = require('../emulator/config');
const fs = require('fs');
const path = require('path');
const EmulatorManager = require('../emulator/manager');
process.env.ANDROID_HOME = 'C:\\android-sdk';
process.env.ANDROID_SDK_ROOT = 'C:\\android-sdk';
process.env.PATH = `${process.env.PATH};C:\\android-sdk\\platform-tools`;

require('dotenv').config();
const config = require('../emulator/config');
process.env.ANDROID_HOME = config.androidHome; 

const { remote } = require('webdriverio');
const logger = require('../utils/logger');

class WhatsAppAutomation {
  constructor(emulator) {
    this.emulator = emulator;
    this.interaction = new ElementInteraction(emulator);
    this.finder = new ElementFinder(emulator);
    this.extractor = new OTPExtractor(emulator);
    this.registration = new WhatsAppRegistration(emulator);
    this.packageName = config.whatsappPackage;
    this.viewLocal = path.join(process.env.USERPROFILE || '.', 'Desktop', 'view.xml');
    this.driver = null;
  }

  // NEW: Create and return Appium driver
  async createAppiumSession() {
    if (this.driver) return this.driver;

    // Ensure ADB is connected
    const tempMgr = new EmulatorManager('temp-session');
    tempMgr.deviceName = this.emulator.deviceName;
    await tempMgr.ensureAdbConnected();

    const capabilities = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'MuMu',
      'appium:udid': this.emulator.deviceName,
      'appium:appPackage': this.packageName,
      'appium:appActivity': config.whatsappActivity || '.Main',
      'appium:noReset': true,
      'appium:newCommandTimeout': 300
    };

    logger.info(`Creating Appium session for ${this.emulator.deviceName}`);
    this.driver = await remote({
      path: '/',
      port: 4723,
      capabilities
    });

    return this.driver;
  }

  async closeAppiumSession() {
    if (this.driver) {
      await this.driver.deleteSession();
      this.driver = null;
      logger.info('Appium session closed');
    }
  }

  // ... rest of your existing methods (parseBounds, retry, findElementWithRetries, etc.) ...

  async launchWhatsApp() {
    try {
      logger.info('Launching WhatsApp');
      const isInstalled = await this.emulator.isAppInstalled(this.packageName);
      if (!isInstalled) {
        logger.info('WhatsApp not installed, installing...');
        await this.emulator.installApp(config.whatsappApkPath);
      }
      await this.emulator.launchApp(this.packageName, config.whatsappActivity);
      await sleep(4000);
      logger.info('WhatsApp launched successfully');
      return true;
    } catch (error) {
      logger.error('Error launching WhatsApp:', error);
      throw error;
    }
  }

  // ... rest of your methods (registerPhone, inputOtp, etc.) ...

  async stopWhatsApp() {
    try {
      await this.emulator.stopApp(this.packageName);
      await this.closeAppiumSession();
      logger.info('WhatsApp stopped');
      return true;
    } catch (error) {
      logger.error('Error stopping WhatsApp:', error);
      throw error;
    }
  }
}

module.exports = WhatsAppAutomation;