// Handle alternate verification flow and force "Receive SMS" path
async function handleAlternateVerificationFlow(driver, opts = {}) {
  const {
    log = console,
    shortPause = 800,
    longPause = 1500,
    maxRetries = 4
  } = opts;

  try {
    await driver.pause(shortPause);

    // Step A: detect "Verify another way" button
    const verifyAnotherSelectors = [
      'android=new UiSelector().textContains("Verify another")',
      'android=new UiSelector().textContains("Verify another way")',
      'android=new UiSelector().textContains("verify another")',
      'android=new UiSelector().textContains("other way")',
      'android=new UiSelector().textContains("Use another")',
      'android=new UiSelector().textContains("Other ways")'
    ];

    let openedOptions = false;
    for (const sel of verifyAnotherSelectors) {
      try {
        const el = await driver.$(sel);
        if (await el.isDisplayed()) {
          log.info(`Found 'verify another way' button via selector: ${sel} — clicking it`);
          await el.click();
          openedOptions = true;
          await driver.pause(longPause);
          break;
        }
      } catch (e) {
        // ignore and try next
      }
    }

    // If no "verify another way" button, try "Continue" button
    if (!openedOptions) {
      const continueSelectors = [
        'android=new UiSelector().text("Continue")',
        'android=new UiSelector().textContains("Continue")',
        'android=new UiSelector().textContains("Continue with")',
        'android=new UiSelector().textContains("Continue (")'
      ];
      for (const sel of continueSelectors) {
        try {
          const el = await driver.$(sel);
          if (await el.isDisplayed()) {
            log.info(`Found 'Continue' via ${sel}; clicking it to reveal options if any`);
            await el.click();
            await driver.pause(longPause);
            for (const test of verifyAnotherSelectors) {
              try { if (await driver.$(test).isDisplayed()) { openedOptions = true; break; } } catch (_) {}
            }
            if (openedOptions) break;
          }
        } catch (e) {}
      }
    }

    // Step B: Choose "Receive SMS" option
    const smsOptionSelectors = [
      'android=new UiSelector().textContains("Receive SMS")',
      'android=new UiSelector().textContains("receive sms")',
      'android=new UiSelector().textContains("Receive text")',
      'android=new UiSelector().textContains("text message")',
      'android=new UiSelector().textContains("SMS")',
      'android=new UiSelector().textContains("Missed call")',
      'android=new UiSelector().textContains("Voice call")'
    ];

    let smsSelected = false;
    for (let attempt = 1; attempt <= maxRetries && !smsSelected; attempt++) {
      for (const sel of smsOptionSelectors) {
        try {
          const el = await driver.$(sel);
          if (await el.isDisplayed()) {
            const text = await el.getText().catch(() => '');
            if (/sms|text|receive/i.test(String(text))) {
              log.info(`Selecting verification method: "${text}" (selector: ${sel})`);
              await el.click();
              await driver.pause(longPause);
              smsSelected = true;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
      if (!smsSelected) {
        log.info(`SMS option not found (attempt ${attempt}/${maxRetries}) — waiting and retrying`);
        await driver.pause(1000 * attempt);
      }
    }

    // Step C: Click final Continue/Confirm button
    if (smsSelected) {
      const finalContinueSelectors = [
        'android=new UiSelector().text("Continue")',
        'android=new UiSelector().textContains("Continue")',
        'android=new UiSelector().textContains("Confirm")',
        'android=new UiSelector().textContains("Done")'
      ];
      for (const sel of finalContinueSelectors) {
        try {
          const btn = await driver.$(sel);
          if (await btn.isDisplayed()) {
            log.info(`Clicking final continue/confirm button via ${sel}`);
            await btn.click();
            await driver.pause(longPause);
            return true;
          }
        } catch (e) {}
      }
      
      try {
        log.info('Final continue button not found; attempting to press center of screen as fallback');
        await driver.touchAction({ action: 'tap', x: 540, y: 1650 });
        await driver.pause(longPause);
        return true;
      } catch (e) {
        log.warn('Fallback tapping failed', e && e.message ? e.message : e);
      }
    } else {
      log.info('SMS option was not selected; alternate verification flow may not be present.');
    }

    return false;

  } catch (err) {
    log.warn('Error in handleAlternateVerificationFlow:', err && err.message ? err.message : err);
    return false;
  }
}

module.exports = {
  handleAlternateVerificationFlow
};