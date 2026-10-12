/**
 * TrafficPulse Client Tracker (<3KB, Zero external dependencies)
 * Privacy-preserving behavioral sensor capturing client hints and interaction entropy.
 */

export interface TrackerConfig {
  siteId: string;
  apiHost?: string;
  autoTrack?: boolean;
}

export interface CollectedTelemetry {
  siteId: string;
  path: string;
  method: string;
  userAgent: string;
  clientSignals: {
    webdriver: boolean;
    hasChromeObject: boolean;
    hasPlugins: boolean;
    screenConsistency: boolean;
    webglRenderer?: string;
    mouseEntropy: number;
    scrollEntropy: number;
    interactionCount: number;
    dwellTimeMs: number;
    viewportWidth: number;
    viewportHeight: number;
  };
}

class TrafficPulseTracker {
  private config: TrackerConfig;
  private startTime: number = Date.now();
  private mouseCoords: Array<{ x: number; y: number; t: number }> = [];
  private scrollDeltas: number[] = [];
  private interactionCount: number = 0;
  private hasDispatched: boolean = false;

  constructor() {
    this.config = this.parseScriptAttributes();
    if (typeof window !== 'undefined') {
      this.initListeners();
      if (this.config.autoTrack !== false && this.config.siteId) {
        // Schedule non-blocking telemetry flush after initial user interaction or page settle
        setTimeout(() => this.flush(), 2000);
      }
    }
  }

  private parseScriptAttributes(): TrackerConfig {
    if (typeof document === 'undefined') {
      return { siteId: '' };
    }
    const currentScript =
      (document.currentScript as HTMLScriptElement) ||
      document.querySelector('script[data-site-id]');

    return {
      siteId: currentScript?.getAttribute('data-site-id') || '',
      apiHost: currentScript?.getAttribute('data-api-host') || '',
      autoTrack: currentScript?.getAttribute('data-auto-track') !== 'false',
    };
  }

  private initListeners(): void {
    // Collect mouse trajectory points (throttled to 20 samples max for low memory)
    window.addEventListener(
      'mousemove',
      (e: MouseEvent) => {
        this.interactionCount++;
        if (this.mouseCoords.length < 20) {
          this.mouseCoords.push({ x: e.clientX, y: e.clientY, t: Date.now() });
        }
      },
      { passive: true }
    );

    // Collect scroll interactions
    window.addEventListener(
      'scroll',
      () => {
        this.interactionCount++;
        if (this.scrollDeltas.length < 20) {
          this.scrollDeltas.push(window.scrollY);
        }
      },
      { passive: true }
    );

    // Key presses
    window.addEventListener(
      'keydown',
      () => {
        this.interactionCount++;
      },
      { passive: true }
    );

    // Flush on page unload or visibility hidden
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !this.hasDispatched) {
        this.flush();
      }
    });

    window.addEventListener('pagehide', () => {
      if (!this.hasDispatched) {
        this.flush();
      }
    });

    // SPA history listener
    const origPushState = history.pushState;
    history.pushState = (...args) => {
      origPushState.apply(history, args);
      this.hasDispatched = false;
      this.startTime = Date.now();
      setTimeout(() => this.flush(), 1500);
    };
  }

  /**
   * Calculates Shannon entropy of directional vector changes in mouse movements.
   * True human input has natural motor jitter and curve entropy > 1.2.
   * Synthetic automation scripts exhibit either 0 entropy or strictly collinear lines.
   */
  private calculateMouseEntropy(): number {
    if (this.mouseCoords.length < 3) return 0;

    const angles: number[] = [];
    for (let i = 1; i < this.mouseCoords.length; i++) {
      const dx = this.mouseCoords[i].x - this.mouseCoords[i - 1].x;
      const dy = this.mouseCoords[i].y - this.mouseCoords[i - 1].y;
      const angle = Math.atan2(dy, dx);
      angles.push(angle);
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
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext);
      if (!gl) return undefined;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      }
    } catch {
      // Ignored in restricted environments
    }
    return undefined;
  }

  public collectSignals(): CollectedTelemetry {
    const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
    const win = typeof window !== 'undefined' ? window : ({} as Window);
    const scr = typeof screen !== 'undefined' ? screen : ({} as Screen);

    const webdriver = !!(nav as any).webdriver;
    const hasChromeObject = !!(win as any).chrome;
    const hasPlugins = !!(nav.plugins && nav.plugins.length > 0);
    const screenConsistency = scr.width > 0 && scr.height > 0 && scr.colorDepth > 0;

    return {
      siteId: this.config.siteId,
      path: typeof location !== 'undefined' ? location.pathname : '/',
      method: 'GET',
      userAgent: nav.userAgent || '',
      clientSignals: {
        webdriver,
        hasChromeObject,
        hasPlugins,
        screenConsistency,
        webglRenderer: this.getWebGLRenderer(),
        mouseEntropy: this.calculateMouseEntropy(),
        scrollEntropy: this.scrollDeltas.length > 0 ? 1 : 0,
        interactionCount: this.interactionCount,
        dwellTimeMs: Date.now() - this.startTime,
        viewportWidth: win.innerWidth || 0,
        viewportHeight: win.innerHeight || 0,
      },
    };
  }

  public flush(): void {
    if (!this.config.siteId) return;
    this.hasDispatched = true;

    const payload = this.collectSignals();
    const endpoint = (this.config.apiHost || '') + '/api/v1/events';
    const jsonStr = JSON.stringify(payload);

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
    } else if (typeof fetch !== 'undefined') {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
        keepalive: true,
      }).catch(() => {});
    }
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  (window as any).TrafficPulse = new TrafficPulseTracker();
}

export { TrafficPulseTracker };
