require('dotenv').config();
const EmulatorManager = require('./src/emulator/manager');
const logger = require('./src/utils/logger');

async function testMuMu() {
  try {
    logger.info('Testing MuMu Player connection');
    
    const emulator = new EmulatorManager(0);
    
    // Test connection
    logger.info('Connecting to MuMu...');
    await emulator.connectDevice();
    
    const isConnected = await emulator.isDeviceConnected();
    logger.info('Connected:', isConnected);
    
    if (!isConnected) {
      throw new Error('Failed to connect to MuMu Player');
    }
    
    // Check WhatsApp
    logger.info('Checking if WhatsApp is installed...');
    const isInstalled = await emulator.isAppInstalled('com.whatsapp');
    logger.info('WhatsApp installed:', isInstalled);
    
    // Get screen dump
    logger.info('Getting screen dump...');
    const xml = await emulator.getScreenDump();
    logger.info('Screen dump length:', xml.length);
    
    // Take screenshot
    logger.info('Taking screenshot...');
    await emulator.takeScreenshot('C:/Users/NEW USER/Desktop/mumu-test.png');
    
    logger.info('All MuMu tests passed!');
    
  } catch (error) {
    logger.error('MuMu test failed:', error);
  }
}

testMuMu();