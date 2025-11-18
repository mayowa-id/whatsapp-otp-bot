const SMSActivateProvider = require('./src/sms/providers/smsactivate');
(async () => {
  try {
    const p = new SMSActivateProvider();
    if (!p.api) {
      console.log('No API client available. Manual mode or package failed to load.');
      return;
    }
    console.log('Calling getNumber with some shapes...');
    const tryCalls = [
      () => p.api.getNumber({ service: 'wa', country: Number(p.countryCode) }),
      () => p.api.getNumber({ service: 'whatsapp', country: Number(p.countryCode) }),
      () => p.api.getNumber('wa', String(p.countryCode)),
      () => p.api.getNumber('wa', '0'),
      () => p.api.getNumber('whatsapp', '0'),
    ];
    for (const c of tryCalls) {
      try {
        const res = await c();
        console.log('SUCCESS (call shape):', res);
        // Try getStatus if id present
        const id = res.id || res.activationId || res.activation_id || res.activation || res.smsId;
        if (id && typeof p.api.getStatus === 'function') {
          const st = await p.api.getStatus(id).catch(e => ({ error: e && e.message }));
          console.log('getStatus sample ->', st);
        }
        break;
      } catch (err) {
        console.warn('CALL FAILED:', err && (err.message || err));
      }
    }
  } catch (e) {
    console.error('ERROR creating provider:', e && e.stack ? e.stack : e);
  }
})();
