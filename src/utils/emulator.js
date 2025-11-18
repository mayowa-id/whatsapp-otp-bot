const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function checkEmulator(logger = console) {
  const dev = (process.env.EMULATOR_DEVICE || '127.0.0.1:7555').trim();
  const adb = process.env.ADB_PATH || 'adb';

  logger.info(`Checking emulator at ${dev}`);
  
  try {
    const { stdout } = await execAsync(`"${adb}" devices`);
    logger.info(`ADB devices output: ${stdout.trim()}`);
    
    if (stdout.includes(dev) && stdout.includes('device')) {
      logger.info('Emulator already connected');
      return true;
    }

    if (dev.startsWith('127.0.0.1:')) {
      logger.info(`Connecting ADB to ${dev}...`);
      await execAsync(`"${adb}" connect ${dev}`).catch((err) => {
        logger.warn('ADB connect error:', err.message);
      });
      await new Promise(r => setTimeout(r, 3000));
      const { stdout: again } = await execAsync(`"${adb}" devices`);
      return again.includes(dev) && again.includes('device');
    }
    return false;
  } catch (error) {
    logger.error('Error checking emulator:', error.message);
    return false;
  }
}

async function retry(name, fn, max = 3) {
  for (let i = 1; i <= max; i++) {
    try {
      await fn();
      if (i > 1) console.log(`${name} OK (try ${i})`);
      return;
    } catch (e) {
      if (i === max) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

module.exports = {
  checkEmulator,
  retry
};