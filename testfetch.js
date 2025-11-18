require('dotenv').config();
const https = require('https');

// === Load from .env ===
const API_KEY = process.env.SMS_ACTIVATE_API_KEY;
const ACTIVATION_ID = process.env.SMS_ACTIVATE_ACTIVATION_ID?.trim();
const NUMBER = process.env.SMS_ACTIVATE_NUMBER?.trim();
const COUNTRY_CODE = process.env.SMS_ACTIVATE_COUNTRY_CODE || '62';

if (!API_KEY) throw new Error('SMS_ACTIVATE_API_KEY missing');
if (!ACTIVATION_ID) throw new Error('SMS_ACTIVATE_ACTIVATION_ID missing');
if (!NUMBER) throw new Error('SMS_ACTIVATE_NUMBER missing');

const fullNumber = `+${COUNTRY_CODE}${NUMBER}`;

console.log(`\nPolling SMS-Activate for OTP...`);
console.log(`Number: ${fullNumber}`);
console.log(`Activation ID: ${ACTIVATION_ID}\n`);

// === Direct API Call Helper ===
function apiRequest(action, id = null) {
  return new Promise((resolve, reject) => {
    let url = `https://api.sms-activate.org/stubs/handler_api.php?api_key=${API_KEY}&action=${action}`;
    if (id) url += `&id=${id}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`API Response [${action}]: ${data}`);
        resolve(data.trim());
      });
    }).on('error', reject);
  });
}

// === Poll OTP ===
async function pollOTP() {
  const maxWait = 180; // 3 minutes
  const start = Date.now();

  while (Date.now() - start < maxWait * 1000) {
    try {
      const status = await apiRequest('getStatus', ACTIVATION_ID);

      // Check for OTP
      if (status.startsWith('STATUS_OK:')) {
        const otp = status.split(':')[1];
        console.log(`\n✅ OTP RECEIVED: ${otp}`);
        
        // Mark as complete
        await apiRequest('setStatus', ACTIVATION_ID).catch(err => 
          console.warn(`Warning: Could not set finish status: ${err.message}`)
        );
        
        return otp;
      }

      // Check for cancellation
      if (status === 'STATUS_CANCEL') {
        throw new Error('Activation was cancelled by SMS-Activate service');
      }

      // Check for waiting status
      if (status === 'STATUS_WAIT_CODE') {
        console.log(`⏳ Waiting for SMS... (${Math.floor((Date.now() - start) / 1000)}s elapsed)`);
      } else if (!status.startsWith('STATUS_')) {
        console.warn(`Unexpected status: ${status}`);
      }

    } catch (err) {
      console.error(`❌ API error: ${err.message}`);
      
      // If it's a critical error, don't continue
      if (err.message.includes('BAD_KEY') || err.message.includes('BAD_ACTION')) {
        throw err;
      }
    }

    await new Promise(r => setTimeout(r, 5000)); // poll every 5s
  }

  // Timeout - try to cancel activation
  try {
    await apiRequest('setStatus', ACTIVATION_ID);
  } catch (err) {
    console.warn(`Could not cancel activation: ${err.message}`);
  }

  throw new Error(`OTP timeout after ${maxWait} seconds`);
}

// === Run ===
(async () => {
  try {
    const otp = await pollOTP();
    console.log(`\n🎉 SUCCESS: OTP = ${otp}\n`);
    process.exit(0);
  } catch (err) {
    console.error(`\n💥 FAILED: ${err.message}\n`);
    process.exit(1);
  }
})();