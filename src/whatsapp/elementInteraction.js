const logger = require('../utils/logger');
const ElementFinder = require('./elementFinder');
const { sleep } = require('../utils/helpers');

class ElementInteraction {
  constructor(emulator) {
    this.emulator = emulator;
    this.finder = new ElementFinder(emulator);
  }

  /**
   * Tap element by criteria
   */
  async tapElement(criteria) {
    try {
      logger.info('Tapping element', { criteria });
      
      const element = await this.finder.findElement(criteria);
      
      if (!element) {
        throw new Error(`Element not found: ${JSON.stringify(criteria)}`);
      }
      
      if (!element.centerX || !element.centerY) {
        throw new Error(`Element has no coordinates: ${JSON.stringify(criteria)}`);
      }
      
      await this.emulator.tap(element.centerX, element.centerY);
      await sleep(1000);
      
      logger.info('Element tapped', { x: element.centerX, y: element.centerY });
      return true;
    } catch (error) {
      logger.error('Error tapping element:', error);
      throw error;
    }
  }

  /**
   * Input text into element
   */
  async inputIntoElement(criteria, text) {
    try {
      logger.info('Inputting text into element', { criteria });
      
      // Tap to focus
      await this.tapElement(criteria);
      await sleep(500);
      
      // Clear existing text first
      await this.clearInput();
      await sleep(300);
      
      // Input new text
      await this.emulator.inputText(text);
      await sleep(1000);
      
      logger.info('Text inputted successfully');
      return true;
    } catch (error) {
      logger.error('Error inputting text:', error);
      throw error;
    }
  }

  /**
   * Clear input field
   */
  async clearInput() {
    try {
      // Select all (Ctrl+A) and delete
      await this.emulator.pressKey(279); // KEYCODE_CTRL_LEFT (may not work on all emulators)
      await this.emulator.pressKey(29);  // KEYCODE_A
      await sleep(200);
      await this.emulator.pressKey(67);  // KEYCODE_DEL
      await sleep(200);
    } catch (error) {
      logger.debug('Clear input failed (may not be supported):', error.message);
    }
  }

  /**
   * Tap and wait for next screen
   */
  async tapAndWait(tapCriteria, waitCriteria, timeout = 30000) {
    try {
      await this.tapElement(tapCriteria);
      await this.finder.waitForElement(waitCriteria, timeout);
      return true;
    } catch (error) {
      logger.error('Error in tapAndWait:', error);
      throw error;
    }
  }

  /**
   * Swipe on screen
   */
  async swipe(startX, startY, endX, endY, duration = 300) {
    try {
      await this.emulator.executeADB(
        `shell input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`
      );
      await sleep(500);
      return true;
    } catch (error) {
      logger.error('Error swiping:', error);
      throw error;
    }
  }

  /**
   * Scroll down
   */
  async scrollDown() {
    // Swipe from bottom to top (scrolls down)
    await this.swipe(360, 1000, 360, 400);
  }

  /**
   * Scroll up
   */
  async scrollUp() {
    // Swipe from top to bottom (scrolls up)
    await this.swipe(360, 400, 360, 1000);
  }
}

module.exports = ElementInteraction;