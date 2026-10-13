'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Bot,
  BrainCircuit,
  Search,
  Users,
  ShieldAlert,
  Code2,
  Copy,
  Check,
  Radio,
  FileCode2,
  Terminal,
  Globe,
  Plus,
  RefreshCw,
  ExternalLink,
  Sliders,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface Site {
  id: string;
  name: string;
  domain: string;
  apiKey: string;
  isDemo: boolean;
}

interface OverviewData {
  total: number;
  categories: {
    human: number;
    llm_training: number;
    ai_agent: number;
    search_engine: number;
    generic_bot: number;
  };
  aiSharePct: number;
  humanSharePct: number;
  isDemo?: boolean;
}

interface ActorStat {
  name: string;
  count: number;
  category: string;
  verified: number;
  share: number;
}

interface EndpointStat {
  path: string;
  total: number;
  aiRequests: number;
  humanRequests: number;
  aiRatio: number;
}

interface LiveEvent {
  id: string;
  timestamp: string;
  path: string;
  method: string;
  actorType?: string;
  actorName?: string;
  activityType?: string;
  verificationStatus?: string;
  confidence?: number;
  evidence?: string;
  trafficCategory: string;
  botIdentifier?: string;
  actorFamily?: string;
  verifiedOrigin: boolean;
  userAgent: string;
  ip?: string;
  statusCode: number;
  isDemo?: boolean;
}

export default function DashboardPage() {
  const [data, setData] = useState<{
    sites: Site[];
    selectedSite?: Site;
    isDemo: boolean;
    overview: OverviewData;
    topActors: ActorStat[];
    topEndpoints: EndpointStat[];
    liveEvents: LiveEvent[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'live' | 'endpoints' | 'defense'>('overview');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedNext, setCopiedNext] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New site modal / input
  const [isNewSiteModalOpen, setIsNewSiteModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newName, setNewName] = useState('');
  const [isCreatingSite, setIsCreatingSite] = useState(false);

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const url = selectedSiteId
        ? `/api/v1/analytics?siteId=${encodeURIComponent(selectedSiteId)}`
        : '/api/v1/analytics';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (!selectedSiteId && json.selectedSite) {
          setSelectedSiteId(json.selectedSite.id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSiteId]);

  const copyToClipboard = (text: string, type: 'script' | 'next') => {
    navigator.clipboard.writeText(text);
    if (type === 'script') {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } else {
      setCopiedNext(true);
      setTimeout(() => setCopiedNext(false), 2000);
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setIsCreatingSite(true);
    try {
      const res = await fetch('/api/v1/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain.trim(), name: newName.trim() || undefined }),
      });
      if (res.ok) {
        const json = await res.json();
        setNewDomain('');
        setNewName('');
        setIsNewSiteModalOpen(false);
        if (json.site) {
          setSelectedSiteId(json.site.id);
        }
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingSite(false);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'llm_training':
        return 'bg-purple-950/70 text-purple-400 border-purple-800/60';
      case 'ai_agent':
        return 'bg-cyan-950/70 text-cyan-400 border-cyan-800/60';
      case 'search_engine':
        return 'bg-blue-950/70 text-blue-400 border-blue-800/60';
      case 'human':
        return 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60';
      default:
        return 'bg-amber-950/70 text-amber-400 border-amber-800/60';
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'llm_training':
        return 'AI Pre-trainer';
      case 'ai_agent':
        return 'AI Inference / RAG';
      case 'search_engine':
        return 'Search Crawler';
      case 'human':
        return 'Organic Human';
      default:
        return 'Automated Tool';
    }
  };

  const getVerificationBadge = (status?: string, verifiedOrigin?: boolean) => {
    if (status === 'verified' || verifiedOrigin) {
      return (
        <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/50 px-1.5 py-0.5 rounded font-mono inline-flex items-center space-x-1" title="Network CIDR matched official publisher ranges">
          <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
          <span>Verified CIDR</span>
        </span>
      );
    }
    if (status === 'claimed') {
      return (
        <span className="text-[10px] bg-blue-950 text-blue-400 border border-blue-800/50 px-1.5 py-0.5 rounded font-mono" title="Declared User-Agent signature without network CIDR proof">
          Claimed UA
        </span>
      );
    }
    if (status === 'inferred') {
      return (
        <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/50 px-1.5 py-0.5 rounded font-mono" title="Inferred via behavioral/sensor heuristics">
          Inferred
        </span>
      );
    }
    return (
      <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded font-mono" title="Unverified or ambiguous source">
        Unverified
      </span>
    );
  };

  const overview = data?.overview || {
    total: 0,
    categories: { human: 0, llm_training: 0, ai_agent: 0, search_engine: 0, generic_bot: 0 },
    aiSharePct: 0,
    humanSharePct: 0,
  };

  const isDemoActive = data?.isDemo ?? false;
  const currentSite = data?.selectedSite || data?.sites?.find((s) => s.id === selectedSiteId);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-[#0c1220]/80 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Activity className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-lg text-white">Traffic<span className="text-indigo-400">Pulse</span></span>
              <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/50 text-indigo-300">v2.0-epistemic</span>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-800" />

          {/* Site Selector */}
          <div className="flex items-center space-x-2">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {(data?.sites || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.domain}) {s.isDemo ? '🧪 [Demo Sandbox]' : '🔒 [Production]'}
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsNewSiteModalOpen(true)}
              className="p-1 text-slate-400 hover:text-slate-200 rounded border border-slate-800 hover:bg-slate-800 transition text-xs"
              title="Register new site"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {isDemoActive && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 border border-amber-700/60 text-amber-300 flex items-center space-x-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Demo Mode (Simulated Data)</span>
            </span>
          )}

          <button
            onClick={fetchData}
            title="Refresh analytics data"
            className={`p-1.5 text-slate-400 hover:text-slate-200 rounded-md border border-slate-800 hover:bg-slate-800/60 transition ${
              isRefreshing ? 'animate-spin' : ''
            }`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Integration Keys</span>
          </button>
        </div>
      </header>

      {/* Demo Sandbox Alert Banner */}
      {isDemoActive && (
        <div className="bg-gradient-to-r from-amber-950/60 to-slate-900 border-b border-amber-800/50 px-6 py-2.5 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Simulated Dataset:</strong> You are currently viewing the isolated demo sandbox. Production environments never inject synthetic traffic. To monitor your live website, register a site and connect the tracker SDK or edge middleware.
            </span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                activeTab === 'overview'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Executive Overview
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                activeTab === 'live'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>Live Agent Stream</span>
            </button>
            <button
              onClick={() => setActiveTab('endpoints')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                activeTab === 'endpoints'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Targeted Endpoints
            </button>
            <button
              onClick={() => setActiveTab('defense')}
              className={`flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                activeTab === 'defense'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI Defense Rules</span>
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Authoritative Server Classifier: Active</span>
          </div>
        </div>

        {/* Empty State when no events exist */}
        {overview.total === 0 && (
          <div className="bg-[#0f172a]/80 border border-slate-800 rounded-xl p-10 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-950/80 border border-indigo-700/50 text-indigo-400 flex items-center justify-center mx-auto">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">No Ingested Traffic Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                This site currently has zero recorded events. TrafficPulse never fabricates artificial traffic in production. Connect your site using the integration snippet below to begin receiving real-time analytics.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold shadow-md transition"
            >
              <Code2 className="w-4 h-4" />
              <span>View Integration Snippet</span>
            </button>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && overview.total > 0 && (
          <div className="space-y-6">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Total Ingested Events</span>
                  <Activity className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white tracking-tight">{overview.total.toLocaleString()}</div>
                <div className="mt-2 text-[11px] text-slate-400">Past 24 hours recorded</div>
              </div>

              <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-purple-400 text-xs font-medium mb-2">
                  <span>AI Pre-trainers</span>
                  <BrainCircuit className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-purple-300 tracking-tight">
                  {overview.categories.llm_training.toLocaleString()}
                </div>
                <div className="mt-2 text-[11px] text-purple-400/80">
                  {overview.total > 0
                    ? Math.round((overview.categories.llm_training / overview.total) * 100)
                    : 0}
                  % of total web traffic
                </div>
              </div>

              <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-cyan-400 text-xs font-medium mb-2">
                  <span>AI Inference / RAG</span>
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold text-cyan-300 tracking-tight">
                  {overview.categories.ai_agent.toLocaleString()}
                </div>
                <div className="mt-2 text-[11px] text-cyan-400/80">
                  {overview.total > 0
                    ? Math.round((overview.categories.ai_agent / overview.total) * 100)
                    : 0}
                  % real-time agents
                </div>
              </div>

              <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-emerald-400 text-xs font-medium mb-2">
                  <span>Organic Humans</span>
                  <Users className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-300 tracking-tight">
                  {overview.categories.human.toLocaleString()}
                </div>
                <div className="mt-2 text-[11px] text-emerald-400/80">{overview.humanSharePct}% inferred humans</div>
              </div>

              <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-amber-400 text-xs font-medium mb-2">
                  <span>Scrapers & Search</span>
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-amber-300 tracking-tight">
                  {(overview.categories.generic_bot + overview.categories.search_engine).toLocaleString()}
                </div>
                <div className="mt-2 text-[11px] text-amber-400/80">Search & headless bots</div>
              </div>
            </div>

            {/* AI Consumption Index Banner */}
            <div className="bg-gradient-to-r from-purple-950/40 via-indigo-950/40 to-slate-900 border border-purple-900/40 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-purple-300 flex items-center space-x-2">
                  <BrainCircuit className="w-4 h-4 text-purple-400" />
                  <span>AI Ingestion Ratio: {overview.aiSharePct}% of your site&apos;s hits are from AI-associated crawlers</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  Note: Detecting an AI crawler signature indicates network access by known AI infrastructure, but does not prove whether content was retained for training weights or real-time inference.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('defense')}
                  className="px-3 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-md transition shadow-md shadow-purple-600/30"
                >
                  Configure AI Rules
                </button>
              </div>
            </div>

            {/* Split Grid: Top Actors & Quick Stream */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Actors */}
              <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                    <Bot className="w-4 h-4 text-indigo-400" />
                    <span>Top Identified Actors</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">By Request Volume</span>
                </div>

                <div className="space-y-3">
                  {(data?.topActors || []).map((actor, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/50 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-mono text-slate-500 w-4">{idx + 1}</span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-white">{actor.name}</span>
                            {actor.verified > 0 ? (
                              <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800/50 px-1.5 py-0.2 rounded font-mono flex items-center space-x-0.5">
                                <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                                <span>Verified CIDR</span>
                              </span>
                            ) : (
                              <span className="text-[9px] bg-slate-900 text-slate-400 border border-slate-800 px-1.5 py-0.2 rounded font-mono">
                                Claimed Signature
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded border font-mono inline-block mt-0.5 ${getCategoryColor(actor.category)}`}>
                            {getCategoryLabel(actor.category)}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-200">{actor.count.toLocaleString()}</span>
                        <div className="text-[10px] text-slate-400">{actor.share}% share</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Live Stream */}
              <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <span>Recent Incoming Hits</span>
                  </h3>
                  <button
                    onClick={() => setActiveTab('live')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <span>Inspect all</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 max-h-[380px] font-mono text-xs">
                  {(data?.liveEvents || []).slice(0, 7).map((evt) => (
                    <div
                      key={evt.id}
                      className="p-2 rounded bg-slate-900/80 border border-slate-800/60 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-[10px] text-indigo-400 font-bold">{evt.method}</span>
                        <span className="text-slate-300 truncate max-w-[140px]" title={evt.path}>
                          {evt.path}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getCategoryColor(evt.trafficCategory)}`}>
                          {evt.actorName || evt.botIdentifier || evt.trafficCategory}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE AGENT STREAM */}
        {activeTab === 'live' && (
          <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Real-Time Ingestion Log & Epistemic Audit</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Server-authoritative classifications with evidence-based verification status
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-400 font-mono">Ingestion Pipeline Online</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3">Method / Path</th>
                    <th className="py-2.5 px-3">Actor Type</th>
                    <th className="py-2.5 px-3">Identifier</th>
                    <th className="py-2.5 px-3">Verification</th>
                    <th className="py-2.5 px-3">Confidence</th>
                    <th className="py-2.5 px-3">IP (Masked)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(data?.liveEvents || []).map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-900/60 transition">
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(evt.timestamp).toISOString().slice(11, 19)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-indigo-400 font-bold mr-1.5">{evt.method}</span>
                        <span className="text-slate-200">{evt.path}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getCategoryColor(evt.trafficCategory)}`}>
                          {evt.actorType || getCategoryLabel(evt.trafficCategory)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-semibold whitespace-nowrap">
                        {evt.actorName || evt.botIdentifier || '-'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {getVerificationBadge(evt.verificationStatus, evt.verifiedOrigin)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-400" title="Heuristic confidence score based on available evidence">
                        {evt.confidence ? `${Math.round(evt.confidence * 100)}% (heur.)` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{evt.ip || 'Masked'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: TARGETED ENDPOINTS */}
        {activeTab === 'endpoints' && (
          <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                <FileCode2 className="w-4 h-4 text-indigo-400" />
                <span>Targeted Endpoints & AI Crawler Breakdown</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Observed endpoint query volume across AI crawlers and human visitors.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3">Path</th>
                    <th className="py-2.5 px-3">Total Requests</th>
                    <th className="py-2.5 px-3">AI Hits</th>
                    <th className="py-2.5 px-3">Human Hits</th>
                    <th className="py-2.5 px-3">AI Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(data?.topEndpoints || []).map((ep, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/60 transition">
                      <td className="py-2.5 px-3 font-semibold text-indigo-300">{ep.path}</td>
                      <td className="py-2.5 px-3 text-slate-200">{ep.total.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-purple-400">{ep.aiRequests.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-emerald-400">{ep.humanRequests.toLocaleString()}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-500 h-full rounded-full"
                              style={{ width: `${ep.aiRatio}%` }}
                            />
                          </div>
                          <span className="text-slate-300 text-[11px]">{ep.aiRatio}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: DEFENSE & ROBOTS.TXT GENERATOR */}
        {activeTab === 'defense' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-200 mb-1 flex items-center space-x-2">
                <FileCode2 className="w-4 h-4 text-purple-400" />
                <span>Tailored AI robots.txt Preset</span>
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Recommended directives to permit real-time RAG inference while disallowing bulk foundation model harvesters.
              </p>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto">
                <span className="text-slate-500"># Permit AI Search & Retrieval (Perplexity, ChatGPT Search)</span><br />
                User-agent: PerplexityBot<br />
                Allow: /<br /><br />
                User-agent: OAI-SearchBot<br />
                Allow: /<br /><br />
                <span className="text-slate-500"># Disallow Bulk Foundation Model Pre-training</span><br />
                User-agent: GPTBot<br />
                Disallow: /<br /><br />
                User-agent: ClaudeBot<br />
                Disallow: /<br /><br />
                User-agent: CCBot<br />
                Disallow: /<br /><br />
                User-agent: Bytespider<br />
                Disallow: /<br />
              </div>
            </div>

            <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-200 mb-1 flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-indigo-400" />
                <span>Cloudflare WAF Custom Rule</span>
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Deploy this rule in Cloudflare Security Rules to challenge unauthorized scraping bots.
              </p>

              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono text-xs text-indigo-300 leading-relaxed overflow-x-auto">
                (http.user_agent contains &quot;Bytespider&quot; or http.user_agent contains &quot;Diffbot&quot; or (http.user_agent contains &quot;HeadlessChrome&quot; and not cf.client.bot))
              </div>

              <div className="mt-4 p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-200">
                💡 <strong>Dynamic Enforcement:</strong> Use TrafficPulse&apos;s Next.js Edge Middleware to automatically challenge scrapers directly in code.
              </div>
            </div>
          </div>
        )}
      </main>

      {/* INTEGRATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <Code2 className="w-5 h-5 text-indigo-400" />
                  <span>Integration Credentials: {currentSite?.name || 'Site'}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connect your web applications using privacy-preserving micro-sensor or zero-latency edge middleware.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 text-xs space-y-1 font-mono">
                <div className="text-slate-400">Site ID: <span className="text-white font-bold">{currentSite?.id || selectedSiteId}</span></div>
                <div className="text-slate-400">Server API Key: <span className="text-indigo-400 font-bold">{currentSite?.apiKey || 'tp_live_...'}</span></div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-200 mb-1">Option A: HTML Script Tag (Drop-in Browser Sensor)</h4>
                <div className="relative">
                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
{`<script defer 
  src="${typeof window !== 'undefined' ? window.location.origin : 'https://trafficpulse.mycompany.io'}/trafficpulse.js" 
  data-site-id="${currentSite?.id || selectedSiteId}"
></script>`}
                  </pre>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `<script defer src="${typeof window !== 'undefined' ? window.location.origin : 'https://trafficpulse.mycompany.io'}/trafficpulse.js" data-site-id="${currentSite?.id || selectedSiteId}"></script>`,
                        'script'
                      )
                    }
                    className="absolute top-2.5 right-2.5 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-200 mb-1">Option B: Next.js Edge Middleware (Authenticated Ingestion)</h4>
                <div className="relative">
                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-indigo-300 overflow-x-auto">
{`// middleware.ts
import { withTrafficPulse } from '@trafficpulse/middleware';

export default withTrafficPulse({
  siteId: '${currentSite?.id || selectedSiteId}',
  apiKey: '${currentSite?.apiKey || 'tp_live_...'}',
  apiHost: '${typeof window !== 'undefined' ? window.location.origin : 'https://trafficpulse.mycompany.io'}',
});`}
                  </pre>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `import { withTrafficPulse } from '@trafficpulse/middleware';\n\nexport default withTrafficPulse({\n  siteId: '${currentSite?.id || selectedSiteId}',\n  apiKey: '${currentSite?.apiKey || 'tp_live_...'}',\n  apiHost: '${typeof window !== 'undefined' ? window.location.origin : 'https://trafficpulse.mycompany.io'}',\n});`,
                        'next'
                      )
                    }
                    className="absolute top-2.5 right-2.5 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    {copiedNext ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGISTER NEW SITE MODAL */}
      {isNewSiteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                <span>Register New Site</span>
              </h2>
              <button
                onClick={() => setIsNewSiteModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSite} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Domain (e.g. example.com)</label>
                <input
                  type="text"
                  required
                  placeholder="analytics.example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Display Name (optional)</label>
                <input
                  type="text"
                  placeholder="Production Web App"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewSiteModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSite}
                  className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition shadow"
                >
                  {isCreatingSite ? 'Registering...' : 'Register Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between">
        <div>
          <span>TrafficPulse &copy; 2026 Amal Nair. Released under Apache 2.0.</span>
        </div>
        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <a
            href="https://github.com/mythicavalon/TrafficPulse"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-400 flex items-center space-x-1"
          >
            <span>GitHub Repository</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}
