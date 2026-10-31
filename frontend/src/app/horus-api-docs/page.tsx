'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen,
  Server,
  KeyRound,
  Copy,
  Play,
  CheckCircle2,
  Database,
  ShieldCheck,
  Search,
  Code2,
  Layers,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface DocEndpoint {
  name: string;
  method: string;
  path: string;
  type: 'HORUS_HTTP' | 'HORUS_SQL_COMPLEMENT';
  summary: string;
  query_params: Array<{ name: string; type: string; desc: string }>;
  response_example: any;
}

interface DocCategory {
  category: string;
  badge: string;
  description: string;
  endpoints: DocEndpoint[];
}

interface DocPayload {
  title: string;
  version: string;
  base_endpoint: string;
  auth_modes: Array<{ type: string; header: string; description: string }>;
  pagination_rules: {
    offset_param: string;
    limit_param: string;
    max_limit: number;
    note: string;
  };
  categories: DocCategory[];
}

export default function HorusApiDocsPage() {
  const [doc, setDoc] = useState<DocPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<DocEndpoint | null>(null);

  // Live Tester state
  const [testToken, setTestToken] = useState('');
  const [testUsername, setTestUsername] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [testQueryString, setTestQueryString] = useState('OFFSET=0&LIMIT=5');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: number; body: any } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await fetch(`${apiUrl}/horus-api-bridge/documentation`);
        if (res.ok) {
          const data: DocPayload = await res.json();
          setDoc(data);
          if (data.categories?.[0]?.endpoints?.[0]) {
            setSelectedEndpoint(data.categories[0].endpoints[0]);
          }
        }
      } catch {
        // fallback silencioso
      } finally {
        setLoading(false);
      }
    }
    loadDocs();
  }, [apiUrl]);

  async function handleRunLiveTest(ep: DocEndpoint) {
    setTesting(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (testToken.trim()) {
        headers['Authorization'] = `Bearer ${testToken.trim()}`;
      } else if (testUsername.trim() && testPassword.trim()) {
        headers['Authorization'] = `Basic ${btoa(`${testUsername.trim()}:${testPassword.trim()}`)}`;
      }

      const qs = testQueryString.trim().replace(/^\?/, '');
      const fullUrl = `${apiUrl}/Horus/api/TServerB2B/${ep.path}${qs ? `?${qs}` : ''}`;

      const res = await fetch(fullUrl, {
        method: ep.method,
        headers,
      });
      const body = await res.json().catch(() => ({ raw: 'Sem JSON' }));
      setTestResult({ status: res.status, body });
    } catch (e: any) {
      setTestResult({ status: 0, body: { erro: e?.message || String(e) } });
    } finally {
      setTesting(false);
    }
  }

  function copyToClipboard(label: string, text: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
        <span className="text-sm font-semibold">Carregando Documentação Oficial Horus B2B Gateway...</span>
      </div>
    );
  }

  const filteredCategories = (doc?.categories || []).map(cat => ({
    ...cat,
    endpoints: cat.endpoints.filter(
      ep =>
        !searchTerm.trim() ||
        ep.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ep.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ep.summary.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter(cat => cat.endpoints.length > 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20 px-4 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-600/30 font-black text-lg text-white">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold text-white">
                API HORUS S.I.G.A &amp; B2B Complementar — Documentação Oficial
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                v{doc?.version || '1.0.0'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Gateway Padronizado TServerB2B + Endpoints Financeiros Seguros via HorusAPIBridge.exe (Sem liberação de porta no Firewall)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar endpoint (ex: Busca_Acervo)..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Base URL Card */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5" /> Endpoint Base REST JSON
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard('Endpoint Base', doc?.base_endpoint || '')}
                className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 break-all">
              {doc?.base_endpoint}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Compatível 100% com a estrutura nativa <code className="text-slate-200">/Horus/api/TServerB2B/</code>. Aceita{' '}
              <strong>Basic Auth (Usuário/Senha)</strong> ou <strong>Bearer Token / X-API-Key</strong>.
            </p>
          </div>

          {/* Categories & Endpoints List */}
          <div className="space-y-4">
            {filteredCategories.map(cat => (
              <div key={cat.category} className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-200">{cat.category}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      cat.badge.includes('Exclusivo')
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {cat.badge}
                  </span>
                </div>
                <div className="divide-y divide-slate-800/60">
                  {cat.endpoints.map(ep => {
                    const active = selectedEndpoint?.path === ep.path;
                    return (
                      <button
                        key={ep.path}
                        type="button"
                        onClick={() => {
                          setSelectedEndpoint(ep);
                          setTestResult(null);
                        }}
                        className={`w-full text-left px-4 py-3 flex items-start gap-2.5 transition-colors ${
                          active ? 'bg-purple-600/15 border-l-4 border-l-purple-500' : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 mt-0.5 ${
                            ep.method === 'GET'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {ep.method}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-100 truncate">{ep.path}</p>
                          <p className="text-[11px] text-slate-400 line-clamp-1">{ep.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Endpoint Detail & Interactive Tester */}
        <main className="lg:col-span-8 space-y-6">
          {/* Auth & Governance Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {doc?.auth_modes.map(m => (
              <div key={m.type} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                <p className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> {m.type}
                </p>
                <code className="block text-[11px] font-mono bg-slate-950 p-2 rounded-lg text-slate-200 border border-slate-800">
                  {m.header}
                </code>
                <p className="text-[11px] text-slate-400">{m.description}</p>
              </div>
            ))}
          </div>

          {selectedEndpoint && (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden space-y-6 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                        selectedEndpoint.method === 'GET'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {selectedEndpoint.method}
                    </span>
                    <h2 className="text-lg font-extrabold text-white font-mono">
                      /Horus/api/TServerB2B/{selectedEndpoint.path}
                    </h2>
                  </div>
                  <p className="text-sm font-bold text-slate-200 mt-2">{selectedEndpoint.name}</p>
                  <p className="text-xs text-slate-400 mt-1">{selectedEndpoint.summary}</p>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                    selectedEndpoint.type === 'HORUS_SQL_COMPLEMENT'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  }`}
                >
                  {selectedEndpoint.type === 'HORUS_SQL_COMPLEMENT'
                    ? '⚡ SQL Complementar via .EXE'
                    : '🌐 API Nativa Horus via .EXE'}
                </span>
              </div>

              {/* Query Params Table */}
              {selectedEndpoint.query_params.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Parâmetros de Filtro (QueryString)
                  </h3>
                  <div className="overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Parâmetro</th>
                          <th className="py-2.5 px-3">Tipo</th>
                          <th className="py-2.5 px-3">Descrição</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedEndpoint.query_params.map(qp => (
                          <tr key={qp.name} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 font-mono font-bold text-purple-300">{qp.name}</td>
                            <td className="py-2 px-3 text-slate-400">{qp.type}</td>
                            <td className="py-2 px-3 text-slate-300">{qp.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Response Example */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Code2 className="h-4 w-4 text-purple-400" /> Exemplo de Resposta Padronizada (JSON)
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard('JSON Exemplo', JSON.stringify(selectedEndpoint.response_example, null, 2))
                    }
                    className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" /> Copiar JSON
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto">
                  {JSON.stringify(selectedEndpoint.response_example, null, 2)}
                </pre>
              </div>

              {/* Interactive Live Tester */}
              <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <Play className="h-3.5 w-3.5" /> Testador Interativo Ao Vivo (Bate no Gateway → Agente .EXE)
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Token API (Bearer / X-API-Key)
                    </label>
                    <input
                      type="text"
                      value={testToken}
                      onChange={e => setTestToken(e.target.value)}
                      placeholder="hb2b_live_..."
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Ou Usuário (Basic Auth)
                    </label>
                    <input
                      type="text"
                      value={testUsername}
                      onChange={e => setTestUsername(e.target.value)}
                      placeholder="horus_1_..."
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Senha (Basic Auth)
                    </label>
                    <input
                      type="password"
                      value={testPassword}
                      onChange={e => setTestPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={testQueryString}
                    onChange={e => setTestQueryString(e.target.value)}
                    placeholder="QueryString (ex: OFFSET=0&LIMIT=5)"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={testing}
                    onClick={() => handleRunLiveTest(selectedEndpoint)}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Testar Requisição
                  </button>
                </div>

                {testResult && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300">Resposta Recebida:</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          testResult.status >= 200 && testResult.status < 300
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        HTTP {testResult.status}
                      </span>
                    </div>
                    <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 max-h-72 overflow-auto">
                      {JSON.stringify(testResult.body, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
