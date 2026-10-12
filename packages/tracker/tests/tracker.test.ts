import { test } from 'node:test';
import assert from 'node:assert';
import { TrafficPulseTracker } from '../src/index';

test('Tracker - Instantiates safely in non-browser / SSR environment', () => {
  const tracker = new TrafficPulseTracker({ siteId: 'site_ssr_01', autoTrack: false });
  assert.ok(tracker);
  assert.strictEqual(tracker.isOptedOut(), true); // window is undefined in standard Node.js
});

test('Tracker - Collects structured telemetry payload with idempotency key', () => {
  // Mock minimal window/document environment
  const mockStorage: Record<string, string> = {};
  (global as any).window = {
    navigator: { userAgent: 'Mozilla/5.0 TestBrowser/1.0', webdriver: false },
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: (k: string) => mockStorage[k] || null,
      setItem: (k: string, v: string) => { mockStorage[k] = v; },
      removeItem: (k: string) => { delete mockStorage[k]; },
    },
  };
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).location = { pathname: '/pricing' };

  try {
    const tracker = new TrafficPulseTracker({
      siteId: 'site_client_01',
      autoTrack: false,
      respectDnt: false,
    });

    const payload = tracker.collectSignals();

    assert.strictEqual(payload.siteId, 'site_client_01');
    assert.strictEqual(payload.path, '/pricing');
    assert.strictEqual(payload.method, 'GET');
    assert.ok(payload.idempotencyKey.startsWith('tp_'));
    assert.ok(payload.timestamp);
    assert.strictEqual(payload.clientSignals.webdriver, false);
    assert.strictEqual(payload.clientSignals.screenConsistency, true);
    assert.strictEqual(payload.clientSignals.viewportWidth, 1200);

    // Test Do Not Track / Opt-out
    tracker.optOut();
    assert.strictEqual(mockStorage['trafficpulse_opt_out'], '1');
    assert.strictEqual(tracker.isOptedOut(), true);

    tracker.optIn();
    assert.strictEqual(mockStorage['trafficpulse_opt_out'], undefined);
    assert.strictEqual(tracker.isOptedOut(), false);

    // Clean teardown
    tracker.teardown();
  } finally {
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).location;
  }
});

test('Tracker - Omits biometrics when disableBiometrics is enabled', () => {
  (global as any).window = {
    navigator: { userAgent: 'Mozilla/5.0 PrivacyBrowser/1.0' },
    screen: { width: 1024, height: 768, colorDepth: 24 },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).location = { pathname: '/' };

  try {
    const tracker = new TrafficPulseTracker({
      siteId: 'site_privacy_01',
      autoTrack: false,
      respectDnt: false,
      disableBiometrics: true,
    });

    const payload = tracker.collectSignals();
    assert.strictEqual(payload.clientSignals.mouseEntropy, undefined);
    assert.strictEqual(payload.clientSignals.scrollEntropy, undefined);

    tracker.teardown();
  } finally {
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).location;
  }
});
