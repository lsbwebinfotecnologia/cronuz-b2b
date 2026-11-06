'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingBag,
  Globe,
  Save,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Database,
  ExternalLink,
  Copy,
  ListTree,
  Landmark,
  Image as ImageIcon,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { useCompany } from '../context';

export default function MasterB2CSettingsPage() {
  const params = useParams();
  const companyId = Number(params.id);
  const { company, refreshCompany } = useCompany();

  const [loading, setLoading] = useState(true);
  const [savingDomain, setSavingDomain] = useState(false);
  const [togglingModule, setTogglingModule] = useState(false);

  const [b2cDomain, setB2cDomain] = useState('');
  const [storefrontOpen, setStorefrontOpen] = useState(true);

  const [syncConfig, setSyncConfig] = useState({
    horus_enabled: false,
    horus_company: '',
    horus_branch: '',
    horus_stock_local: '',
    horus_legacy_pagination: false,
    local_products_count: 0,
    cod_tpo_caract: '',
    cod_caract: '',
    characteristic_type_name: '',
    characteristic_value: '',
    auto_collect_bookinfo_covers: false,
    last_sync_at: null as string | null,
    last_sync_mode: null as string | null,
    last_created_count: 0,
    last_updated_count: 0,
    last_stock_updated_count: 0,
    last_horus_api_summary: null as any,
  });

  const [savingSyncConfig, setSavingSyncConfig] = useState(false);
  const [testingHorus, setTestingHorus] = useState(false);
  const [syncingHorus, setSyncingHorus] = useState(false);
  const [horusApiPreview, setHorusApiPreview] = useState<any>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const [settingsRes, syncRes] = await Promise.all([
        fetch(`${apiUrl}/companies/${companyId}/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/b2c/products/sync-config?company_id=${companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        setStorefrontOpen(sData.b2c_storefront_open !== false);
      }

      if (syncRes.ok) {
        const sc = await syncRes.json();
        setSyncConfig({
          horus_enabled: Boolean(sc.horus_enabled),
          horus_company: sc.horus_company || '',
          horus_branch: sc.horus_branch || '',
          horus_stock_local: sc.horus_stock_local || '',
          horus_legacy_pagination: Boolean(sc.horus_legacy_pagination),
          local_products_count: Number(sc.local_products_count || 0),
          cod_tpo_caract: sc.cod_tpo_caract || '',
          cod_caract: sc.cod_caract || '',
          characteristic_type_name: sc.characteristic_type_name || '',
          characteristic_value: sc.characteristic_value || '',
          auto_collect_bookinfo_covers: Boolean(sc.auto_collect_bookinfo_covers),
          last_sync_at: sc.last_sync_at || null,
          last_sync_mode: sc.last_sync_mode || null,
          last_created_count: Number(sc.last_created_count || 0),
          last_updated_count: Number(sc.last_updated_count || 0),
          last_stock_updated_count: Number(sc.last_stock_updated_count || 0),
          last_horus_api_summary: sc.last_horus_api_summary || null,
        });
      }
    } catch {
      toast.error('Erro ao carregar configurações B2C.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, companyId]);

  useEffect(() => {
    if (company) {
      setB2cDomain((company as any).b2c_custom_domain || '');
    }
  }, [company]);

  useEffect(() => {
    if (companyId) loadData();
  }, [companyId, loadData]);

  const rawDom = (company?.domain || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  const slug = (rawDom.split(/[.@]/)[0] || `empresa-${companyId}`).toLowerCase();
  const autoSubdomain = `b2c-${slug}.horusb2b.com.br`;
  const publicStorePath = `/loja/${slug}`;
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const openStoreHref = isLocalHost
    ? publicStorePath
    : b2cDomain
    ? `https://${b2cDomain}`
    : `https://${autoSubdomain}`;

  const handleToggleB2CModule = async () => {
    if (!company) return;
    setTogglingModule(true);
    try {
      const token = getToken();
      const nextVal = !Boolean((company as any).module_b2c_storefront);
      const res = await fetch(`${apiUrl}/companies/${companyId}/modules`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          module_b2c_storefront: nextVal,
        }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar módulo B2C.');
      toast.success(`Módulo B2C ${nextVal ? 'habilitado' : 'desabilitado'} com sucesso!`);
      refreshCompany();
    } catch {
      toast.error('Erro ao atualizar módulo B2C.');
    } finally {
      setTogglingModule(false);
    }
  };

  const handleSaveB2CDomainAndStatus = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!company) return;
    setSavingDomain(true);
    try {
      const token = getToken();
      const cleanDomain = b2cDomain
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '')
        .toLowerCase();

      const [compRes, setRes] = await Promise.all([
        fetch(`${apiUrl}/companies/${companyId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: company.name,
            document: company.document,
            domain: company.domain,
            custom_domain: company.custom_domain || null,
            b2c_custom_domain: cleanDomain || null,
            tenant_id: company.tenant_id || 'cronuz',
            business_model: (company as any).business_model || 'B2B_CRONUZ',
          }),
        }),
        fetch(`${apiUrl}/companies/${companyId}/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            b2c_storefront_open: storefrontOpen,
          }),
        }),
      ]);

      if (!compRes.ok || !setRes.ok) {
        throw new Error('Falha ao salvar configurações B2C.');
      }
      setB2cDomain(cleanDomain);
      toast.success('Domínio e status da Loja B2C atualizados com sucesso!');
      refreshCompany();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar domínio B2C.');
    } finally {
      setSavingDomain(false);
    }
  };

  const handleSaveSyncConfig = async (resetLastSync: boolean = false) => {
    setSavingSyncConfig(true);
    try {
      const token = getToken();
      const payload: any = {
        cod_tpo_caract: syncConfig.cod_tpo_caract,
        cod_caract: syncConfig.cod_caract,
        auto_collect_bookinfo_covers: syncConfig.auto_collect_bookinfo_covers,
      };
      if (resetLastSync) {
        payload.custom_data_ini = '';
      }
      const res = await fetch(`${apiUrl}/b2c/products/sync-config?company_id=${companyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          resetLastSync
            ? 'Data da última sincronia resetada!'
            : data.message || 'Filtro de sincronização B2C salvo!'
        );
        await loadData();
      } else {
        toast.error(data.detail || 'Erro ao salvar filtro Horus.');
      }
    } catch {
      toast.error('Erro de conexão ao salvar filtro Horus.');
    } finally {
      setSavingSyncConfig(false);
    }
  };

  const handleTestHorusCharacteristics = async () => {
    setTestingHorus(true);
    try {
      const token = getToken();
      const qs = new URLSearchParams({ company_id: String(companyId) });
      if (syncConfig.cod_tpo_caract) qs.set('cod_tpo_caract', syncConfig.cod_tpo_caract);
      if (syncConfig.cod_caract) qs.set('cod_caract', syncConfig.cod_caract);
      const res = await fetch(`${apiUrl}/b2c/products/horus-characteristics?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHorusApiPreview(data);
      if (res.ok && data.ok) {
        toast.success('Retorno da API Horus validado com sucesso!');
      } else {
        toast.error(data.warning || data.detail || 'Alerta de parâmetros retornado pelo Horus.');
      }
    } catch {
      toast.error('Erro ao consultar a API do Horus.');
    } finally {
      setTestingHorus(false);
    }
  };

  const handleRunHorusSync = async (forceFullSync: boolean = false) => {
    setSyncingHorus(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/b2c/products/sync-horus?company_id=${companyId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cod_tpo_caract: syncConfig.cod_tpo_caract,
          cod_caract: syncConfig.cod_caract,
          auto_collect_bookinfo_covers: syncConfig.auto_collect_bookinfo_covers,
          full_sync: forceFullSync,
          max_items: 10000,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Sincronização de produtos B2C concluída!');
        if (data.horus_api_summary) {
          setHorusApiPreview({
            ok: true,
            horus_raw_response: data.horus_api_summary,
          });
        }
        await loadData();
      } else {
        setHorusApiPreview({
          ok: false,
          warning: data.detail || 'Falha na API do Horus.',
          horus_raw_response: data,
        });
        toast.error(data.detail || 'Falha ao sincronizar produtos do Horus.');
      }
    } catch {
      toast.error('Erro de conexão durante a sincronização.');
    } finally {
      setSyncingHorus(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando central B2C...
      </div>
    );
  }

  const isModuleEnabled = Boolean((company as any)?.module_b2c_storefront);
  const customHostParts = b2cDomain.trim().split('.');
  const dnsHostSubdomain =
    customHostParts.length >= 3 ? customHostParts[0] : 'loja';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      {/* Header B2C */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                B2C — Loja Virtual Aberta
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  isModuleEnabled
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {isModuleEnabled ? 'Módulo B2C Ativo' : 'Módulo B2C Inativo'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Gerencie o domínio B2C, apontamento DNS e parâmetros de sincronização de produtos do Horus ERP para a loja B2C de <strong>{company?.name}</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={openStoreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
            Abrir Loja B2C ({isLocalHost ? publicStorePath : b2cDomain || autoSubdomain})
          </a>
        </div>
      </div>

      {/* 1. Status do Módulo B2C & Domínios / Zona DNS */}
      <form
        onSubmit={handleSaveB2CDomainAndStatus}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Status da Loja &amp; Domínio B2C (DNS)
              </h2>
              <p className="text-xs text-slate-500">
                Subdomínio automático <code className="font-mono">{autoSubdomain}</code> e configuração de domínio próprio do cliente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={togglingModule}
              onClick={handleToggleB2CModule}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isModuleEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {togglingModule
                ? 'Atualizando...'
                : isModuleEnabled
                  ? 'Módulo B2C Habilitado ✓'
                  : 'Habilitar Módulo B2C'}
            </button>

            <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={storefrontOpen}
                onChange={(e) => setStorefrontOpen(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              Loja B2C Aberta ao Público
            </label>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Subdomínio Automático */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Subdomínio Pré-Configurado (CNAME Destino)
              </span>
              <div className="flex items-center justify-between gap-2">
                <a
                  href={`https://${autoSubdomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                >
                  {autoSubdomain}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(autoSubdomain);
                    toast.success('Subdomínio B2C copiado!');
                  }}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-600 dark:text-slate-300 shrink-0"
                  title="Copiar subdomínio"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                SSL HTTPS automático ativo • Rota interna: <code className="font-mono">{publicStorePath}</code>
              </p>
            </div>

            {/* Domínio Próprio do Cliente */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                Domínio Próprio B2C do Cliente (Opcional)
              </label>
              <input
                type="text"
                autoComplete="off"
                data-lpignore="true"
                placeholder="Ex: parceria.movimentoliterario.com.br"
                value={b2cDomain}
                onChange={(e) => setB2cDomain(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-500 block">
                Informe apenas o host sem <code className="font-mono">https://</code> (ex.: <code className="font-mono">parceria.movimentoliterario.com.br</code>).
              </span>
            </div>
          </div>

          {/* Guia Rápido de Zona de DNS */}
          <div className="p-4 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                Instrução de Apontamento na Zona de DNS do Cliente
              </span>
              <span className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                IP Servidor: 64.23.182.183
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-indigo-200/60 dark:border-indigo-900/40 bg-white dark:bg-slate-900">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Cenário</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Nome / Host</th>
                    <th className="py-2 px-3">Destino / Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  <tr>
                    <td className="py-2 px-3 font-sans font-semibold text-slate-700 dark:text-slate-300">
                      Subdomínio (Recomendado)
                    </td>
                    <td className="py-2 px-3 font-bold text-indigo-600">CNAME</td>
                    <td className="py-2 px-3">{dnsHostSubdomain}</td>
                    <td className="py-2 px-3">{autoSubdomain}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">
                      Alternativa por IP Direto
                    </td>
                    <td className="py-2 px-3 font-bold text-emerald-600">A</td>
                    <td className="py-2 px-3">{dnsHostSubdomain} (ou @)</td>
                    <td className="py-2 px-3">64.23.182.183</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingDomain}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {savingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Status &amp; Domínio B2C
            </button>
          </div>
        </div>
      </form>

      {/* 2. Sincronização de Produtos & Estoque Horus ERP -> Base B2C */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-950/40">
          <div className="flex items-start gap-2.5">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Sincronização de Produtos Horus ERP → Base B2C ({syncConfig.local_products_count} produtos locais)
              </h2>
              <p className="text-xs text-slate-500">
                Filtra o acervo do Horus por <code className="font-mono">COD_TPO_CARACT</code> e <code className="font-mono">COD_CARACT</code>, respeitando paginação <code className="font-mono">OFFSET/LIMIT</code> e janela incremental <code className="font-mono">DATA_INI / DATA_FIM</code>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-mono">
              Paginação: <b>{syncConfig.horus_legacy_pagination ? 'Sem OFFSET/LIMIT (Legado)' : 'Com OFFSET/LIMIT'}</b>
            </span>
            {(syncConfig.horus_company || syncConfig.horus_branch) && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-mono">
                SD_*: <b>Emp {syncConfig.horus_company || '-'} / Fil {syncConfig.horus_branch || '-'} / Loc {syncConfig.horus_stock_local || '-'}</b>
              </span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Cód. Tipo Característica (COD_TPO_CARACT)
              </label>
              <input
                type="text"
                placeholder="Ex: 3 (ou vazio se sem restrição)"
                value={syncConfig.cod_tpo_caract}
                onChange={(e) => setSyncConfig((p) => ({ ...p, cod_tpo_caract: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Cód. da Característica (COD_CARACT)
              </label>
              <input
                type="text"
                placeholder="Ex: 235"
                value={syncConfig.cod_caract}
                onChange={(e) => setSyncConfig((p) => ({ ...p, cod_caract: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Última Execução com Sucesso
                </span>
                {syncConfig.last_sync_at && (
                  <button
                    type="button"
                    onClick={() => handleSaveSyncConfig(true)}
                    className="text-[11px] font-semibold text-amber-600 hover:underline"
                  >
                    Resetar data
                  </button>
                )}
              </div>
              {syncConfig.last_sync_at ? (
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {new Date(syncConfig.last_sync_at).toLocaleString('pt-BR')}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {syncConfig.last_created_count} novos • {syncConfig.last_updated_count} cadastros • {syncConfig.last_stock_updated_count} estoques
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-1.5">
                  Nenhuma sincronização registrada ainda.
                </p>
              )}
            </div>
          </div>

          {horusApiPreview && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase text-[11px] text-slate-700 dark:text-slate-300">
                  Retorno da API do Horus ERP
                </span>
                <button
                  type="button"
                  onClick={() => setHorusApiPreview(null)}
                  className="text-[11px] underline text-slate-500"
                >
                  Ocultar
                </button>
              </div>
              <pre className="text-[11px] font-mono bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-44">
                {JSON.stringify(horusApiPreview.horus_raw_response || horusApiPreview, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={syncConfig.auto_collect_bookinfo_covers}
                onChange={(e) =>
                  setSyncConfig((p) => ({ ...p, auto_collect_bookinfo_covers: e.target.checked }))
                }
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              Coletar capas automaticamente na <b>Bookinfo</b> quando ausente
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleTestHorusCharacteristics}
                disabled={testingHorus}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                {testingHorus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListTree className="w-3.5 h-3.5" />}
                Testar Retorno Horus
              </button>

              <button
                type="button"
                onClick={() => handleSaveSyncConfig(false)}
                disabled={savingSyncConfig}
                className="px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center gap-1.5"
              >
                {savingSyncConfig && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar Parâmetros
              </button>

              <button
                type="button"
                onClick={() => handleRunHorusSync(false)}
                disabled={syncingHorus}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {syncingHorus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {syncConfig.last_sync_at ? 'Sincronizar Alterações' : 'Sincronizar Produtos Agora'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Onde Ficam as Demais Configurações da Operação B2C (Atalhos Diretos) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-indigo-600" />
              Pagamentos &amp; Checkout B2C
            </span>
            <p className="text-xs text-slate-500">
              Escolha por forma de pagamento (Cartão, PIX, Boleto) ou Link de Pagamento no final da venda. As credenciais também ficam disponíveis direto no painel do Seller.
            </p>
          </div>
          <Link
            href={`/companies/${companyId}/payments`}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
          >
            Abrir Pagamentos &amp; Bancos →
          </Link>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              Capas Primária &amp; Secundária
            </span>
            <p className="text-xs text-slate-500">
              Configure a URL primária de capas e o servidor secundário (fallback automático por <code className="font-mono">ISBN.jpg</code>).
            </p>
          </div>
          <Link
            href={`/companies/${companyId}/settings`}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
          >
            Abrir Configurações Gerais →
          </Link>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Gestão Direta no Painel do Seller
            </span>
            <p className="text-xs text-slate-500">
              Banners, cores, vitrines B2C, cupons corporativos, eventos escolares e frete da loja são gerenciados diretamente pelo Seller no menu <strong>B2C</strong>.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            Autonomia ativa no painel do Seller ✓
          </span>
        </div>
      </div>
    </div>
  );
}
