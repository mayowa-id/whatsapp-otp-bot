require('dotenv').config();
const https = require('https');

const API_KEY = process.env.SMS_ACTIVATE_API_KEY;
const SERVICE = process.env.SMS_ACTIVATE_SERVICE || 'wa'; // WhatsApp by default
const COUNTRY = process.env.SMS_ACTIVATE_COUNTRY || '12'; // USA = 12, adjust as needed

if (!API_KEY) throw new Error('SMS_ACTIVATE_API_KEY missing');

console.log(`\n🔍 SMS-Activate Helper\n`);

function apiRequest(action, params = {}) {
  return new Promise((resolve, reject) => {
    const queryParams = new URLSearchParams({
      api_key: API_KEY,
      action,
      ...params
    });
    
    const url = `https://api.sms-activate.org/stubs/handler_api.php?${queryParams}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

async function main() {
  try {
    // 1. Check balance
    console.log('💰 Checking balance...');
    const balance = await apiRequest('getBalance');
    console.log(`Balance: ${balance}\n`);
    
    if (balance.includes('BAD_KEY')) {
      throw new Error('Invalid API key');
    }

    // 2. Check if there are active activations
    console.log('📋 Checking for active activations...');
    const activeList = await apiRequest('getActiveActivations');
    
    if (activeList && activeList !== 'NO_ACTIVATIONS' && !activeList.includes('ERROR')) {
      console.log('Active activations found:');
      console.log(activeList);
      
      try {
        const activations = JSON.parse(activeList);
        if (activations.activeActivations && activations.activeActivations.length > 0) {
          console.log('\n✅ Found existing activations:\n');
          activations.activeActivations.forEach(act => {
            console.log(`ID: ${act.activationId}`);
            console.log(`Number: +${act.phoneNumber}`);
            console.log(`Service: ${act.service}`);
            console.log(`Status: ${act.activationStatus}`);
            console.log(`---`);
          });
          
          const first = activations.activeActivations[0];
          console.log(`\n📝 Add this to your .env file:`);
          console.log(`SMS_ACTIVATE_ACTIVATION_ID=${first.activationId}`);
          console.log(`SMS_ACTIVATE_NUMBER=${first.phoneNumber.slice(-10)}`);
          console.log(`SMS_ACTIVATE_COUNTRY_CODE=${first.phoneNumber.slice(0, -10)}`);
          return;
        }
      } catch (e) {
        console.log('Could not parse active activations');
      }
    } else {
      console.log('No active activations found\n');
    }

    // 3. Offer to purchase new activation
    console.log('Would you like to purchase a new activation?');
    console.log(`Service: ${SERVICE}`);
    console.log(`Country: ${COUNTRY}\n`);
    
    console.log('💡 To purchase, uncomment the purchase code below and run again\n');
    console.log('Or check your SMS-Activate dashboard for existing activations');

    // Uncomment below to auto-purchase:
    /*
    console.log('🛒 Purchasing new activation...');
    const result = await apiRequest('getNumber', {
      service: SERVICE,
      country: COUNTRY
    });
    
    console.log(`Result: ${result}`);
    
    if (result.startsWith('ACCESS_NUMBER:')) {
      const parts = result.split(':');
      const activationId = parts[1];
      const phoneNumber = parts[2];
      
      console.log('\n✅ NEW ACTIVATION PURCHASED!\n');
      console.log(`Activation ID: ${activationId}`);
      console.log(`Phone Number: +${phoneNumber}\n`);
      console.log('📝 Add these to your .env file:');
      console.log(`SMS_ACTIVATE_ACTIVATION_ID=${activationId}`);
      console.log(`SMS_ACTIVATE_NUMBER=${phoneNumber.slice(-10)}`);
      console.log(`SMS_ACTIVATE_COUNTRY_CODE=${phoneNumber.slice(0, -10)}\n`);
    } else {
      console.error('Failed to purchase:', result);
    }
    */

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();