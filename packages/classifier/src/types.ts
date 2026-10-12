/**
 * Epistemic Traffic Classifier Taxonomy
 * Distinguishes Actor Type, Actor Identity, Activity Type, and Verification Status.
 */

/**
 * High-level behavioral actor types.
 */
export type ActorType =
  | 'human_browser'     // Interactive browser driven by human signals
  | 'ai_crawler'       // Foundation model pre-training or bulk dataset crawler
  | 'ai_agent'         // Real-time inference, RAG retrieval, or tool-calling automation
  | 'search_crawler'   // Traditional search engine indexer (SEO)
  | 'automation_tool'  // Developer tool, HTTP client library, headless automation
  | 'unknown';         // Ambiguous, conflicting, or unrecognized metadata

/**
 * Legacy category mappings for backward compatibility.
 */
export type TrafficCategory =
  | 'human'
  | 'llm_training'
  | 'ai_agent'
  | 'search_engine'
  | 'generic_bot';

/**
 * High-level AI or bot actor families.
 */
export type ActorFamily =
  | 'OpenAI'
  | 'Anthropic'
  | 'Perplexity'
  | 'Google'
  | 'Microsoft'
  | 'ByteDance'
  | 'Meta'
  | 'Cohere'
  | 'Amazon'
  | 'CommonCrawl'
  | 'Apple'
  | 'AutonomousAgent'
  | 'HeadlessBrowser'
  | 'DeveloperTool'
  | 'GenericCrawler'
  | 'VerifiedHuman'
  | 'Unknown';

/**
 * Inferred intent of the agent or visitor.
 * Note: Intent is inferred from known role profiles, not direct proof of downstream use.
 */
export type TrafficIntent =
  | 'pre_training'
  | 'rag_inference'
  | 'seo_index'
  | 'data_harvest'
  | 'user_browse'
  | 'automated_probe'
  | 'unknown';

/**
 * Verification status of the client identity claim.
 */
export type VerificationStatus =
  | 'verified'     // Cryptographically or network-range (CIDR) verified identity
  | 'claimed'      // Declared identity via User-Agent token without network verification
  | 'inferred'     // Derived via heuristics (e.g. browser headers, biometrics)
  | 'unverified'   // Signature matched or heuristic found, but origin unconfirmed
  | 'unknown';     // Insufficient evidence to establish status

/**
 * Observed activity type from request context.
 */
export type ActivityType =
  | 'page_view'
  | 'content_fetch'
  | 'api_query'
  | 'unknown';

/**
 * Standard classification reason codes.
 */
export const REASON_CODES = {
  SIGNATURE_MATCHED: 'SIGNATURE_MATCHED',
  CIDR_VERIFIED: 'CIDR_VERIFIED',
  CIDR_UNVERIFIED: 'CIDR_UNVERIFIED',
  HEADER_ANOMALY: 'HEADER_ANOMALY',
  STANDARD_BROWSER_HEADERS: 'STANDARD_BROWSER_HEADERS',
  WEBDRIVER_ACTIVE: 'WEBDRIVER_ACTIVE',
  SOFTWARE_RASTERIZER: 'SOFTWARE_RASTERIZER',
  BIOMETRIC_ENTROPY_OBSERVED: 'BIOMETRIC_ENTROPY_OBSERVED',
  EMPTY_USER_AGENT: 'EMPTY_USER_AGENT',
  CONFLICTING_SIGNALS: 'CONFLICTING_SIGNALS',
  UNKNOWN_CLIENT: 'UNKNOWN_CLIENT',
} as const;

export type ReasonCode = typeof REASON_CODES[keyof typeof REASON_CODES];

/**
 * Client telemetry collected via the micro-sensor SDK.
 */
export interface ClientTelemetrySignals {
  webdriver?: boolean;
  hasChromeObject?: boolean;
  hasPlugins?: boolean;
  screenConsistency?: boolean;
  webglRenderer?: string;
  mouseEntropy?: number;
  scrollEntropy?: number;
  dwellTimeMs?: number;
  interactionCount?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * Incoming request metadata extracted by Edge/Server middleware or Ingestion API.
 */
export interface RequestMetadata {
  userAgent: string;
  ip?: string;
  method?: string;
  path?: string;
  headers?: Record<string, string | string[] | undefined>;
  clientSignals?: ClientTelemetrySignals;
}

/**
 * Structured epistemic classification result.
 */
export interface ClassificationResult {
  // Epistemic classification
  actorType: ActorType;
  actorName?: string;
  activityType: ActivityType;
  verificationStatus: VerificationStatus;
  confidence: number; // Heuristic score between 0.0 and 1.0 (not calibrated probability)
  confidenceType: 'heuristic';
  evidence: string[];
  reasonCodes: string[];
  classifierVersion: string;
  classifiedAt: string;

  // Backward compatibility fields
  category: TrafficCategory;
  botIdentifier?: string;
  actorFamily: ActorFamily;
  intent: TrafficIntent;
  verifiedOrigin: boolean;
  signals: string[];
}
