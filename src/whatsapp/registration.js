// const logger = require('../utils/logger');
// const ElementInteraction = require('./elementInteraction');
// const { sleep } = require('../utils/helpers');
// const config = require('../emulator/config');

// class WhatsAppRegistration {
//   constructor(emulator) {
//     this.emulator = emulator;
//     this.interaction = new ElementInteraction(emulator);
//   }

//   /**
//    * Start registration process
//    */
//   async startRegistration(phoneNumber) {
//     try {
//       logger.info('Starting WhatsApp registration');
      
//       // Wait for language selection or agree button
//       await sleep(3000);
      
//       // Try to tap "Agree and Continue" if present
//       try {
//         await this.interaction.tapElement({ text: 'Agree and continue' });
//         await sleep(2000);
//       } catch (error) {
//         logger.debug('Agree button not found, continuing...');
//       }
      
//       // Input phone number
//       await this.inputPhoneNumber(phoneNumber);
      
//       logger.info('Phone number submitted, waiting for verification');
//       return true;
//     } catch (error) {
//       logger.error('Error in registration:', error);
//       throw error;
//     }
//   }

//   /**
//    * Input phone number
//    */
//   async inputPhoneNumber(phoneNumber) {
//     try {
//       logger.info('Inputting phone number');
      
//       // Wait for phone input field
//       await this.interaction.finder.waitForElement({ 
//         resourceId: 'com.whatsapp:id/registration_phone' 
//       }, 15000);
      
//       // Remove + sign
//       const cleanNumber = phoneNumber.replace('+', '');
      
//       // Input phone number
//       await this.interaction.inputIntoElement(
//         { resourceId: 'com.whatsapp:id/registration_phone' },
//         cleanNumber
//       );
      
//       await sleep(2000);
      
//       // Tap Next button
//       await this.interaction.tapElement({ text: 'Next' });
      
//       await sleep(3000);
      
//       // Confirm phone number if prompted
//       try {
//         await this.interaction.tapElement({ text: 'OK' });
//         await sleep(2000);
//       } catch (error) {
//         logger.debug('No confirmation dialog');
//       }
      
//       logger.info('Phone number inputted successfully');
//       return true;
//     } catch (error) {
//       logger.error('Error inputting phone number:', error);
//       throw error;
//     }
//   }

//   /**
//    * Input SMS verification code
//    */
//   async inputVerificationCode(code) {
//     try {
//       logger.info('Inputting verification code');
      
//       // Wait for verification input
//       await this.interaction.finder.waitForElement({ 
//         resourceId: 'com.whatsapp:id/verify_sms_code_input' 
//       }, 15000);
      
//       // Input code
//       await this.interaction.inputIntoElement(
//         { resourceId: 'com.whatsapp:id/verify_sms_code_input' },
//         code
//       );
      
//       await sleep(3000);
      
//       logger.info('Verification code submitted');
//       return true;
//     } catch (error) {
//       logger.error('Error inputting verification code:', error);
//       throw error;
//     }
//   }

//   /**
//    * Complete profile setup
//    */
//   async completeProfileSetup(name = 'Test User') {
//     try {
//       logger.info('Completing profile setup');
      
//       // Wait for name input
//       await this.interaction.finder.waitForElement({ 
//         resourceId: 'com.whatsapp:id/registration_name' 
//       }, 15000);
      
//       // Input name
//       await this.interaction.inputIntoElement(
//         { resourceId: 'com.whatsapp:id/registration_name' },
//         name
//       );
      
//       await sleep(1000);
      
//       // Tap Next
//       await this.interaction.tapElement({ text: 'Next' });
      
//       await sleep(2000);
      
//       logger.info('Profile setup completed');
//       return true;
//     } catch (error) {
//       logger.error('Error completing profile setup:', error);
//       throw error;
//     }
//   }

//   /**
//    * Full registration flow
//    */
//   async register(phoneNumber, smsCode, profileName = 'Test User') {
//     try {
//       logger.info('Starting full registration flow');
      
//       await this.startRegistration(phoneNumber);
//       await this.inputVerificationCode(smsCode);
//       await this.completeProfileSetup(profileName);
      
//       logger.info('Registration completed successfully');
//       return true;
//     } catch (error) {
//       logger.error('Error during registration:', error);
//       throw error;
//     }
//   }
// }

// module.exports = WhatsAppRegistration;


const SMSManager = require('../sms/manager');
const logger = require('../utils/logger');

const smsManager = new SMSManager();

async function registerWhatsApp(driver, emulator) {
  // ... Agree and Continue code ...

  // Get number + OTP from SMS-Activate
  const { number, otp } = await smsManager.getNumberWithOTP();
  logger.info(`Using number: ${number}, OTP: ${otp}`);

  // Parse: +62 81234567890 → 81234567890 (local)
  const localNumber = number.replace(/^\+62/, '');

  // Enter local number
  const phoneInput = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_phone")');
  await phoneInput.setValue(localNumber);

  // Click Next
  const nextBtn = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/registration_submit")');
  await nextBtn.click();

  // Click "Yes" on confirmation
  const yesBtn = await driver.$('android=new UiSelector().text("Yes")');
  await yesBtn.click();

  // Enter OTP
  const otpInput = await driver.$('android=new UiSelector().resourceId("com.whatsapp:id/verify_sms_code_input")');
  await otpInput.setValue(otp);

  // ... rest of flow (skip backup, etc.) ...

  return { number, otp };
}

module.exports = { registerWhatsApp };