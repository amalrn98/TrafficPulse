import { test } from 'node:test';
import assert from 'node:assert';
import { TrafficClassifier } from '../src/classifier';
import { ActorType, RequestMetadata } from '../src/types';

/**
 * Benchmark Evaluation Dataset v1.0
 * Documented sample dataset with ground-truth labels and documented provenance.
 */
interface EvaluationSample {
  id: string;
  description: string;
  provenance: string;
  metadata: RequestMetadata;
  expectedActorType: ActorType;
  expectedVerification: 'verified' | 'claimed' | 'inferred' | 'unverified' | 'unknown';
}

const EVALUATION_DATASET: EvaluationSample[] = [
  // 1. Verified AI Crawlers
  {
    id: 'eval_01',
    description: 'GPTBot official crawler within OpenAI published IP range',
    provenance: 'OpenAI official published CIDR documentation',
    metadata: {
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      ip: '20.15.240.15',
    },
    expectedActorType: 'ai_crawler',
    expectedVerification: 'verified',
  },
  {
    id: 'eval_02',
    description: 'ClaudeBot within Anthropic published CIDR',
    provenance: 'Anthropic published IP range documentation',
    metadata: {
      userAgent: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
      ip: '160.79.104.22',
    },
    expectedActorType: 'ai_crawler',
    expectedVerification: 'verified',
  },
  {
    id: 'eval_03',
    description: 'Bytespider crawler (no public CIDRs published)',
    provenance: 'Observed web traffic ByteDance crawler',
    metadata: {
      userAgent: 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
      ip: '110.242.68.3',
    },
    expectedActorType: 'ai_crawler',
    expectedVerification: 'claimed',
  },

  // 2. Real-Time AI Agents & RAG
  {
    id: 'eval_04',
    description: 'PerplexityBot in Perplexity verified ASN/CIDR block',
    provenance: 'Perplexity published IP block',
    metadata: {
      userAgent: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
      ip: '198.181.160.10',
    },
    expectedActorType: 'ai_agent',
    expectedVerification: 'verified',
  },
  {
    id: 'eval_05',
    description: 'ChatGPT-User on-demand web browsing agent',
    provenance: 'OpenAI published ChatGPT-User IP range',
    metadata: {
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
      ip: '20.171.206.8',
    },
    expectedActorType: 'ai_agent',
    expectedVerification: 'verified',
  },
  {
    id: 'eval_06',
    description: 'Autonomous LangChain agent utilizing browser automation',
    provenance: 'Agentic framework open-source test benchmark',
    metadata: {
      userAgent: 'LangChain-Agent/0.2 (browser-use crawler)',
      clientSignals: { webdriver: true },
    },
    expectedActorType: 'ai_agent',
    expectedVerification: 'inferred',
  },

  // 3. Search Engine Crawlers
  {
    id: 'eval_07',
    description: 'Googlebot in Google verified CIDR block',
    provenance: 'Googlebot published JSON CIDR range',
    metadata: {
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      ip: '66.249.66.4',
    },
    expectedActorType: 'search_crawler',
    expectedVerification: 'verified',
  },
  {
    id: 'eval_08',
    description: 'Bingbot in Microsoft published CIDR block',
    provenance: 'Bingbot published JSON CIDR range',
    metadata: {
      userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      ip: '40.77.167.12',
    },
    expectedActorType: 'search_crawler',
    expectedVerification: 'verified',
  },

  // 4. Automation Tools & Generic Scrapers
  {
    id: 'eval_09',
    description: 'Headless Chrome browser emulator with SwiftShader',
    provenance: 'Puppeteer/Playwright test suite sample',
    metadata: {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/128.0',
      clientSignals: {
        webdriver: true,
        webglRenderer: 'Google SwiftShader',
      },
    },
    expectedActorType: 'automation_tool',
    expectedVerification: 'inferred',
  },
  {
    id: 'eval_10',
    description: 'Python requests HTTP client',
    provenance: 'Common developer tool telemetry',
    metadata: {
      userAgent: 'python-requests/2.31.0',
    },
    expectedActorType: 'automation_tool',
    expectedVerification: 'claimed',
  },
  {
    id: 'eval_11',
    description: 'cURL command-line tool',
    provenance: 'Standard CLI telemetry',
    metadata: {
      userAgent: 'curl/8.4.0',
    },
    expectedActorType: 'automation_tool',
    expectedVerification: 'claimed',
  },

  // 5. Ordinary Browser Traffic & Privacy Browsers
  {
    id: 'eval_12',
    description: 'Legitimate desktop Chrome browser with human biometrics',
    provenance: 'Live desktop browsing sample',
    metadata: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      headers: {
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Chromium";v="128"',
      },
      clientSignals: {
        mouseEntropy: 1.85,
        interactionCount: 14,
      },
    },
    expectedActorType: 'human_browser',
    expectedVerification: 'inferred',
  },
  {
    id: 'eval_13',
    description: 'Privacy-focused Firefox browser (standard headers, no biometrics yet)',
    provenance: 'Firefox 129 privacy window sample',
    metadata: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
      headers: {
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.5',
      },
    },
    expectedActorType: 'human_browser',
    expectedVerification: 'claimed',
  },
  {
    id: 'eval_14',
    description: 'Accessibility screen reader browser navigation (low mouse entropy, normal keyboard count)',
    provenance: 'Accessibility user session fixture',
    metadata: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
      headers: {
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Chromium";v="128"',
      },
      clientSignals: {
        mouseEntropy: 0.1, // Screen reader user rarely moves mouse
        interactionCount: 22, // High keyboard interaction
      },
    },
    expectedActorType: 'human_browser',
    expectedVerification: 'claimed',
  },

  // 6. Spoofed UAs & Adversarial Samples
  {
    id: 'eval_15',
    description: 'Spoofed GPTBot User-Agent from random residential / non-OpenAI IP',
    provenance: 'Adversarial benchmark fixture',
    metadata: {
      userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
      ip: '198.51.100.42', // Not in OpenAI CIDR range
    },
    expectedActorType: 'ai_crawler',
    expectedVerification: 'unverified', // Accurately flagged as unverified!
  },
  {
    id: 'eval_16',
    description: 'Spoofed Googlebot User-Agent from unauthorized datacenter IP',
    provenance: 'Adversarial benchmark fixture',
    metadata: {
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      ip: '192.0.2.1', // Not in Google CIDR
    },
    expectedActorType: 'search_crawler',
    expectedVerification: 'unverified',
  },
  {
    id: 'eval_17',
    description: 'Scraper claiming Chrome UA but omitting all browser headers',
    provenance: 'Adversarial benchmark fixture',
    metadata: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0',
      headers: {},
    },
    expectedActorType: 'automation_tool',
    expectedVerification: 'inferred',
  },

  // 7. Unknown & Ambiguous Traffic
  {
    id: 'eval_18',
    description: 'Empty User-Agent probe',
    provenance: 'Edge log anomaly sample',
    metadata: {
      userAgent: '',
    },
    expectedActorType: 'unknown',
    expectedVerification: 'unknown',
  },
  {
    id: 'eval_19',
    description: 'Unrecognized custom automation client',
    provenance: 'Non-standard client request',
    metadata: {
      userAgent: 'CustomDataHarvester/3.0 (internal research tool)',
    },
    expectedActorType: 'unknown',
    expectedVerification: 'unknown',
  },
];

test('Classifier Empirical Evaluation - Computes Precision, Recall, F1, and Confusion Matrix', () => {
  const actorClasses: ActorType[] = [
    'ai_crawler',
    'ai_agent',
    'search_crawler',
    'automation_tool',
    'human_browser',
    'unknown',
  ];

  // Confusion matrix: [actual][predicted]
  const confusionMatrix: Record<ActorType, Record<ActorType, number>> = {
    ai_crawler: { ai_crawler: 0, ai_agent: 0, search_crawler: 0, automation_tool: 0, human_browser: 0, unknown: 0 },
    ai_agent: { ai_crawler: 0, ai_agent: 0, search_crawler: 0, automation_tool: 0, human_browser: 0, unknown: 0 },
    search_crawler: { ai_crawler: 0, ai_agent: 0, search_crawler: 0, automation_tool: 0, human_browser: 0, unknown: 0 },
    automation_tool: { ai_crawler: 0, ai_agent: 0, search_crawler: 0, automation_tool: 0, human_browser: 0, unknown: 0 },
    human_browser: { ai_crawler: 0, ai_agent: 0, search_crawler: 0, automation_tool: 0, human_browser: 0, unknown: 0 },
    unknown: { ai_crawler: 0, ai_agent: 0, search_crawler: 0, automation_tool: 0, human_browser: 0, unknown: 0 },
  };

  let totalSamples = EVALUATION_DATASET.length;
  let correctClassifications = 0;
  let correctVerifications = 0;

  for (const sample of EVALUATION_DATASET) {
    const result = TrafficClassifier.classify(sample.metadata);

    const actual = sample.expectedActorType;
    const predicted = result.actorType;

    confusionMatrix[actual][predicted]++;

    if (actual === predicted) {
      correctClassifications++;
    }

    if (result.verificationStatus === sample.expectedVerification) {
      correctVerifications++;
    }
  }

  // Calculate per-class metrics
  console.log('\n========================================================================');
  console.log('  TRAFFICPULSE CLASSIFIER EVALUATION BENCHMARK (DATASET v1.0, N=' + totalSamples + ')');
  console.log('========================================================================');
  console.log('Class              | Samples | Precision | Recall  | F1 Score | FPR');
  console.log('-------------------+---------+-----------+---------+----------+------');

  let macroPrecision = 0;
  let macroRecall = 0;
  let macroF1 = 0;

  for (const cls of actorClasses) {
    let tp = confusionMatrix[cls][cls];
    let fp = 0;
    let fn = 0;
    let tn = 0;

    for (const other of actorClasses) {
      if (other !== cls) {
        fp += confusionMatrix[other][cls];
        fn += confusionMatrix[cls][other];
      }
    }

    for (const actualCls of actorClasses) {
      for (const predCls of actorClasses) {
        if (actualCls !== cls && predCls !== cls) {
          tn += confusionMatrix[actualCls][predCls];
        }
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

    macroPrecision += precision;
    macroRecall += recall;
    macroF1 += f1;

    const classSamples = tp + fn;
    console.log(
      `${cls.padEnd(18)}| ${String(classSamples).padStart(7)} | ${precision.toFixed(3).padStart(9)} | ${recall.toFixed(3).padStart(7)} | ${f1.toFixed(3).padStart(8)} | ${fpr.toFixed(3)}`
    );
  }

  macroPrecision /= actorClasses.length;
  macroRecall /= actorClasses.length;
  macroF1 /= actorClasses.length;

  console.log('-------------------+---------+-----------+---------+----------+------');
  console.log(`Macro Average     |   ${totalSamples}    | ${macroPrecision.toFixed(3).padStart(9)} | ${macroRecall.toFixed(3).padStart(7)} | ${macroF1.toFixed(3).padStart(8)} |`);
  console.log(`Overall Accuracy  : ${(correctClassifications / totalSamples * 100).toFixed(1)}% (${correctClassifications}/${totalSamples})`);
  console.log(`Verification Match: ${(correctVerifications / totalSamples * 100).toFixed(1)}% (${correctVerifications}/${totalSamples})`);
  console.log('========================================================================\n');

  // Assert benchmark thresholds
  assert.ok(macroPrecision >= 0.90, `Macro precision must be >= 0.90 (was ${macroPrecision})`);
  assert.ok(macroRecall >= 0.90, `Macro recall must be >= 0.90 (was ${macroRecall})`);
  assert.ok(macroF1 >= 0.90, `Macro F1 must be >= 0.90 (was ${macroF1})`);
});
