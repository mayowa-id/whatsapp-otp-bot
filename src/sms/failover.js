const logger = require('../utils/logger');

class SMSFailover {
  constructor(providers) {
    this.providers = providers;
    this.currentProviderIndex = 0;
  }

  async executeWithFailover(operation) {
    let lastError;
    
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[this.currentProviderIndex];
      
      try {
        logger.info(`Trying provider: ${provider.constructor.name}`);
        const result = await operation(provider);
        return result;
      } catch (error) {
        logger.warn(`Provider ${provider.constructor.name} failed:`, error.message);
        lastError = error;
        
        // Move to next provider
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
      }
    }
    
    throw new Error(`All SMS providers failed. Last error: ${lastError.message}`);
  }

  async getPhoneNumber(countryCode) {
    return this.executeWithFailover(provider => provider.getPhoneNumber(countryCode));
  }

  async checkMessages(number) {
    return this.executeWithFailover(provider => provider.checkMessages(number));
  }

  async releaseNumber(number) {
    return this.executeWithFailover(provider => provider.releaseNumber(number));
  }
}

module.exports = SMSFailover;