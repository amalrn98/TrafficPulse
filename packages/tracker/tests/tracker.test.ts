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

test('Tracker - Behavioral signals are NOT collected by default (opt-in required)', () => {
  const tracker = new TrafficPulseTracker({ siteId: 'test-site', autoTrack: false });
  const signals = tracker.collectSignals();
  assert.strictEqual(signals.clientSignals.mouseEntropy, undefined, 'mouseEntropy should not be collected by default');
  assert.strictEqual(signals.clientSignals.scrollEntropy, undefined, 'scrollEntropy should not be collected by default');
  assert.strictEqual(signals.clientSignals.webglRenderer, undefined, 'webglRenderer should not be collected by default');
  tracker.teardown();
});

test('Tracker - Behavioral signals are collected when enableBehavior=true', () => {
  const tracker = new TrafficPulseTracker({ siteId: 'test-site', enableBehavior: true, autoTrack: false });
  const signals = tracker.collectSignals();
  assert.ok(signals.clientSignals.mouseEntropy !== undefined, 'mouseEntropy should be defined when enableBehavior=true');
  tracker.teardown();
});

test('Tracker - Legacy disableBiometrics=false alias enables behavioral signals', () => {
  const tracker = new TrafficPulseTracker({ siteId: 'test-site', disableBiometrics: false, autoTrack: false });
  const signals = tracker.collectSignals();
  assert.ok(signals.clientSignals.mouseEntropy !== undefined, 'legacy disableBiometrics=false should enable biometrics');
  tracker.teardown();
});

test('Tracker - Honors Global Privacy Control (GPC) opt-out', () => {
  (global as any).window = {
    navigator: { userAgent: 'Mozilla/5.0 TestBrowser/1.0', globalPrivacyControl: true },
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  (global as any).document = { addEventListener: () => {}, removeEventListener: () => {} };

  try {
    const tracker = new TrafficPulseTracker({ siteId: 'site_gpc_01', autoTrack: false, respectDnt: true });
    assert.strictEqual(tracker.isOptedOut(), true, 'Tracker must be opted out when globalPrivacyControl is true');
    tracker.flush(); // verify no exception
    tracker.teardown();
  } finally {
    delete (global as any).window;
    delete (global as any).document;
  }
});

