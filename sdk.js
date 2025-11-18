const fs = require('fs');
const path = require('path');

console.log('Scanning your entire C:\\ drive for Android SDK...\n');

const scanDir = (dir, depth = 0, maxDepth = 4) => {
  if (depth > maxDepth) return;
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (item === 'Sdk' || item.toLowerCase().includes('android')) {
            console.log('FOUND SDK FOLDER:', fullPath);
            const platforms = path.join(fullPath, 'platforms');
            const platformTools = path.join(fullPath, 'platform-tools');
            const buildTools = path.join(fullPath, 'build-tools');
            console.log('   platforms/   →', fs.existsSync(platforms) ? 'YES' : 'NO');
            console.log('   platform-tools/ →', fs.existsSync(platformTools) ? 'YES' : 'NO');
            console.log('   build-tools/ →', fs.existsSync(buildTools) ? 'YES' : 'NO');
            if (fs.existsSync(platforms) && fs.existsSync(platformTools)) {
              console.log('   THIS IS YOUR ANDROID SDK!');
              process.exit(0);
            }
            console.log('');
          }
          scanDir(fullPath, depth + 1, maxDepth);
        }
      } catch (e) {
        // Skip inaccessible folders
      }
    }
  } catch (e) {
    // Skip inaccessible dirs
  }
};

// Start from common roots
['C:\\'].forEach(root => {
  console.log(`Scanning ${root}...`);
  scanDir(root);
});

console.log('No SDK found. Install Android Studio or MuMu SDK.');