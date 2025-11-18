const logger = require('../../utils/logger');

class SMSActivateProvider {
  constructor() {
    this.manualNumber = process.env.SMS_ACTIVATE_MANUAL_NUMBER?.trim();
    this.countryCode  = process.env.SMS_ACTIVATE_COUNTRY_CODE || '62';

    if (!this.manualNumber) {
      throw new Error('SMS_ACTIVATE_MANUAL_NUMBER is required in .env');
    }

    logger.info(`Manual mode – using +${this.countryCode}${this.manualNumber}`);
  }

  /** Returns { number: '+62851...', otp: '123456' } */
  async getNumberWithOTP() {
    const fullNumber = `+${this.countryCode}${this.manualNumber}`;

    // Show user where to look
    console.log('\n');
    console.log('============================================================');
    console.log('   SMS-Activate Dashboard: https://sms-activate.org/en/myactivations');
    console.log(`   Number: ${fullNumber}`);
    console.log('   Wait for WhatsApp SMS → copy the 6-digit OTP → paste below');
    console.log('============================================================\n');

    const otp = await this._waitForManualOTP();
    return { number: fullNumber, otp };
  }

  /** Simple stdin prompt – repeats on invalid input */
  _waitForManualOTP() {
    return new Promise((resolve) => {
      const ask = () => {
        process.stdout.write('Enter OTP: ');
        process.stdin.once('data', (data) => {
          const code = data.toString().trim();
          if (/^\d{6}$/.test(code)) {
            console.log(`OTP accepted: ${code}\n`);
            resolve(code);
          } else {
            console.log('Invalid OTP – must be 6 digits. Try again.');
            ask();
          }
        });
      };
      ask();
    });
  }
}

module.exports = SMSActivateProvider;