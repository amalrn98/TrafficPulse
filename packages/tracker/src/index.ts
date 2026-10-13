/**
 * TrafficPulse Micro-Sensor Tracker
 * Privacy-preserving, zero-dependency client telemetry sensor with opt-out,
 * idempotency, and clean teardown support.
 */

export interface TrackerConfig {
  siteId: string;
  apiHost?: string;
  autoTrack?: boolean;
  respectDnt?: boolean;
  /**
   * Set to true to enable behavioral signal collection (mouse entropy, scroll entropy, WebGL renderer).
   * Default: false (opt-in required for GDPR/ePrivacy compliance).
   */
  enableBehavior?: boolean;
  /**
   * @deprecated Use enableBehavior instead. disableBiometrics=false is equivalent to enableBehavior=true.
   */
  disableBiometrics?: boolean;
}

export interface CollectedTelemetry {
  siteId: string;
  idempotencyKey: string;
  path: string;
  method: string;
  userAgent: string;
  timestamp: string;
  clientSignals: {
    webdriver: boolean;
    hasChromeObject: boolean;
    hasPlugins: boolean;
    screenConsistency: boolean;
    webglRenderer?: string;
    mouseEntropy?: number;
    scrollEntropy?: number;
    interactionCount: number;
    dwellTimeMs: number;
    viewportWidth: number;
    viewportHeight: number;
  };
}

export class TrafficPulseTracker {
  private config: TrackerConfig;
  private startTime: number = Date.now();
  private mouseCoords: Array<{ x: number; y: number; t: number }> = [];
  private scrollDeltas: number[] = [];
  private interactionCount: number = 0;
  private hasDispatched: boolean = false;
  private currentIdempotencyKey: string = '';
  private isDestroyed: boolean = false;
  private listeners: Array<{ target: EventTarget; type: string; handler: EventListenerOrEventListenerObject }> = [];

  constructor(customConfig?: Partial<TrackerConfig>) {
    this.config = {
      ...this.parseScriptAttributes(),
      ...customConfig,
    };

    this.currentIdempotencyKey = this.generateIdempotencyKey();

    if (typeof window !== 'undefined' && !this.isOptedOut()) {
      this.initListeners();
      if (this.config.autoTrack !== false && this.config.siteId) {
        // Schedule non-blocking telemetry flush after initial page settle
        setTimeout(() => {
          if (!this.hasDispatched && !this.isDestroyed) {
            this.flush();
          }
        }, 2000);
      }
    }
  }

  private generateIdempotencyKey(): string {
    const rand = Math.random().toString(36).substring(2, 9);
    return `tp_${Date.now()}_${rand}`;
  }

  /**
   * Checks whether the user has opted out via Do Not Track (DNT), GPC, or explicit opt-out preference.
   */
  public isOptedOut(): boolean {
    if (typeof window === 'undefined') return true;

    // Check localStorage opt-out flag
    try {
      if (window.localStorage && window.localStorage.getItem('trafficpulse_opt_out') === '1') {
        return true;
      }
    } catch {
      // Storage access blocked by browser privacy policy
    }

    // Check Do Not Track and Global Privacy Control if configured
    if (this.config.respectDnt !== false) {
      const nav = window.navigator as any;
      const win = window as any;
      // Do Not Track
      if (nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.msDoNotTrack === '1') {
        return true;
      }
      // Global Privacy Control (GPC)
      if (nav.globalPrivacyControl === true) {
        return true;
      }
    }

    return false;
  }

  /**
   * Explicitly sets opt-out preference and ceases telemetry collection.
   */
  public optOut(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('trafficpulse_opt_out', '1');
      }
    } catch {
      // Storage access blocked
    }
    this.teardown();
  }

  /**
   * Clears opt-out preference.
   */
  public optIn(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('trafficpulse_opt_out');
      }
    } catch {
      // Storage access blocked
    }
  }

  private isBehaviorEnabled(): boolean {
    if (this.config.enableBehavior === true) return true;
    if (this.config.enableBehavior === undefined && this.config.disableBiometrics === false) return true;
    return false;
  }

  private parseScriptAttributes(): TrackerConfig {
    if (typeof document === 'undefined') {
      return { siteId: '' };
    }
    const currentScript =
      (document.currentScript as HTMLScriptElement) ||
      (typeof document.querySelector === 'function' ? document.querySelector('script[data-site-id]') : null);

    const disableBiometrics = currentScript?.getAttribute('data-disable-biometrics');
    const enableBehavior = currentScript?.getAttribute('data-enable-behavior');

    return {
      siteId: currentScript?.getAttribute('data-site-id') || '',
      apiHost: currentScript?.getAttribute('data-api-host') || '',
      autoTrack: currentScript?.getAttribute('data-auto-track') !== 'false',
      respectDnt: currentScript?.getAttribute('data-respect-dnt') !== 'false',
      enableBehavior: enableBehavior === 'true' || disableBiometrics === 'false',
      disableBiometrics: disableBiometrics === 'true' || enableBehavior === 'false',
    };
  }

  private addTrackedListener(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void {
    target.addEventListener(type, handler, options);
    this.listeners.push({ target, type, handler });
  }

  private initListeners(): void {
    if (typeof window === 'undefined') return;

    // Interaction listeners (only if behavior is enabled)
    if (this.isBehaviorEnabled()) {
      // Mouse movement (throttled to 20 samples maximum)
      const mouseHandler = (e: Event) => {
        const me = e as MouseEvent;
        this.interactionCount++;
        if (this.mouseCoords.length < 20) {
          this.mouseCoords.push({ x: me.clientX, y: me.clientY, t: Date.now() });
        }
      };
      this.addTrackedListener(window, 'mousemove', mouseHandler, { passive: true });

      // Scroll interaction
      const scrollHandler = () => {
        this.interactionCount++;
        if (this.scrollDeltas.length < 20) {
          this.scrollDeltas.push(window.scrollY);
        }
      };
      this.addTrackedListener(window, 'scroll', scrollHandler, { passive: true });
    }

    // Key presses count only - NEVER logs key contents, characters, or form input
    const keyHandler = () => {
      this.interactionCount++;
    };
    this.addTrackedListener(window, 'keydown', keyHandler, { passive: true });

    // Page lifecycle listeners (with strict deduplication guard)
    const visibilityHandler = () => {
      if (document.visibilityState === 'hidden' && !this.hasDispatched) {
        this.flush();
      }
    };
    this.addTrackedListener(document, 'visibilitychange', visibilityHandler);

    const pagehideHandler = () => {
      if (!this.hasDispatched) {
        this.flush();
      }
    };
    this.addTrackedListener(window, 'pagehide', pagehideHandler);

    // Single-Page-App (SPA) navigation listeners
    const origPushState = typeof history !== 'undefined' ? history.pushState : undefined;
    if (origPushState && typeof history !== 'undefined') {
      history.pushState = (...args: Parameters<typeof history.pushState>) => {
        origPushState.apply(history, args);
        this.handleSpaNavigation();
      };
    }

    const popstateHandler = () => {
      this.handleSpaNavigation();
    };
    this.addTrackedListener(window, 'popstate', popstateHandler);
  }

  private handleSpaNavigation(): void {
    this.hasDispatched = false;
    this.startTime = Date.now();
    this.mouseCoords = [];
    this.scrollDeltas = [];
    this.interactionCount = 0;
    this.currentIdempotencyKey = this.generateIdempotencyKey();

    setTimeout(() => {
      if (!this.hasDispatched && !this.isDestroyed) {
        this.flush();
      }
    }, 1500);
  }

  /**
   * Calculates Shannon entropy of directional vector changes in mouse movements.
   */
  private calculateMouseEntropy(): number {
    if (this.mouseCoords.length < 3) return 0;

    const angles: number[] = [];
    for (let i = 1; i < this.mouseCoords.length; i++) {
      const dx = this.mouseCoords[i].x - this.mouseCoords[i - 1].x;
      const dy = this.mouseCoords[i].y - this.mouseCoords[i - 1].y;
      angles.push(Math.atan2(dy, dx));
    }

    const bins = 8;
    const counts = new Array(bins).fill(0);
    angles.forEach((a) => {
      const normalized = (a + Math.PI) / (2 * Math.PI);
      const binIdx = Math.min(Math.floor(normalized * bins), bins - 1);
      counts[binIdx]++;
    });

    let entropy = 0;
    const total = angles.length;
    counts.forEach((c) => {
      if (c > 0) {
        const p = c / total;
        entropy -= p * Math.log2(p);
      }
    });

    return Math.round(entropy * 100) / 100;
  }

  private getWebGLRenderer(): string | undefined {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
      if (!gl) return undefined;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        return String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      }
    } catch {
      // Ignored in restricted environments
    }
    return undefined;
  }

  public collectSignals(): CollectedTelemetry {
    const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
    const win = typeof window !== 'undefined' ? window : ({} as Window);
    const scr = typeof screen !== 'undefined' ? screen : ((win as any).screen || ({} as Screen));

    const webdriver = !!(nav as any).webdriver;
    const hasChromeObject = !!(win as any).chrome;
    const hasPlugins = !!(nav.plugins && nav.plugins.length > 0);
    const screenConsistency = scr.width > 0 && scr.height > 0 && scr.colorDepth > 0;
    const behaviorEnabled = this.isBehaviorEnabled();

    return {
      siteId: this.config.siteId,
      idempotencyKey: this.currentIdempotencyKey,
      path: typeof location !== 'undefined' ? location.pathname : '/',
      method: 'GET',
      userAgent: nav.userAgent || '',
      timestamp: new Date().toISOString(),
      clientSignals: {
        webdriver,
        hasChromeObject,
        hasPlugins,
        screenConsistency,
        webglRenderer: behaviorEnabled ? this.getWebGLRenderer() : undefined,
        mouseEntropy: behaviorEnabled ? this.calculateMouseEntropy() : undefined,
        scrollEntropy: behaviorEnabled ? (this.scrollDeltas.length > 0 ? 1 : 0) : undefined,
        interactionCount: this.interactionCount,
        dwellTimeMs: Date.now() - this.startTime,
        viewportWidth: win.innerWidth || 0,
        viewportHeight: win.innerHeight || 0,
      },
    };
  }

  public flush(): void {
    if (!this.config.siteId || this.isDestroyed || this.isOptedOut()) return;

    // Immediately mark dispatched to avoid race condition between visibilitychange and pagehide
    this.hasDispatched = true;

    const payload = this.collectSignals();
    const endpoint = (this.config.apiHost || '').replace(/\/$/, '') + '/api/v1/events';
    const jsonStr = JSON.stringify(payload);

    let beaconSent = false;
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        beaconSent = navigator.sendBeacon(endpoint, blob);
      } catch {
        beaconSent = false;
      }
    }

    if (!beaconSent && typeof fetch !== 'undefined') {
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': this.currentIdempotencyKey,
        },
        body: jsonStr,
        keepalive: true,
      }).catch(() => {});
    }
  }

  /**
   * Cleans up event listeners and stops tracking on this instance.
   */
  public teardown(): void {
    this.isDestroyed = true;
    for (const { target, type, handler } of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners = [];
  }
}

// Global initialization in browser
if (typeof window !== 'undefined') {
  const win = window as any;
  if (!win.TrafficPulse) {
    win.TrafficPulse = new TrafficPulseTracker();
  }
}

export default TrafficPulseTracker;
