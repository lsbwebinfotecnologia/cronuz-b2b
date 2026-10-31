'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, Loader2, CheckCircle2, AlertTriangle, Settings2, Route, Save, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { useCompany } from '../context';
import CoraSettingsPanel from '@/components/payments/CoraSettingsPanel';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Provider {
  code: string;
  name: string;
  methods: string[];
  config_location: 'HUB' | 'SELLER_SETTINGS';
  operational: boolean;
  enabled: boolean;
  configured: boolean;
  detail: string;
}
interface Channel { code: string; name: string; methods: string[] }
interface Hub {
  providers: Provider[];
  channels: Channel[];
  method_labels: Record<string, string>;
  routes: Record<string, Record<string, string>>;
}

const METHOD_ORDER = ['BOLETO', 'PIX', 'CARD', 'LINK'];

export default function CompanyPaymentsHubPage() {
  const { company } = useCompany();
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Record<string, Record<string, string>>>({});
  const [savingRoutes, setSavingRoutes] = useState(false);
  const [openConfig, setOpenConfig] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const apply = (data: Hub) => { setHub(data); setRoutes(data.routes || {}); };

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const res = await fetch(`${API}/companies/${company.id}/payments/hub`, { headers: headers() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || 'Erro ao carregar o Hub de Pagamentos.');
      apply(body);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => { load(); }, [load]);

  const toggleProvider = async (p: Provider) => {
    if (!company) return;
    if (p.enabled && !confirm(`Desabilitar ${p.name} para este seller? As rotas que usam ${p.name} serão removidas.`)) return;
    setToggling(p.code);
    try {
      const res = await fetch(`${API}/companies/${company.id}/payments/providers/${p.code}`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ enabled: !p.enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || 'Erro ao atualizar intermediador.');
      apply(body);
      toast.success(`${p.name} ${!p.enabled ? 'habilitado' : 'desabilitado'}${body.removed_routes ? ` · ${body.removed_routes} rota(s) removida(s)` : ''}.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setToggling(null);
    }
  };

  const setRoute = (channel: string, method: string, provider: string) => {
    setRoutes(prev => {
      const next = { ...prev, [channel]: { ...(prev[channel] || {}) } };
      if (provider) next[channel][method] = provider; else delete next[channel][method];
      return next;
    });
  };

  const saveRoutes = async () => {
    if (!company || !hub) return;
    const items: { channel: string; method: string; provider: string | null }[] = [];
    hub.channels.forEach(ch => ch.methods.forEach(m => items.push({ channel: ch.code, method: m, provider: routes[ch.code]?.[m] || null })));
    setSavingRoutes(true);
    try {
      const res = await fetch(`${API}/companies/${company.id}/payments/routes`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ routes: items }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || 'Erro ao salvar roteamento.');
      apply(body);
      toast.success('Roteamento salvo.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingRoutes(false);
    }
  };

  if (loading || !hub || !company) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  const enabledProviders = hub.providers.filter(p => p.enabled);
  const routesDirty = JSON.stringify(routes) !== JSON.stringify(hub.routes || {});

  return (
    <div className="p-3 md:p-6 space-y-6 overflow-y-auto max-h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
          <Wallet className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Pagamentos &amp; Bancos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Habilite intermediadores e defina qual atende cada canal e forma de pagamento.</p>
        </div>
      </div>

      {/* 1. Intermediadores */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Settings2 className="h-4 w-4" /> 1. Intermediadores habilitados</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {hub.providers.map(p => (
            <div key={p.code} className={`rounded-xl border p-4 space-y-3 ${p.enabled ? 'border-indigo-300 bg-indigo-50/40 dark:border-indigo-800 dark:bg-indigo-950/10' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.methods.map(m => (
                      <span key={m} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{hub.method_labels[m] || m}</span>
                    ))}
                  </div>
                </div>
                {toggling === p.code ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : (
                  <label className="relative inline-flex cursor-pointer items-center shrink-0">
                    <input type="checkbox" className="sr-only peer" checked={p.enabled} onChange={() => toggleProvider(p)} />
                    <div className="peer h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-indigo-600 transition-colors dark:bg-slate-700 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                )}
              </div>
              <p className={`text-xs flex items-center gap-1.5 ${p.configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                {p.configured ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                {p.detail}
              </p>
              {!p.operational && (
                <p className="text-[11px] text-slate-500 flex items-start gap-1"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Ainda opera pelo fluxo atual; entra no Hub na fase de migração.</p>
              )}
              {p.config_location === 'HUB' && (
                <button onClick={() => setOpenConfig(openConfig === p.code ? null : p.code)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800">
                  {openConfig === p.code ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Configurar (suporte)
                </button>
              )}
            </div>
          ))}
        </div>

        {openConfig === 'CORA' && (
          <div className="rounded-xl border border-pink-200 dark:border-pink-900/50 p-3 md:p-5">
            <CoraSettingsPanel companyId={company.id} embedded />
          </div>
        )}
      </section>

      {/* 2. Roteamento */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Route className="h-4 w-4" /> 2. Roteamento por canal</h2>
          <button onClick={saveRoutes} disabled={savingRoutes || !routesDirty}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {savingRoutes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar roteamento
          </button>
        </div>
        <p className="text-xs text-slate-500">Cada canal e forma de pagamento usa um único intermediador, o que evita conflito. Só aparecem os habilitados que suportam a forma.</p>

        {enabledProviders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500">Habilite ao menos um intermediador para definir o roteamento.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3 text-left">Canal</th>
                  {METHOD_ORDER.map(m => <th key={m} className="p-3 text-left">{hub.method_labels[m]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {hub.channels.map(ch => (
                  <tr key={ch.code}>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">{ch.name}</td>
                    {METHOD_ORDER.map(m => {
                      if (!ch.methods.includes(m)) return <td key={m} className="p-3 text-slate-300">—</td>;
                      const options = enabledProviders.filter(p => p.methods.includes(m));
                      return (
                        <td key={m} className="p-2">
                          <select value={routes[ch.code]?.[m] || ''} onChange={e => setRoute(ch.code, m, e.target.value)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs">
                            <option value="">Nenhum</option>
                            {options.map(p => <option key={p.code} value={p.code}>{p.name}{p.operational ? '' : ' (fluxo atual)'}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
