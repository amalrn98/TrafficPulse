/**
 * Core traffic categories representing the agentic era web landscape.
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
  | 'VerifiedHuman';

/**
 * Inferred intent of the agent or visitor.
 */
export type TrafficIntent =
  | 'pre_training'
  | 'rag_inference'
  | 'seo_index'
  | 'data_harvest'
  | 'user_browse'
  | 'automated_probe';

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
 * Detailed classification output returned by the classifier engine.
 */
export interface ClassificationResult {
  category: TrafficCategory;
  botIdentifier?: string;
  actorFamily: ActorFamily;
  intent: TrafficIntent;
  confidence: number; // 0.0 to 1.0
  verifiedOrigin: boolean;
  signals: string[];
}
