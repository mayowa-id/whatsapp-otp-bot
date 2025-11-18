const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../utils/logger');
const config = require('./config');

const execAsync = promisify(exec);

class EmulatorManager {
  constructor(emulatorId) {
    this.emulatorId = emulatorId;
    this.deviceName = process.env.EMULATOR_DEVICE || '127.0.0.1:16384';
    this.isRunning = false;
    this.isHealthy = false;
    this.restartAttempts = 0;
  }

  // Low-level executor which returns stdout as a trimmed string
  async executeCommand(cmd, opts = {}) {
    try {
      const { stdout, stderr } = await execAsync(cmd, opts);
      if (stderr && !String(stderr).toLowerCase().includes('daemon')) {
        logger.warn(`Command stderr: ${String(stderr).trim()}`);
      }
      return String(stdout || '').trim();
    } catch (error) {
      if (error && error.stdout) {
        return String(error.stdout).trim();
      }
      logger.error(`Command failed: ${cmd}`, error);
      throw error;
    }
  }

  async executeADB(command, timeout = config.adbTimeout) {
    try {
      const fullCommand = `"${config.adbPath}" -s ${this.deviceName} ${command}`;
      logger.debug(`Executing ADB command: ${fullCommand}`);
      const out = await this.executeCommand(fullCommand, { timeout });
      return out;
    } catch (error) {
      logger.error(`ADB command failed: ${command}`, error);
      throw error;
    }
  }

  async isDeviceConnected() {
    try {
      const { stdout } = await execAsync(`"${config.adbPath}" devices`);
      const text = String(stdout || '').trim();
      return text.split('\n').some(line => line.includes(this.deviceName) && line.includes('device'));
    } catch (error) {
      if (error && error.stdout) {
        const text = String(error.stdout || '').trim();
        return text.split('\n').some(line => line.includes(this.deviceName) && line.includes('device'));
      }
      logger.error('Error checking device connection:', error);
      return false;
    }
  }

  async connectDevice() {
    try {
      logger.info(`Connecting to device: ${this.deviceName}`);
      const { stdout } = await execAsync(`"${config.adbPath}" connect ${this.deviceName}`);
      const outText = String(stdout || '').trim();
      logger.debug(`adb connect output: ${outText}`);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const isConnected = await this.isDeviceConnected();
      if (isConnected) {
        logger.info('Device connected successfully');
        return true;
      }

      throw new Error(`Failed to connect to device. adb connect output: ${outText}`);
    } catch (error) {
      logger.error('Error connecting device:', error);
      throw error;
    }
  }

  // NEW: Safe, idempotent ADB connection
  async ensureAdbConnected() {
    if (await this.isDeviceConnected()) {
      logger.debug(`ADB already connected to ${this.deviceName}`);
      return true;
    }

    logger.info(`ADB not connected. Connecting to ${this.deviceName}...`);
    try {
      const fullCmd = `"${config.adbPath}" connect ${this.deviceName}`;
      const { stdout } = await execAsync(fullCmd);
      const output = String(stdout || '').trim();
      logger.debug(`ADB connect output: ${output}`);

      await new Promise(r => setTimeout(r, 2000));

      const connected = await this.isDeviceConnected();
      if (connected) {
        logger.info(`ADB successfully connected to ${this.deviceName}`);
        return true;
      } else {
        throw new Error(`ADB connect failed. Last output: ${output}`);
      }
    } catch (err) {
      logger.error(`Failed to connect ADB to ${this.deviceName}:`, err);
      throw err;
    }
  }

  async waitForDevice(timeout = config.startTimeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isDeviceConnected()) {
        logger.info(`Device ${this.deviceName} ready`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Device ${this.deviceName} failed to connect within ${timeout}ms`);
  }

  async isAppInstalled(packageName) {
    try {
      const output = await this.executeADB(`shell pm list packages ${packageName}`);
      return output.split('\n').some(line => line.trim().endsWith(packageName));
    } catch (error) {
      logger.error('Error checking if app is installed:', error);
      return false;
    }
  }

  async installApp(apkPath) {
    try {
      logger.info(`Installing app from ${apkPath}`);
      await this.executeADB(`install -r "${apkPath}"`, 60000);
      logger.info('App installed successfully');
      return true;
    } catch (error) {
      logger.error('Error installing app:', error);
      throw error;
    }
  }

  async launchApp(packageName, activity) {
    try {
      logger.info(`Launching app ${packageName}`);
      await this.executeADB(`shell am start -n ${packageName}/${activity}`);
      await new Promise(resolve => setTimeout(resolve, 3000));

      const isRunning = await this.isAppRunning(packageName);
      if (isRunning) {
        logger.info(`App ${packageName} launched successfully`);
        return true;
      } else {
        throw new Error('App failed to launch');
      }
    } catch (error) {
      logger.error('Error launching app:', error);
      throw error;
    }
  }

  async isAppRunning(packageName) {
    try {
      const output = await this.executeADB(`shell pidof ${packageName}`);
      return String(output || '').length > 0;
    } catch (error) {
      return false;
    }
  }

  async stopApp(packageName) {
    try {
      await this.executeADB(`shell am force-stop ${packageName}`);
      logger.info(`App ${packageName} stopped`);
      return true;
    } catch (error) {
      logger.error('Error stopping app:', error);
      throw error;
    }
  }

  async inputText(text) {
    try {
      const escapedText = text.replace(/\s/g, '%s');
      await this.executeADB(`shell input text "${escapedText}"`);
      logger.debug(`Input text: ${text}`);
      return true;
    } catch (error) {
      logger.error('Error inputting text:', error);
      throw error;
    }
  }

  async tap(x, y) {
    try {
      await this.executeADB(`shell input tap ${x} ${y}`);
      logger.debug(`Tapped at coordinates: ${x}, ${y}`);
      return true;
    } catch (error) {
      logger.error('Error tapping:', error);
      throw error;
    }
  }

  async pressKey(keycode) {
    try {
      await this.executeADB(`shell input keyevent ${keycode}`);
      logger.debug(`Pressed key: ${keycode}`);
      return true;
    } catch (error) {
      logger.error('Error pressing key:', error);
      throw error;
    }
  }

  async getScreenDump() {
    try {
      await this.executeADB('shell uiautomator dump /sdcard/view.xml');
      const xml = await this.executeADB('shell cat /sdcard/view.xml');
      return xml;
    } catch (error) {
      logger.error('Error getting screen dump:', error);
      throw error;
    }
  }

  async takeScreenshot(savePath) {
    try {
      await this.executeADB('shell screencap -p /sdcard/screenshot.png');
      await this.executeCommand(`"${config.adbPath}" -s ${this.deviceName} pull /sdcard/screenshot.png "${savePath}"`);
      logger.info(`Screenshot saved to ${savePath}`);
      return true;
    } catch (error) {
      logger.error('Error taking screenshot:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const isConnected = await this.isDeviceConnected();
      if (!isConnected) {
        this.isHealthy = false;
        return false;
      }
      await this.executeADB('shell echo "health_check"');
      this.isHealthy = true;
      return true;
    } catch (error) {
      logger.error(`Health check failed for ${this.deviceName}:`, error);
      this.isHealthy = false;
      return false;
    }
  }

  async start() {
    try {
      logger.info(`Starting emulator connection: ${this.deviceName}`);

      // Ensure ADB is connected first
      await this.ensureAdbConnected();

      // Then wait for device to be ready
      await this.waitForDevice();

      this.isRunning = true;
      this.isHealthy = true;

      logger.info(`Emulator ${this.deviceName} ready`);
      return true;
    } catch (error) {
      logger.error('Error starting emulator:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    try {
      logger.info(`Stopping emulator ${this.deviceName}`);

      if (await this.isAppRunning(config.whatsappPackage)) {
        await this.stopApp(config.whatsappPackage);
      }

      this.isRunning = false;
      this.isHealthy = false;

      logger.info(`Emulator ${this.deviceName} stopped`);
      return true;
    } catch (error) {
      logger.error('Error stopping emulator:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      emulatorId: this.emulatorId,
      deviceName: this.deviceName,
      isRunning: this.isRunning,
      isHealthy: this.isHealthy,
      restartAttempts: this.restartAttempts
    };
  }
}

module.exports = EmulatorManager;