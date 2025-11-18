// src/emulator/config.js
const path = require('path');
const fs = require('fs');


function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    // Common Android Studio default
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
    // MuMu Player SDK
    path.join('C:', 'Program Files', 'Netease', 'MuMuPlayer', 'nx_device', '12.0', 'sdk'),
    // Fallback: scan everything under AppData\Local
  ];

  // Add any folder under AppData\Local that contains a 'platforms' folder
  const localRoot = path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  try {
    const items = fs.readdirSync(localRoot);
    for (const item of items) {
      const full = path.join(localRoot, item);
      if (fs.statSync(full).isDirectory()) {
        const sdkPath = path.join(full, 'Android', 'Sdk');
        if (fs.existsSync(sdkPath) && fs.existsSync(path.join(sdkPath, 'platforms'))) {
          candidates.push(sdkPath);
        }
      }
    }
  } catch (e) {
    console.warn('Could not scan AppData\\Local:', e.message);
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      const platforms = path.join(candidate, 'platforms');
      const platformTools = path.join(candidate, 'platform-tools');
      if (fs.existsSync(platforms) && fs.existsSync(platformTools)) {
        console.log(`Android SDK found at: ${candidate}`);
        return candidate;
      }
    }
  }

  return null;
}

// Auto-detect SDK
const detectedSdk = findAndroidSdk();
if (!detectedSdk) {
  throw new Error(
    'Android SDK not found! Install Android Studio or set ANDROID_HOME manually.\n' +
    'Expected folders: platforms/, platform-tools/, build-tools/'
  );
}

// Export config
module.exports = {
  // Use detected SDK
  androidHome: detectedSdk,

  // ADB path – override with env if needed
  adbPath: process.env.ADB_PATH || path.join(detectedSdk, 'platform-tools', 'adb.exe'),

  adbTimeout: 30000,
  startTimeout: 60000,
  whatsappPackage: 'com.whatsapp',
  whatsappActivity: '.Main',
  whatsappApkPath: 'C:\\path\\to\\whatsapp.apk', // UPDATE THIS
};