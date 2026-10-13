import { BOT_RULES, BotRule } from './signatures';
import { inspectIpOrigin, ProviderRangeInfo, VERIFIED_NETWORKS } from './ip-ranges';
import {
  ClassificationResult,
  RequestMetadata,
  ClientTelemetrySignals,
  ActorType,
  VerificationStatus,
  ActivityType,
  TrafficCategory,
  ActorFamily,
  TrafficIntent,
  REASON_CODES,
} from './types';

export const CLASSIFIER_VERSION = '2.0.0-epistemic';

/**
 * Epistemic traffic classification engine.
 * Distinguishes Actor Type, Actor Identity, Activity Type, and Verification Status.
 * Evaluates request metadata systematically with explicit precedence rules.
 */
export class TrafficClassifier {
  /**
   * Evaluates request metadata and returns a deterministic, evidence-based classification.
   */
  public static classify(meta: RequestMetadata): ClassificationResult {
    const ua = (meta.userAgent || '').trim();
    const evidence: string[] = [];
    const reasonCodes: string[] = [];
    const nowIso = new Date().toISOString();

    // -------------------------------------------------------------
    // Pre-check: Empty or missing User-Agent
    // -------------------------------------------------------------
    if (!ua) {
      evidence.push('empty_or_whitespace_user_agent');
      reasonCodes.push(REASON_CODES.EMPTY_USER_AGENT);
      return {
        actorType: 'unknown',
        actorName: 'Empty-User-Agent',
        activityType: 'unknown',
        verificationStatus: 'unknown',
        confidence: 0.30,
        confidenceType: 'heuristic',
        evidence,
        reasonCodes,
        classifierVersion: CLASSIFIER_VERSION,
        classifiedAt: nowIso,
        category: 'generic_bot',
        botIdentifier: 'Empty-User-Agent',
        actorFamily: 'GenericCrawler',
        intent: 'unknown',
        verifiedOrigin: false,
        signals: evidence,
      };
    }

    // -------------------------------------------------------------
    // Step 1: Signature Pattern Matching (Authoritative Bot Rules)
    // -------------------------------------------------------------
    for (const rule of BOT_RULES) {
      if (rule.pattern.test(ua)) {
        evidence.push(`matched_rule:${rule.identifier}`);
        reasonCodes.push(REASON_CODES.SIGNATURE_MATCHED);

        const actorType = this.mapCategoryToActorType(rule.category);
        const activityType = this.mapIntentToActivityType(rule.intent);

        // Evaluate network CIDR verification if IP is available
        const ipCheck = inspectIpOrigin(meta.ip, rule.actorFamily);
        let verificationStatus: VerificationStatus = 'claimed';
        let verifiedOrigin = false;
        let heuristicConfidence = 0.75; // Default for declared signature without IP verification

        if (meta.ip && ipCheck.verified) {
          verifiedOrigin = true;
          verificationStatus = 'verified';
          heuristicConfidence = 0.95;
          evidence.push(`verified_cidr:${ipCheck.matchedCidr}`);
          reasonCodes.push(REASON_CODES.CIDR_VERIFIED);
        } else if (meta.ip && VERIFIED_NETWORKS[rule.actorFamily]) {
          // Actor family publishes known CIDRs, but this IP does not match
          verificationStatus = 'unverified';
          heuristicConfidence = 0.55;
          evidence.push('ip_not_in_published_actor_ranges');
          reasonCodes.push(REASON_CODES.CIDR_UNVERIFIED);
        } else {
          // No published CIDRs available for this actor (e.g. CLI tools, community scrapers)
          verificationStatus = 'claimed';
          heuristicConfidence = 0.75;
        }

        // Corroborate with client telemetry if available
        if (meta.clientSignals?.webdriver === true) {
          evidence.push('client_webdriver_active');
          reasonCodes.push(REASON_CODES.WEBDRIVER_ACTIVE);
          if (verificationStatus === 'claimed') {
            verificationStatus = 'inferred';
          }
        }

        // Check for conflicting signals (e.g. human interaction biometrics on a claimed crawler)
        if (meta.clientSignals && (meta.clientSignals.mouseEntropy || 0) > 1.2) {
          evidence.push('conflicting_human_biometrics_on_bot_ua');
          reasonCodes.push(REASON_CODES.CONFLICTING_SIGNALS);
          return {
            actorType: 'unknown',
            actorName: 'Conflicting-Evidence',
            activityType: 'unknown',
            verificationStatus: 'unknown',
            confidence: 0.40,
            confidenceType: 'heuristic',
            evidence,
            reasonCodes,
            classifierVersion: CLASSIFIER_VERSION,
            classifiedAt: nowIso,
            category: 'generic_bot',
            botIdentifier: 'Conflicting-Evidence',
            actorFamily: 'Unknown',
            intent: 'unknown',
            verifiedOrigin: false,
            signals: evidence,
          };
        }

        return {
          actorType,
          actorName: rule.identifier,
          activityType,
          verificationStatus,
          confidence: heuristicConfidence,
          confidenceType: 'heuristic',
          evidence,
          reasonCodes,
          classifierVersion: CLASSIFIER_VERSION,
          classifiedAt: nowIso,
          category: rule.category,
          botIdentifier: rule.identifier,
          actorFamily: rule.actorFamily,
          intent: rule.intent,
          verifiedOrigin,
          signals: evidence,
        };
      }
    }

    // -------------------------------------------------------------
    // Step 2: Automation & Telemetry Indicators (Client Sensors)
    // -------------------------------------------------------------
    if (meta.clientSignals) {
      const telemetryRes = this.evaluateTelemetrySignals(meta.clientSignals, ua, evidence, reasonCodes, nowIso);
      if (telemetryRes) {
        return telemetryRes;
      }
    }

    // -------------------------------------------------------------
    // Step 3: Header Anomaly & Automation Detection
    // -------------------------------------------------------------
    if (meta.headers) {
      const headerAnomalyRes = this.evaluateHeaderAnomalies(meta.headers, ua, evidence, reasonCodes, nowIso);
      if (headerAnomalyRes) {
        return headerAnomalyRes;
      }
    }

    // -------------------------------------------------------------
    // Step 4: Browser Evaluation (Human / Interactive Session)
    // -------------------------------------------------------------
    const isLikelyBrowser =
      ua.includes('Mozilla/') &&
      (ua.includes('Chrome/') || ua.includes('Safari/') || ua.includes('Firefox/') || ua.includes('Edg/'));

    if (isLikelyBrowser) {
      evidence.push('standard_browser_ua_tokens');

      // Check if interactive human biometrics are present
      const hasEntropy =
        meta.clientSignals &&
        (meta.clientSignals.interactionCount || 0) > 2 &&
        (meta.clientSignals.mouseEntropy || 0) > 1.0;

      if (hasEntropy) {
        evidence.push('human_interaction_biometrics_detected');
        reasonCodes.push(REASON_CODES.BIOMETRIC_ENTROPY_OBSERVED);
        return {
          actorType: 'human_browser',
          actorName: 'Interactive Browser Session',
          activityType: 'page_view',
          verificationStatus: 'inferred',
          confidence: 0.85,
          confidenceType: 'heuristic',
          evidence,
          reasonCodes,
          classifierVersion: CLASSIFIER_VERSION,
          classifiedAt: nowIso,
          category: 'human',
          actorFamily: 'VerifiedHuman',
          intent: 'user_browse',
          verifiedOrigin: false,
          signals: evidence,
        };
      }

      // Browser UA without client sensor signals (e.g., initial HTTP GET)
      reasonCodes.push(REASON_CODES.STANDARD_BROWSER_HEADERS);
      return {
        actorType: 'human_browser',
        actorName: 'Standard Browser Request',
        activityType: 'page_view',
        verificationStatus: 'claimed',
        confidence: 0.65,
        confidenceType: 'heuristic',
        evidence,
        reasonCodes,
        classifierVersion: CLASSIFIER_VERSION,
        classifiedAt: nowIso,
        category: 'human',
        actorFamily: 'VerifiedHuman',
        intent: 'user_browse',
        verifiedOrigin: false,
        signals: evidence,
      };
    }

    // -------------------------------------------------------------
    // Step 5: Unrecognized / Ambiguous Client
    // -------------------------------------------------------------
    evidence.push('non_browser_unrecognized_signature');
    reasonCodes.push(REASON_CODES.UNKNOWN_CLIENT);

    return {
      actorType: 'unknown',
      actorName: 'Unrecognized-Client',
      activityType: 'unknown',
      verificationStatus: 'unknown',
      confidence: 0.40,
      confidenceType: 'heuristic',
      evidence,
      reasonCodes,
      classifierVersion: CLASSIFIER_VERSION,
      classifiedAt: nowIso,
      category: 'generic_bot',
      botIdentifier: 'Unrecognized-Client',
      actorFamily: 'GenericCrawler',
      intent: 'automated_probe',
      verifiedOrigin: false,
      signals: evidence,
    };
  }

  /**
   * Analyzes client sensor signals (sent by the TrafficPulse tracker SDK).
   */
  private static evaluateTelemetrySignals(
    cs: ClientTelemetrySignals,
    ua: string,
    evidence: string[],
    reasonCodes: string[],
    nowIso: string
  ): ClassificationResult | null {
    // Explicit WebDriver detection (automation tool)
    if (cs.webdriver === true) {
      evidence.push('client_webdriver_active');
      reasonCodes.push(REASON_CODES.WEBDRIVER_ACTIVE);

      const isAgent = /autogpt|langchain|crewai|browser-use|agent/i.test(ua);
      const actorType: ActorType = isAgent ? 'ai_agent' : 'automation_tool';
      const category: TrafficCategory = isAgent ? 'ai_agent' : 'generic_bot';
      const actorFamily: ActorFamily = isAgent ? 'AutonomousAgent' : 'HeadlessBrowser';

      return {
        actorType,
        actorName: isAgent ? 'Autonomous-Agent-Telemetry' : 'Automated-Headless-Browser',
        activityType: isAgent ? 'api_query' : 'content_fetch',
        verificationStatus: 'inferred',
        confidence: 0.90,
        confidenceType: 'heuristic',
        evidence,
        reasonCodes,
        classifierVersion: CLASSIFIER_VERSION,
        classifiedAt: nowIso,
        category,
        botIdentifier: isAgent ? 'Autonomous-Agent-Telemetry' : 'Automated-Headless-Browser',
        actorFamily,
        intent: isAgent ? 'rag_inference' : 'automated_probe',
        verifiedOrigin: false,
        signals: evidence,
      };
    }

    // Headless graphics / WebGL software rasterizer
    if (cs.webglRenderer && /swiftshader|llvmpipe/i.test(cs.webglRenderer)) {
      evidence.push('software_rasterizer_detected');
      reasonCodes.push(REASON_CODES.SOFTWARE_RASTERIZER);

      return {
        actorType: 'automation_tool',
        actorName: 'Headless-Emulator',
        activityType: 'content_fetch',
        verificationStatus: 'inferred',
        confidence: 0.85,
        confidenceType: 'heuristic',
        evidence,
        reasonCodes,
        classifierVersion: CLASSIFIER_VERSION,
        classifiedAt: nowIso,
        category: 'generic_bot',
        botIdentifier: 'Headless-Emulator',
        actorFamily: 'HeadlessBrowser',
        intent: 'data_harvest',
        verifiedOrigin: false,
        signals: evidence,
      };
    }

    return null;
  }

  /**
   * Header anomaly heuristics for detecting headless or fake requests.
   */
  private static evaluateHeaderAnomalies(
    headers: Record<string, string | string[] | undefined>,
    ua: string,
    evidence: string[],
    reasonCodes: string[],
    nowIso: string
  ): ClassificationResult | null {
    const getHeader = (name: string): string => {
      const val = headers[name] || headers[name.toLowerCase()];
      if (Array.isArray(val)) return val[0] || '';
      return (val as string) || '';
    };

    const accept = getHeader('accept');
    const acceptLanguage = getHeader('accept-language');
    const secChUa = getHeader('sec-ch-ua');

    // Browsers declaring Mozilla/5.0 without accept-language or modern sec-ch-ua
    const isBrowserUa = ua.includes('Mozilla/5.0');
    if (isBrowserUa && !acceptLanguage && !secChUa) {
      evidence.push('missing_browser_headers_on_browser_ua');
      reasonCodes.push(REASON_CODES.HEADER_ANOMALY);

      return {
        actorType: 'automation_tool',
        actorName: 'Spoofed-Browser-Scraper',
        activityType: 'content_fetch',
        verificationStatus: 'inferred',
        confidence: 0.75,
        confidenceType: 'heuristic',
        evidence,
        reasonCodes,
        classifierVersion: CLASSIFIER_VERSION,
        classifiedAt: nowIso,
        category: 'generic_bot',
        botIdentifier: 'Spoofed-Browser-Scraper',
        actorFamily: 'GenericCrawler',
        intent: 'data_harvest',
        verifiedOrigin: false,
        signals: evidence,
      };
    }

    return null;
  }

  private static mapCategoryToActorType(category: TrafficCategory): ActorType {
    switch (category) {
      case 'llm_training':
        return 'ai_crawler';
      case 'ai_agent':
        return 'ai_agent';
      case 'search_engine':
        return 'search_crawler';
      case 'generic_bot':
        return 'automation_tool';
      case 'human':
        return 'human_browser';
      default:
        return 'unknown';
    }
  }

  private static mapIntentToActivityType(intent: TrafficIntent): ActivityType {
    switch (intent) {
      case 'rag_inference':
        return 'api_query';
      case 'pre_training':
      case 'seo_index':
      case 'data_harvest':
      case 'automated_probe':
        return 'content_fetch';
      case 'user_browse':
        return 'page_view';
      default:
        return 'unknown';
    }
  }
}
