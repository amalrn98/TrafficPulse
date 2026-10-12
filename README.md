# webspecs

An open-source, privacy-preserving web analytics platform designed to classify incoming web traffic across organic humans, AI training scrapers, real-time agentic retrieval bots, and standard search crawlers.

webspecs operates via lightweight edge middleware that captures HTTP request metadata and dispatches it asynchronously to a self-hosted analytics engine, keeping site latency at zero.

---

## 1. Traffic Classification Taxonomy

Every incoming request is tagged with one of five deterministic categories:

| Category | Identifier | Description | Examples |
| :--- | :--- | :--- | :--- |
| **Organic Human** | `human` | Real user sessions verified via browser telemetry and interaction signals. | Desktop/Mobile Chrome, Safari, Firefox |
| **LLM Training Crawler** | `llm_training` | Bulk, offline batch scrapers harvesting static datasets for foundation model training. | `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended` |
| **Agentic / Retrieval** | `ai_agent` | Real-time automated inference engines fetching live web context to answer immediate user prompts. | Perplexity, ChatGPT Search, custom LangChain/Playwright agents |
| **Search Engine Bot** | `search_engine` | Traditional search indexers verified via reverse DNS or published IP blocks. | `Googlebot`, `Bingbot`, `YandexBot` |
| **Automated Scraper** | `generic_bot` | Headless automation frameworks, vulnerability scanners, or unidentified scripts. | Puppeteer, Playwright, Scrapy, cURL, Python-requests |

---

## 2. System Architecture
[ Incoming Request ]
│
▼
[ Edge Middleware / Reverse Proxy ]
├── Extracts request headers, path, method, IP, and client signals
├── Categorizes traffic in-memory using deterministic bot signatures
├── Hands request directly to origin application (zero blocking latency)
└── Asynchronously dispatches event payload via non-blocking HTTP POST
│
▼
[ Ingestion API: /api/v1/events ]
│
▼
[ Columnar Event Store ]
│
▼
[ Analytics Web Dashboard ]


---

## 3. Data Models & Schemas

### Ingestion Event Payload (`POST /api/v1/events`)

```typescript
export interface IngestionEvent {
  timestamp: string;               // ISO 8601 UTC string
  siteId: string;                  // Target domain or site identifier
  path: string;                    // Requested URL path (e.g., "/blog/post-1")
  method: "GET" | "POST" | "HEAD";
  trafficCategory: "human" | "llm_training" | "ai_agent" | "search_engine" | "generic_bot";
  botIdentifier?: string;          // Specific crawler name, e.g., "GPTBot", "PerplexityBot"
  verifiedOrigin: boolean;         // True if verified via known IP CIDR or rDNS
  clientHints: {
    browser?: string;
    os?: string;
    deviceType: "desktop" | "mobile" | "server";
  };
  requestHeaders: {
    userAgent: string;
    referer?: string;
    acceptLanguage?: string;
  };
  durationMs?: number;             // Response execution time
  statusCode: number;              // HTTP status code returned
}
4. Key Functional Features
1. High-Throughput Event Ingestion
Endpoint: POST /api/v1/events

Validates incoming JSON schema and records events directly to the store.

Rejects malformed requests with standard HTTP status codes.

2. Analytics Dashboard UI
Global Filters: Filter by date range (Last 24 Hours, 7 Days, 30 Days) and domain.

Volume Breakdown: Metric cards displaying total requests, share percentage by traffic category, and top bot actors.

Traffic Distribution Chart: Stacked time-series bar chart illustrating traffic composition across the 5 categories over time.

Target Endpoint Table: Breakdown of most frequently crawled URLs, segmented by bot category.

Live Stream Log: Paginated, filterable event table displaying raw incoming requests, classifications, and verification statuses in near real-time.

3. Signature & Verification Engine (Client SDK / Middleware)
In-memory string matching against known bot tokens in User-Agent.

IP-range checking against official crawler CIDR datasets (OpenAI, Anthropic, Google).

Fallback categorization for automated libraries (python-requests, aiohttp, Go-http-client).

5. Technology Stack
Frontend: React, Tailwind CSS, Lucide Icons, Recharts

Backend API: Node.js / Express or Next.js App Router (TypeScript)

Database / Store: PostgreSQL / DuckDB (or SQLite for local development)

Deployment: Docker Compose ready (docker-compose up)

6. Development Setup
Clone the repository:

Bash
git clone [https://github.com/your-username/webspecs.git](https://github.com/your-username/webspecs.git)
cd webspecs
Install dependencies:

Bash
npm install
Set environment variables:

Bash
cp .env.example .env
Run the local development server:

Bash
npm run dev
