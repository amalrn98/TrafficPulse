(function() {
  'use strict';
  if (typeof window === 'undefined') return;

  var currentScript = document.currentScript || document.querySelector('script[data-site-id]');
  var siteId = currentScript ? currentScript.getAttribute('data-site-id') : '';
  var apiHost = currentScript ? (currentScript.getAttribute('data-api-host') || '') : '';
  var autoTrack = currentScript ? currentScript.getAttribute('data-auto-track') !== 'false' : true;
  var respectDnt = currentScript ? currentScript.getAttribute('data-respect-dnt') !== 'false' : true;
  var disableBiometrics = currentScript ? currentScript.getAttribute('data-disable-biometrics') === 'true' : false;

  function isOptedOut() {
    try {
      if (window.localStorage && window.localStorage.getItem('trafficpulse_opt_out') === '1') {
        return true;
      }
    } catch(e) {}

    if (respectDnt) {
      var nav = navigator || {};
      if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.msDoNotTrack === '1') {
        return true;
      }
    }
    return false;
  }

  if (isOptedOut()) return;

  var startTime = Date.now();
  var mouseCoords = [];
  var scrollCount = 0;
  var interactionCount = 0;
  var hasDispatched = false;
  var idempotencyKey = 'tp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

  if (!disableBiometrics) {
    window.addEventListener('mousemove', function(e) {
      interactionCount++;
      if (mouseCoords.length < 20) {
        mouseCoords.push({ x: e.clientX, y: e.clientY });
      }
    }, { passive: true });

    window.addEventListener('scroll', function() {
      interactionCount++;
      scrollCount++;
    }, { passive: true });
  }

  // Count key presses only - NEVER log raw key values or form input contents
  window.addEventListener('keydown', function() {
    interactionCount++;
  }, { passive: true });

  function calculateMouseEntropy() {
    if (mouseCoords.length < 3) return 0;
    var angles = [];
    for (var i = 1; i < mouseCoords.length; i++) {
      var dx = mouseCoords[i].x - mouseCoords[i - 1].x;
      var dy = mouseCoords[i].y - mouseCoords[i - 1].y;
      angles.push(Math.atan2(dy, dx));
    }
    var bins = 8;
    var counts = new Array(bins).fill(0);
    for (var j = 0; j < angles.length; j++) {
      var norm = (angles[j] + Math.PI) / (2 * Math.PI);
      var idx = Math.min(Math.floor(norm * bins), bins - 1);
      counts[idx]++;
    }
    var entropy = 0;
    for (var k = 0; k < counts.length; k++) {
      if (counts[k] > 0) {
        var p = counts[k] / angles.length;
        entropy -= p * Math.log2(p);
      }
    }
    return Math.round(entropy * 100) / 100;
  }

  function getWebGLRenderer() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return null;
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    } catch(e) {}
    return null;
  }

  function collect() {
    var nav = navigator || {};
    var scr = screen || {};
    return {
      siteId: siteId,
      idempotencyKey: idempotencyKey,
      path: location.pathname || '/',
      method: 'GET',
      userAgent: nav.userAgent || '',
      timestamp: new Date().toISOString(),
      clientSignals: {
        webdriver: !!nav.webdriver,
        hasChromeObject: !!window.chrome,
        hasPlugins: !!(nav.plugins && nav.plugins.length > 0),
        screenConsistency: scr.width > 0 && scr.height > 0,
        webglRenderer: getWebGLRenderer(),
        mouseEntropy: disableBiometrics ? undefined : calculateMouseEntropy(),
        scrollEntropy: disableBiometrics ? undefined : (scrollCount > 0 ? 1 : 0),
        interactionCount: interactionCount,
        dwellTimeMs: Date.now() - startTime,
        viewportWidth: window.innerWidth || 0,
        viewportHeight: window.innerHeight || 0
      }
    };
  }

  function flush() {
    if (!siteId || hasDispatched || isOptedOut()) return;
    hasDispatched = true;

    var payload = JSON.stringify(collect());
    var url = (apiHost ? apiHost.replace(/\/$/, '') : '') + '/api/v1/events';

    var beaconSent = false;
    if (navigator.sendBeacon) {
      try {
        beaconSent = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      } catch(e) {
        beaconSent = false;
      }
    }

    if (!beaconSent && window.fetch) {
      window.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        },
        body: payload,
        keepalive: true
      }).catch(function() {});
    }
  }

  window.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && !hasDispatched) flush();
  });
  window.addEventListener('pagehide', function() {
    if (!hasDispatched) flush();
  });

  if (autoTrack && siteId) {
    setTimeout(function() {
      if (!hasDispatched) flush();
    }, 2000);
  }

  window.TrafficPulse = {
    flush: flush,
    collect: collect,
    optOut: function() {
      try {
        if (window.localStorage) window.localStorage.setItem('trafficpulse_opt_out', '1');
      } catch(e) {}
    },
    optIn: function() {
      try {
        if (window.localStorage) window.localStorage.removeItem('trafficpulse_opt_out');
      } catch(e) {}
    }
  };
})();
