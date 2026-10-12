import { BOT_RULES } from './signatures';
import { verifyIpOrigin } from './ip-ranges';
import {
  ClassificationResult,
  RequestMetadata,
  ClientTelemetrySignals,
} from './types';

/**
 * High-performance traffic classification engine.
 * Combines User-Agent heuristics, client-side biometrics/entropy,
 * and origin verification to accurately classify requests in the agentic era.
 */
export class TrafficClassifier {
  /**
   * Evaluates request metadata and returns a deterministic classification.
   */
  public static classify(meta: RequestMetadata): ClassificationResult {
    const ua = (meta.userAgent || '').trim();
    const signals: string[] = [];

    // -------------------------------------------------------------
    // Step 1: Client-Side Biometrics & Telemetry (if available)
    // -------------------------------------------------------------
    if (meta.clientSignals) {
      const clientRes = this.evaluateClientSignals(meta.clientSignals, ua);
      if (clientRes) {
        return clientRes;
      }
    }

    // -------------------------------------------------------------
    // Step 2: Signature Pattern Matching
    // -------------------------------------------------------------
    for (const rule of BOT_RULES) {
      if (rule.pattern.test(ua)) {
        signals.push(`matched_rule:${rule.identifier}`);
        const verified = verifyIpOrigin(meta.ip, rule.actorFamily);
        if (verified) {
          signals.push('verified_ip_origin');
        }

        return {
          category: rule.category,
          botIdentifier: rule.identifier,
          actorFamily: rule.actorFamily,
          intent: rule.intent,
          confidence: verified ? Math.min(rule.confidence + 0.05, 1.0) : rule.confidence,
          verifiedOrigin: verified,
          signals,
        };
      }
    }

    // -------------------------------------------------------------
    // Step 3: Header Anomaly & Automation Detection
    // -------------------------------------------------------------
    if (meta.headers) {
      const headerAnomalyRes = this.evaluateHeaderAnomalies(meta.headers, ua, meta.ip);
      if (headerAnomalyRes) {
        return headerAnomalyRes;
      }
    }

    // -------------------------------------------------------------
    // Step 4: Default to Organic Human (or generic fallback)
    // -------------------------------------------------------------
    const isLikelyBrowser =
      ua.includes('Mozilla/') &&
      (ua.includes('Chrome/') || ua.includes('Safari/') || ua.includes('Firefox/'));

    if (isLikelyBrowser) {
      signals.push('standard_browser_signature');
      return {
        category: 'human',
        actorFamily: 'VerifiedHuman',
        intent: 'user_browse',
        confidence: 0.90,
        verifiedOrigin: false,
        signals,
      };
    }

    // Unknown or empty User-Agent
    signals.push('non_browser_or_empty_ua');
    return {
      category: 'generic_bot',
      botIdentifier: 'Unknown-Client',
      actorFamily: 'GenericCrawler',
      intent: 'automated_probe',
      confidence: 0.70,
      verifiedOrigin: false,
      signals,
    };
  }

  /**
   * Analyzes client sensor signals (sent by the TrafficPulse tracker SDK).
   */
  private static evaluateClientSignals(
    cs: ClientTelemetrySignals,
    ua: string
  ): ClassificationResult | null {
    const signals: string[] = [];

    // Explicit WebDriver detection
    if (cs.webdriver === true) {
      signals.push('client_webdriver_active');

      // Check if it matches autonomous agent signatures
      const isAgent = /autogpt|langchain|browser-use|agent/i.test(ua);
      return {
        category: isAgent ? 'ai_agent' : 'generic_bot',
        botIdentifier: isAgent ? 'Autonomous-Agent-Telemetry' : 'Automated-Headless-Browser',
        actorFamily: isAgent ? 'AutonomousAgent' : 'HeadlessBrowser',
        intent: isAgent ? 'rag_inference' : 'automated_probe',
        confidence: 0.98,
        verifiedOrigin: false,
        signals,
      };
    }

    // Headless graphics / WebGL swiftshader
    if (cs.webglRenderer && /swiftshader|llvmpipe/i.test(cs.webglRenderer)) {
      signals.push('software_rasterizer_detected');
      return {
        category: 'generic_bot',
        botIdentifier: 'Headless-Emulator',
        actorFamily: 'HeadlessBrowser',
        intent: 'data_harvest',
        confidence: 0.95,
        verifiedOrigin: false,
        signals,
      };
    }

    // Biometric interaction entropy
    if (cs.interactionCount && cs.interactionCount > 3 && cs.mouseEntropy !== undefined) {
      if (cs.mouseEntropy > 1.5) {
        signals.push('high_mouse_entropy_human');
        return {
          category: 'human',
          actorFamily: 'VerifiedHuman',
          intent: 'user_browse',
          confidence: 0.98,
          verifiedOrigin: false,
          signals,
        };
      }
    }

    return null;
  }

  /**
   * Header anomaly heuristics for detecting headless or fake requests.
   */
  private static evaluateHeaderAnomalies(
    headers: Record<string, string | string[] | undefined>,
    ua: string,
    ip?: string
  ): ClassificationResult | null {
    const signals: string[] = [];

    const getHeader = (name: string): string => {
      const val = headers[name] || headers[name.toLowerCase()];
      if (Array.isArray(val)) return val[0] || '';
      return (val as string) || '';
    };

    const accept = getHeader('accept');
    const acceptLanguage = getHeader('accept-language');
    const secChUa = getHeader('sec-ch-ua');

    // Browsers always send accept-language unless modified or automated
    const isBrowserUa = ua.includes('Mozilla/5.0');
    if (isBrowserUa && !acceptLanguage && !secChUa) {
      signals.push('missing_browser_headers');
      return {
        category: 'generic_bot',
        botIdentifier: 'Spoofed-Browser-Scraper',
        actorFamily: 'GenericCrawler',
        intent: 'data_harvest',
        confidence: 0.85,
        verifiedOrigin: false,
        signals,
      };
    }

    return null;
  }
}
