'use client';

import { useEffect, useState } from 'react';
import {
  Ticket,
  Building2,
  Users,
  Plus,
  Search,
  Download,
  Copy,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  ShoppingBag,
  Settings,
  Database,
  RefreshCw,
  Flame,
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';

export default function SellerB2CStorefrontManagementPage({
  viewMode = 'coupons',
  initialTab,
}: {
  viewMode?: 'coupons' | 'orders' | 'settings';
  initialTab?: string;
} = {}) {
  // Determine effective section based on Left Sidebar route
  const effectiveSection: 'coupons' | 'orders' | 'settings' =
    initialTab === 'orders'
      ? 'orders'
      : initialTab === 'lgpd'
      ? 'settings'
      : viewMode;

  // Sub-filter inside the Coupons page only (Cupons Individuais vs Lotes/Campanhas vs Histórico de Uso)
  const [couponSubView, setCouponSubView] = useState<'list' | 'batches' | 'history'>('list');
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [b2cOrders, setB2cOrders] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [lgpdConsents, setLgpdConsents] = useState<any[]>([]);

  // Filters
  const [couponSearch, setCouponSearch] = useState('');
  const [couponStatusFilter, setCouponStatusFilter] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');

  // Modals for Coupon Creation
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [batchForm, setBatchForm] = useState({
    name: '',
    partner_company_name: '',
    partner_document: '',
    batch_mode: 'INDIVIDUAL_CODES', // INDIVIDUAL_CODES or SHARED_CPF_LIMIT
    code_prefix: 'CUPOM',
    shared_code: '',
    quantity: 20,
    coupon_value: 100.0,
    discount_type: 'FIXED_BRL', // FIXED_BRL or PERCENTAGE
    allows_freight_discount: true,
    allow_residual_balance: true,
    min_order_value: 0.0,
    valid_from: '',
    valid_until: '',
    notes: '',
    employees_raw: '', // Optional lines: Nome;CPF;Email
  });

  const [singleForm, setSingleForm] = useState({
    code: '',
    initial_value: 100.0,
    discount_type: 'FIXED_BRL',
    max_uses: 10,
    allows_freight_discount: true,
    allow_residual_balance: true,
    min_order_value: 0.0,
    assigned_name: '',
    assigned_cpf: '',
    assigned_email: '',
    valid_until: '',
  });

  const [settingsForm, setSettingsForm] = useState({
    b2c_custom_domain: '',
    b2c_storefront_open: true,
    b2c_checkout_mode: 'NATIVE_GATEWAY',
    b2c_default_freight_value: 15.9,
    b2c_free_shipping_min_value: 150.0,
    b2c_lgpd_terms_text: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Storefront Cache Engine States (Managed by Seller)
  const [cacheStatus, setCacheStatus] = useState<any>({
    enabled: true,
    ttl_seconds: 900,
    cached_entries_count: 0,
    estimated_size_kb: 0,
    cache_hits: 0,
    cache_misses: 0,
    hit_rate_percent: 0,
    last_cleared_at: null,
  });
  const [clearingCache, setClearingCache] = useState(false);
  const [warmingCache, setWarmingCache] = useState(false);
  const [savingCacheConfig, setSavingCacheConfig] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const loadAllData = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [sumRes, batchRes, coupRes, ordRes, redRes, lgpdRes, cacheRes] = await Promise.all([
        fetch(`${apiBase}/b2c/coupons/summary`, { headers }),
        fetch(`${apiBase}/b2c/coupons/batches`, { headers }),
        fetch(
          `${apiBase}/b2c/coupons?${new URLSearchParams({
            ...(selectedBatchFilter ? { batch_id: selectedBatchFilter } : {}),
            ...(couponStatusFilter ? { status: couponStatusFilter } : {}),
            ...(couponSearch ? { search: couponSearch } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(
          `${apiBase}/b2c/orders?${new URLSearchParams({
            ...(orderSearch ? { search: orderSearch } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(
          `${apiBase}/b2c/coupons/redemptions?${new URLSearchParams({
            ...(selectedBatchFilter ? { batch_id: selectedBatchFilter } : {}),
            ...(redemptionSearch ? { search: redemptionSearch } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(`${apiBase}/b2c/lgpd/consents`, { headers }),
        fetch(`${apiBase}/b2c/cache/status`, { headers }),
      ]);

      if (sumRes.ok) {
        const s = await sumRes.json();
        setSummary(s);
        if (s.settings) {
          setSettingsForm({
            b2c_custom_domain: s.settings.b2c_custom_domain || '',
            b2c_storefront_open: Boolean(s.settings.b2c_storefront_open),
            b2c_checkout_mode: s.settings.b2c_checkout_mode || 'NATIVE_GATEWAY',
            b2c_default_freight_value: Number(s.settings.b2c_default_freight_value || 0),
            b2c_free_shipping_min_value: Number(s.settings.b2c_free_shipping_min_value || 0),
            b2c_lgpd_terms_text: s.settings.b2c_lgpd_terms_text || '',
          });
        }
      }
      if (batchRes.ok) setBatches(await batchRes.json());
      if (coupRes.ok) setCoupons(await coupRes.json());
      if (ordRes.ok) setB2cOrders(await ordRes.json());
      if (redRes.ok) setRedemptions(await redRes.json());
      if (lgpdRes.ok) setLgpdConsents(await lgpdRes.json());
      if (cacheRes.ok) setCacheStatus(await cacheRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [selectedBatchFilter, couponStatusFilter]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchForm.name.trim()) {
      toast.error('Informe o nome da campanha / lote.');
      return;
    }
    if (batchForm.coupon_value <= 0) {
      toast.error('Informe o valor ou percentual do cupom.');
      return;
    }

    setSubmitting(true);
    try {
      const employees: { name?: string; cpf?: string; email?: string }[] = [];
      if (batchForm.employees_raw.trim()) {
        const lines = batchForm.employees_raw
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          const parts = line.split(/[;,|\t]/).map((p) => p.trim());
          if (parts.length === 1) {
            employees.push({ cpf: parts[0] });
          } else {
            employees.push({
              name: parts[0],
              cpf: parts[1] || '',
              email: parts[2] || '',
            });
          }
        }
      }

      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/coupons/batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: batchForm.name,
          partner_company_name: batchForm.partner_company_name || null,
          partner_document: batchForm.partner_document || null,
          batch_mode: batchForm.batch_mode,
          code_prefix: batchForm.code_prefix || 'CUPOM',
          shared_code: batchForm.shared_code || null,
          quantity: Number(batchForm.quantity) || 10,
          coupon_value: Number(batchForm.coupon_value),
          discount_type: batchForm.discount_type,
          allows_freight_discount: batchForm.allows_freight_discount,
          allow_residual_balance: batchForm.allow_residual_balance,
          min_order_value: Number(batchForm.min_order_value || 0),
          valid_from: batchForm.valid_from || null,
          valid_until: batchForm.valid_until || null,
          notes: batchForm.notes || null,
          employees: employees.length > 0 ? employees : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar lote de cupons.');

      toast.success(data.message || 'Lote de cupons criado com sucesso!');
      setShowBatchModal(false);
      loadAllData();
      setCouponSubView('list');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSingleCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (singleForm.initial_value <= 0) {
      toast.error('Informe o valor ou percentual do cupom.');
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/coupons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...singleForm,
          valid_until: singleForm.valid_until || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar cupom.');
      toast.success(data.message || 'Cupom criado com sucesso!');
      setShowSingleModal(false);
      loadAllData();
      setCouponSubView('list');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar cupom.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelCoupon = async (couponId: number, code: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/coupons/${couponId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Cupom ${code} cancelado.`);
        loadAllData();
      }
    } catch (e) {
      toast.error('Erro ao cancelar cupom.');
    }
  };

  const handleSaveB2CSettings = async () => {
    setSavingSettings(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar configurações.');
      toast.success(data.message || 'Configurações atualizadas!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/cache/clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao limpar cache.');
      toast.success(data.message || 'Cache da loja B2C limpo com sucesso!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao limpar cache.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleWarmupCache = async () => {
    setWarmingCache(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/cache/warmup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao pré-aquecer cache.');
      toast.success(data.message || 'Cache da vitrine pré-aquecido com sucesso!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao pré-aquecer cache.');
    } finally {
      setWarmingCache(false);
    }
  };

  const handleUpdateCacheConfig = async (enabled: boolean, ttlSeconds: number) => {
    setSavingCacheConfig(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/cache/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled, ttl_seconds: ttlSeconds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar configuração de cache.');
      setCacheStatus((prev: any) => ({ ...prev, enabled: data.enabled, ttl_seconds: data.ttl_seconds }));
      toast.success(data.message || 'Configuração de cache atualizada!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao salvar configuração de cache.');
    } finally {
      setSavingCacheConfig(false);
    }
  };

  const exportCouponsCSV = () => {
    if (!coupons.length) {
      toast.error('Nenhum cupom na listagem para exportar.');
      return;
    }
    const headers = [
      'Codigo',
      'Campanha_Lote',
      'Parceiro',
      'Modo',
      'Tipo',
      'Valor_Inicial',
      'Valor_Usado',
      'Saldo_Atual',
      'Abate_Frete',
      'Beneficiario_Nome',
      'Beneficiario_CPF',
      'Beneficiario_Email',
      'Cupom_Residual_Gerado',
      'Status',
      'Validade',
    ];
    const rows = coupons.map((c) => [
      c.code,
      (c.batch_name || 'Avulso').replace(/;/g, ','),
      (c.partner_company_name || '-').replace(/;/g, ','),
      c.coupon_mode,
      c.discount_type,
      Number(c.initial_value || 0).toFixed(2).replace('.', ','),
      Number(c.used_amount || 0).toFixed(2).replace('.', ','),
      Number(c.current_balance || 0).toFixed(2).replace('.', ','),
      c.allows_freight_discount ? 'SIM' : 'NAO',
      (c.assigned_name || '').replace(/;/g, ','),
      c.assigned_cpf || '',
      c.assigned_email || '',
      c.generated_child_code || '',
      c.status,
      c.valid_until || 'Sem expiracao',
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cupons_desconto_b2c_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val || 0));

  const storePublicUrl = `/loja/${getUser()?.company_id || 4}`;

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* VIEW 1: CUPONS DE DESCONTO (/b2c-storefront)                          */}
      {/* ===================================================================== */}
      {effectiveSection === 'coupons' && (
        <>
          {/* Clean, Precise Header */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                <Ticket className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Cupons de Desconto &amp; Controle de Saldos
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Crie cupons promocionais ou lotes por CPF, defina regras de saldo residual automático e acompanhe quem utilizou cada código.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={storePublicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-indigo-600" />
                Ver Loja Online
              </a>

              <button
                onClick={() => setShowSingleModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Criar Cupom Individual
              </button>

              <button
                onClick={() => setShowBatchModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Gerar Lote de Cupons
              </button>
            </div>
          </div>

          {/* 4 Focused KPIs for Coupons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Total Emitido em Cupons</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                {formatBRL(summary?.total_issued_value || 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.total_coupons || 0} cupons gerados ({summary?.total_batches || 0} campanhas)
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Valor Já Utilizado</p>
              <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatBRL(summary?.total_used_value || 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.total_redemptions || 0} compras realizadas com cupom
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Saldo Disponível / Residual</p>
              <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                {formatBRL(summary?.total_remaining_balance || 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.residual_generated_coupons || 0} cupons residuais automáticos
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Status dos Cupons</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                  {summary?.available_coupons || 0}
                </span>
                <span className="text-xs text-slate-500">ativos para uso</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.exhausted_coupons || 0} esgotados • {summary?.partially_used_coupons || 0} parciais
              </p>
            </div>
          </div>

          {/* Sub-view Switcher & Filters */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start">
                <button
                  type="button"
                  onClick={() => setCouponSubView('list')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    couponSubView === 'list'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Todos os Cupons ({coupons.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCouponSubView('batches')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    couponSubView === 'batches'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Campanhas / Lotes ({batches.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCouponSubView('history')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    couponSubView === 'history'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Histórico de Utilização ({redemptions.length})
                </button>
              </div>

              <button
                onClick={exportCouponsCSV}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Planilha CSV
              </button>
            </div>

            {couponSubView === 'list' && (
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={couponSearch}
                    onChange={(e) => setCouponSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                    placeholder="Buscar por código do cupom, CPF, nome do cliente ou cupom residual..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>

                <select
                  value={selectedBatchFilter}
                  onChange={(e) => setSelectedBatchFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="">Todas as Campanhas / Lotes</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <select
                  value={couponStatusFilter}
                  onChange={(e) => setCouponStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="">Todos os Status</option>
                  <option value="AVAILABLE">Disponíveis</option>
                  <option value="PARTIALLY_USED">Uso Parcial</option>
                  <option value="EXHAUSTED">100% Utilizados</option>
                  <option value="CANCELLED">Cancelados</option>
                </select>

                <button
                  onClick={loadAllData}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
                >
                  Filtrar
                </button>
              </div>
            )}

            {couponSubView === 'history' && (
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={redemptionSearch}
                    onChange={(e) => setRedemptionSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                    placeholder="Filtrar histórico por nome do cliente, CPF, e-mail ou código usado..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
                <button
                  onClick={loadAllData}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
                >
                  Buscar
                </button>
              </div>
            )}
          </div>

          {/* SUB-VIEW 1: LISTA PRECISA DE CUPONS E SALDOS */}
          {couponSubView === 'list' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3.5 px-4">Código do Cupom</th>
                    <th className="py-3.5 px-4">Campanha / Regra</th>
                    <th className="py-3.5 px-4">Beneficiário (Nome / CPF)</th>
                    <th className="py-3.5 px-4">Valor Inicial</th>
                    <th className="py-3.5 px-4">Consumido</th>
                    <th className="py-3.5 px-4">Saldo Atual / Residual</th>
                    <th className="py-3.5 px-4">Validade &amp; Status</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                  {coupons.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Nenhum cupom encontrado. Clique em <strong>Criar Cupom Individual</strong> ou <strong>Gerar Lote de Cupons</strong> acima.
                      </td>
                    </tr>
                  ) : (
                    coupons.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                              {c.code}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(c.code);
                                toast.success(`Código ${c.code} copiado!`);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700"
                              title="Copiar código"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {c.coupon_mode === 'RESIDUAL' && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                              Cupom de Saldo Residual
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {c.partner_company_name || c.batch_name || 'Cupom Avulso'}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {c.allows_freight_discount ? 'Abate Produtos + Frete' : 'Abate Produtos'} •{' '}
                            {c.allow_residual_balance !== false ? 'Gera Residual' : 'Uso Único'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {c.assigned_name || c.assigned_cpf ? (
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {c.assigned_name || 'Cliente Vinculado'}
                              </span>
                              {c.assigned_cpf && (
                                <span className="block font-mono text-[11px] text-slate-500">
                                  CPF: {c.assigned_cpf}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Livre (Qualquer cliente / 1º uso)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {c.discount_type === 'PERCENTAGE' ? `${c.initial_value}%` : formatBRL(c.initial_value)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-600">
                          {formatBRL(c.used_amount)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {c.discount_type === 'PERCENTAGE' ? '—' : formatBRL(c.current_balance)}
                          </span>
                          {c.generated_child_code && (
                            <div className="text-[11px] text-amber-600 font-semibold mt-0.5">
                              Gerou saldo: <code className="font-mono font-bold">{c.generated_child_code}</code>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {c.status === 'AVAILABLE' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-bold">
                                Disponível
                              </span>
                            )}
                            {c.status === 'PARTIALLY_USED' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                                Uso Parcial
                              </span>
                            )}
                            {c.status === 'EXHAUSTED' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                                100% Utilizado
                              </span>
                            )}
                            {c.status === 'CANCELLED' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-[11px] font-bold">
                                Cancelado
                              </span>
                            )}
                            {c.valid_until && (
                              <span className="block text-[10px] text-slate-400">
                                Até {c.valid_until.split('-').reverse().join('/')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {c.status === 'AVAILABLE' && (
                            <button
                              onClick={() => handleCancelCoupon(c.id, c.code)}
                              className="text-xs font-semibold text-rose-600 hover:underline"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SUB-VIEW 2: CAMPANHAS / LOTES */}
          {couponSubView === 'batches' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3.5 px-4">Campanha / Lote</th>
                    <th className="py-3.5 px-4">Empresa / Parceiro</th>
                    <th className="py-3.5 px-4">Modo</th>
                    <th className="py-3.5 px-4">Valor por Cupom</th>
                    <th className="py-3.5 px-4">Regras</th>
                    <th className="py-3.5 px-4">Consumo</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                  {batches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Nenhum lote cadastrado ainda.
                      </td>
                    </tr>
                  ) : (
                    batches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          {b.name}
                          {b.valid_until && (
                            <span className="block text-[11px] font-normal text-slate-400">
                              Válido até {b.valid_until.split('-').reverse().join('/')}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {b.partner_company_name || '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {b.batch_mode === 'SHARED_CPF_LIMIT' ? (
                            <div>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                                Código Único por CPF ({b.shared_code})
                              </span>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-bold">
                              {b.coupons_count} Códigos Individuais
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          {b.discount_type === 'PERCENTAGE' ? `${b.coupon_value}%` : formatBRL(b.coupon_value)}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                          Frete: <strong>{b.allows_freight_discount ? 'Sim' : 'Não'}</strong> • Residual:{' '}
                          <strong>{b.allow_residual_balance ? 'Sim' : 'Não'}</strong>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {b.coupons_used_count} / {b.coupons_count || b.max_uses_total} usados
                          </div>
                          <div className="text-[11px] text-emerald-600 font-semibold">
                            {formatBRL(b.consumed_batch_value)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedBatchFilter(String(b.id));
                              setCouponSubView('list');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-xs font-bold text-slate-700 dark:text-slate-200"
                          >
                            Filtrar Cupons →
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SUB-VIEW 3: HISTÓRICO DE USO (QUEM USOU CADA CUPOM) */}
          {couponSubView === 'history' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3.5 px-4">Data / Pedido</th>
                    <th className="py-3.5 px-4">Cliente (Nome / CPF)</th>
                    <th className="py-3.5 px-4">Cupom Aplicado</th>
                    <th className="py-3.5 px-4">Valor da Compra</th>
                    <th className="py-3.5 px-4">Desconto Abatido</th>
                    <th className="py-3.5 px-4">Saldo Restante</th>
                    <th className="py-3.5 px-4">Diferença Paga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                  {redemptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Nenhuma utilização de cupom registrada até o momento.
                      </td>
                    </tr>
                  ) : (
                    redemptions.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 dark:text-white">
                            Pedido #{r.order_id || '—'}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : ''}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {r.customer_name}
                          </span>
                          <span className="block font-mono text-[11px] text-slate-500">
                            CPF: {r.customer_cpf} • {r.customer_email}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                            {r.coupon_code}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {formatBRL(Number(r.order_subtotal || 0) + Number(r.order_freight || 0))}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-600">
                          - {formatBRL(r.discount_applied)}
                        </td>
                        <td className="py-3.5 px-4">
                          {r.used_full_balance ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-bold">
                              100% Utilizado
                            </span>
                          ) : (
                            <div>
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                                Sobrou {formatBRL(r.remaining_balance)}
                              </span>
                              {r.residual_coupon_code && (
                                <span className="block text-[11px] text-amber-700 dark:text-amber-400 font-mono mt-0.5">
                                  Novo: <strong>{r.residual_coupon_code}</strong>
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {Number(r.difference_paid || 0) <= 0.009 ? (
                            <span className="text-xs font-bold text-emerald-600">R$ 0,00</span>
                          ) : (
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatBRL(r.difference_paid)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: PEDIDOS & CARRINHOS (/b2c-storefront/orders)                  */}
      {/* ===================================================================== */}
      {effectiveSection === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Pedidos &amp; Carrinhos da Loja B2C
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Acompanhe todas as vendas concluídas na loja virtual, cupons aplicados e carrinhos enviados para finalização.
                </p>
              </div>
            </div>

            <a
              href={storePublicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors self-start sm:self-auto"
            >
              <ExternalLink className="w-4 h-4 text-indigo-600" />
              Ver Loja Online
            </a>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                placeholder="Buscar pedido por cliente, CPF, e-mail, cupom ou sessão Tray..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
              />
            </div>
            <button
              onClick={loadAllData}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
            >
              Atualizar Lista
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3.5 px-4">Pedido / Data</th>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Itens</th>
                  <th className="py-3.5 px-4">Subtotal &amp; Frete</th>
                  <th className="py-3.5 px-4">Cupom &amp; Desconto</th>
                  <th className="py-3.5 px-4">Total Pago</th>
                  <th className="py-3.5 px-4">Canal de Checkout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                {b2cOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Nenhum pedido registrado até o momento.
                    </td>
                  </tr>
                ) : (
                  b2cOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-white">
                          Pedido #{o.id}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : ''}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {o.customer_name}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-500">
                          CPF: {o.customer_cpf} • {o.customer_email}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {o.items_count} {o.items_count === 1 ? 'item' : 'itens'}
                        </span>
                        {o.items && o.items.length > 0 && (
                          <div
                            className="text-[11px] text-slate-500 truncate"
                            title={o.items.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                          >
                            {o.items
                              .slice(0, 2)
                              .map((i: any) => `${i.quantity}x ${i.name}`)
                              .join(', ')}
                            {o.items.length > 2 ? ` +${o.items.length - 2}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          Prod: {formatBRL(o.subtotal)}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          Frete: {formatBRL(o.freight)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {o.coupon_code ? (
                          <div>
                            <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                              {o.coupon_code}
                            </span>
                            <span className="block text-[11px] text-emerald-600 font-bold mt-0.5">
                              -{formatBRL(o.discount_applied)}
                            </span>
                            {o.residual_coupon_code && (
                              <span className="block text-[11px] text-amber-600 font-mono">
                                Residual: <strong>{o.residual_coupon_code}</strong> ({formatBRL(o.remaining_balance)})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Sem cupom</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {Number(o.difference_paid || 0) <= 0.009 ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-bold">
                            R$ 0,00 (100% Cupom)
                          </span>
                        ) : (
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {formatBRL(o.difference_paid)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {o.checkout_mode === 'FREE_VOUCHER' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Concluído (Cupom Integral)
                          </span>
                        )}
                        {o.checkout_mode === 'TRAY_REDIRECT' && (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold">
                              <ShoppingBag className="w-3.5 h-3.5" /> Checkout Tray
                            </span>
                            {o.tray_cart_url && (
                              <a
                                href={o.tray_cart_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-[11px] font-bold text-indigo-600 hover:underline"
                              >
                                Abrir Carrinho Tray →
                              </a>
                            )}
                          </div>
                        )}
                        {o.checkout_mode !== 'FREE_VOUCHER' && o.checkout_mode !== 'TRAY_REDIRECT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                            Gateway Nativo ({o.status})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 3: FRETE, CHECKOUT & LGPD (/b2c-storefront/settings)             */}
      {/* ===================================================================== */}
      {effectiveSection === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Frete, Checkout &amp; Privacidade (LGPD)
                  </h1>
                  <p className="text-xs text-slate-500">
                    Defina o valor de frete da loja, escolha o modo de pagamento (Gateway Nativo ou Checkout Tray) e configure o termo LGPD.
                  </p>
                </div>
              </div>
              <button
                onClick={handleSaveB2CSettings}
                disabled={savingSettings}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 shrink-0"
              >
                {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsForm.b2c_storefront_open}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, b2c_storefront_open: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 rounded text-indigo-600"
                />
                <div>
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    Loja Virtual Aberta ao Público
                  </span>
                  <span className="text-xs text-slate-500">
                    Permite navegar pelo catálogo, adicionar itens à sacola, aplicar cupom de desconto e concluir o cadastro no checkout.
                  </span>
                </div>
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Modo de Pagamento no Checkout
                </label>
                <select
                  value={settingsForm.b2c_checkout_mode}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, b2c_checkout_mode: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value="NATIVE_GATEWAY">
                    Intermediador de Pagamento Nativo ({summary?.settings?.payment_gateway_active || 'PIX / Cartão'})
                  </option>
                  <option value="TRAY_REDIRECT">
                    Enviar Carrinho Pronto + Desconto para Finalizar na Loja Tray
                  </option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Quando o cupom cobre 100% do pedido, o sistema conclui o pedido imediatamente sem cobrança adicional.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Domínio Próprio da Loja (Ex: loja.suaeditora.com.br)
                </label>
                <input
                  type="text"
                  value={settingsForm.b2c_custom_domain}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, b2c_custom_domain: e.target.value })
                  }
                  placeholder="loja.suaeditora.com.br"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Valor de Frete Padrão (R$)
                </label>
                <CurrencyInput
                  prefixStr="R$ "
                  value={settingsForm.b2c_default_freight_value}
                  onChangeValue={(val) =>
                    setSettingsForm({ ...settingsForm, b2c_default_freight_value: val })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Frete Grátis Acima de (R$)
                </label>
                <CurrencyInput
                  prefixStr="R$ "
                  value={settingsForm.b2c_free_shipping_min_value}
                  onChangeValue={(val) =>
                    setSettingsForm({ ...settingsForm, b2c_free_shipping_min_value: val })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Texto do Termo de Privacidade &amp; Consentimento LGPD (Lei nº 13.709/2018)
              </label>
              <textarea
                rows={3}
                value={settingsForm.b2c_lgpd_terms_text}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, b2c_lgpd_terms_text: e.target.value })
                }
                placeholder="Ao finalizar seu cadastro e pedido, você autoriza o tratamento dos seus dados pessoais conforme a LGPD..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* =================================================================== */}
          {/* MOTOR DE CACHE & ALTA PERFORMANCE DA VITRINE B2C (SELLER CONTROL)   */}
          {/* =================================================================== */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      Cache de Alta Performance da Vitrine B2C
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        cacheStatus?.enabled !== false
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {cacheStatus?.enabled !== false ? '● Cache Ativo' : '○ Cache Desativado'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Acumula em memória as consultas de catálogo, categorias e vitrines para atender milhares de acessos simultâneos sem sobrecarregar o ERP Horus ou o banco de dados.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleWarmupCache}
                  disabled={warmingCache}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Flame className={`w-4 h-4 ${warmingCache ? 'animate-pulse' : ''}`} />
                  {warmingCache ? 'Aquecendo...' : 'Pré-Aquecer Vitrine'}
                </button>

                <button
                  type="button"
                  onClick={handleClearCache}
                  disabled={clearingCache}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${clearingCache ? 'animate-spin' : ''}`} />
                  {clearingCache ? 'Limpando...' : 'Limpar Cache Agora'}
                </button>
              </div>
            </div>

            {/* Live Cache Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Páginas / Consultas em Cache
                </span>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5 block">
                  {cacheStatus?.cached_entries_count || 0} páginas
                </span>
                <span className="text-[10px] text-slate-400">
                  ~{cacheStatus?.estimated_size_kb || 0} KB em memória
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Acessos Atendidos pelo Cache
                </span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {cacheStatus?.cache_hits || 0} hits
                </span>
                <span className="text-[10px] text-slate-400">
                  Consultas poupadas do ERP
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Taxa de Eficiência (Hit Rate)
                </span>
                <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                  {cacheStatus?.hit_rate_percent || 0}%
                </span>
                <span className="text-[10px] text-slate-400">
                  {cacheStatus?.cache_misses || 0} leituras de origem
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Última Limpeza Manual / Auto
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 block">
                  {cacheStatus?.last_cleared_at
                    ? new Date(cacheStatus.last_cleared_at).toLocaleString('pt-BR')
                    : 'Automático por expiração'}
                </span>
                <span className="text-[10px] text-slate-400">
                  Expira a cada {Math.round(Number(cacheStatus?.ttl_seconds || 900) / 60)} min
                </span>
              </div>
            </div>

            {/* Seller Cache Controls (Enable/Disable & TTL) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cacheStatus?.enabled !== false}
                  disabled={savingCacheConfig}
                  onChange={(e) =>
                    handleUpdateCacheConfig(
                      e.target.checked,
                      Number(cacheStatus?.ttl_seconds || 900)
                    )
                  }
                  className="mt-1 w-4 h-4 rounded text-emerald-600"
                />
                <div>
                  <span className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Acumular Cache Automaticamente na Vitrine B2C (Recomendado)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Mantém as vitrines e páginas de livros em memória rápida. Sempre que você salvar alterações em Banners, Vitrines ou Promoções, o cache é atualizado automaticamente.
                  </span>
                </div>
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tempo de Retenção do Cache (Renovação Automática)
                </label>
                <select
                  value={Number(cacheStatus?.ttl_seconds || 900)}
                  disabled={savingCacheConfig}
                  onChange={(e) =>
                    handleUpdateCacheConfig(
                      cacheStatus?.enabled !== false,
                      Number(e.target.value)
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value={300}>5 minutos (Atualização frequente)</option>
                  <option value={900}>15 minutos (Recomendado — Equilíbrio ideal)</option>
                  <option value={1800}>30 minutos (Alta performance)</option>
                  <option value={3600}>1 hora (Campanhas de alto tráfego)</option>
                  <option value={21600}>6 horas (Máxima proteção do ERP)</option>
                  <option value={86400}>24 horas (Catálogo estático)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabela de Auditoria LGPD */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Registro de Consentimento LGPD dos Clientes ({lgpdConsents.length})
                </h3>
              </div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Cliente (Nome / CPF)</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">IP</th>
                  <th className="py-3 px-4">Versão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {lgpdConsents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      Nenhum registro de aceite LGPD ainda.
                    </td>
                  </tr>
                ) : (
                  lgpdConsents.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono">
                        {c.accepted_at ? new Date(c.accepted_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {c.customer_name}
                        <span className="block font-mono text-[11px] font-normal text-slate-500">
                          CPF: {c.customer_cpf}
                        </span>
                      </td>
                      <td className="py-3 px-4">{c.customer_email}</td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {c.ip_address}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 font-bold">
                          {c.terms_version}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: GERAR LOTE DE CUPONS                                         */}
      {/* ===================================================================== */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-indigo-600" />
                Gerar Lote de Cupons de Desconto
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-sm font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Campanha / Lote *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchForm.name}
                    onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                    placeholder="Ex: Campanha Leitura 2026"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Empresa / Parceiro (Opcional)
                  </label>
                  <input
                    type="text"
                    value={batchForm.partner_company_name}
                    onChange={(e) =>
                      setBatchForm({ ...batchForm, partner_company_name: e.target.value })
                    }
                    placeholder="Ex: Empresa Parceira Ltda"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Modo de Geração */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Formato dos Códigos
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBatchForm({ ...batchForm, batch_mode: 'INDIVIDUAL_CODES' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      batchForm.batch_mode === 'INDIVIDUAL_CODES'
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Vários Códigos Individuais
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Gera N códigos únicos para distribuir individualmente ou exportar em planilha.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBatchForm({ ...batchForm, batch_mode: 'SHARED_CPF_LIMIT' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      batchForm.batch_mode === 'SHARED_CPF_LIMIT'
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Código Único Controlado por CPF
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Um único código promocional onde cada CPF possui seu próprio saldo individual.
                    </p>
                  </button>
                </div>

                {batchForm.batch_mode === 'INDIVIDUAL_CODES' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Prefixo dos Códigos
                      </label>
                      <input
                        type="text"
                        value={batchForm.code_prefix}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, code_prefix: e.target.value.toUpperCase() })
                        }
                        placeholder="Ex: PROMO"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Quantidade de Cupons
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={batchForm.quantity}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, quantity: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Código Único Compartilhado *
                      </label>
                      <input
                        type="text"
                        value={batchForm.shared_code}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, shared_code: e.target.value.toUpperCase() })
                        }
                        placeholder="Ex: LEITURA100"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Limite Máximo de Usos (CPFs)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={batchForm.quantity}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, quantity: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Valor com alternador R$ / % e CurrencyInput */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Desconto
                  </label>
                  <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setBatchForm({ ...batchForm, discount_type: 'FIXED_BRL' })}
                      className={`flex-1 py-2 text-xs font-bold ${
                        batchForm.discount_type === 'FIXED_BRL'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      Valor (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBatchForm({ ...batchForm, discount_type: 'PERCENTAGE', coupon_value: 20 })
                      }
                      className={`flex-1 py-2 text-xs font-bold ${
                        batchForm.discount_type === 'PERCENTAGE'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      Percentual (%)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {batchForm.discount_type === 'PERCENTAGE'
                      ? 'Percentual (%)'
                      : 'Valor de Cada Cupom (R$)'}
                  </label>
                  <CurrencyInput
                    prefixStr={batchForm.discount_type === 'FIXED_BRL' ? 'R$ ' : ''}
                    suffixStr={batchForm.discount_type === 'PERCENTAGE' ? '%' : ''}
                    max={batchForm.discount_type === 'PERCENTAGE' ? 100 : undefined}
                    value={batchForm.coupon_value}
                    onChangeValue={(val) => setBatchForm({ ...batchForm, coupon_value: val })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Validade (Opcional)
                  </label>
                  <input
                    type="date"
                    value={batchForm.valid_until}
                    onChange={(e) => setBatchForm({ ...batchForm, valid_until: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Flags de Frete e Saldo Residual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchForm.allows_freight_discount}
                    onChange={(e) =>
                      setBatchForm({ ...batchForm, allows_freight_discount: e.target.checked })
                    }
                    className="mt-0.5 rounded text-indigo-600"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Não cobrar frete (Frete Grátis com este cupom)
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Marcado: isenta 100% do frete ao aplicar o cupom. Desmarcado: cobra o frete normalmente.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchForm.allow_residual_balance}
                    onChange={(e) =>
                      setBatchForm({ ...batchForm, allow_residual_balance: e.target.checked })
                    }
                    className="mt-0.5 rounded text-indigo-600"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Gerar novo cupom se sobrar saldo
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Se a compra for menor que o cupom, cria um novo código com a diferença.
                    </span>
                  </div>
                </label>
              </div>

              {/* Lista Opcional de Beneficiários */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lista de CPFs / Beneficiários (Opcional — 1 por linha: <code>Nome;CPF;Email</code>)
                </label>
                <textarea
                  rows={3}
                  value={batchForm.employees_raw}
                  onChange={(e) => setBatchForm({ ...batchForm, employees_raw: e.target.value })}
                  placeholder={'João Silva;12345678901;joao@email.com\nMaria Souza;98765432100;maria@email.com'}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Gerando...' : 'Gerar Lote de Cupons'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CRIAR CUPOM INDIVIDUAL PRECISO                               */}
      {/* ===================================================================== */}
      {showSingleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Ticket className="w-4 h-4 text-indigo-600" />
                Criar Cupom de Desconto
              </h3>
              <button onClick={() => setShowSingleModal(false)} className="text-slate-400">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSingleCoupon} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código do Cupom (Em branco = automático)
                  </label>
                  <input
                    type="text"
                    value={singleForm.code}
                    onChange={(e) =>
                      setSingleForm({ ...singleForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="Ex: LEITURA100"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Limite de Usos *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    required
                    value={singleForm.max_uses}
                    onChange={(e) =>
                      setSingleForm({ ...singleForm, max_uses: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Desconto
                  </label>
                  <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSingleForm({ ...singleForm, discount_type: 'FIXED_BRL' })}
                      className={`flex-1 py-2 text-xs font-bold ${
                        singleForm.discount_type === 'FIXED_BRL'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      R$ (Valor)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSingleForm({
                          ...singleForm,
                          discount_type: 'PERCENTAGE',
                          initial_value: 15,
                        })
                      }
                      className={`flex-1 py-2 text-xs font-bold ${
                        singleForm.discount_type === 'PERCENTAGE'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      % (Percentual)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {singleForm.discount_type === 'PERCENTAGE'
                      ? 'Percentual de Desconto (%)'
                      : 'Valor do Cupom (R$)'}
                  </label>
                  <CurrencyInput
                    prefixStr={singleForm.discount_type === 'FIXED_BRL' ? 'R$ ' : ''}
                    suffixStr={singleForm.discount_type === 'PERCENTAGE' ? '%' : ''}
                    max={singleForm.discount_type === 'PERCENTAGE' ? 100 : undefined}
                    value={singleForm.initial_value}
                    onChangeValue={(val) => setSingleForm({ ...singleForm, initial_value: val })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Campanha / Nome (Opcional)
                  </label>
                  <input
                    type="text"
                    value={singleForm.assigned_name}
                    onChange={(e) => setSingleForm({ ...singleForm, assigned_name: e.target.value })}
                    placeholder="Ex: Campanha VIP"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Restringir a 1 CPF (Opcional)
                  </label>
                  <input
                    type="text"
                    value={singleForm.assigned_cpf}
                    onChange={(e) => setSingleForm({ ...singleForm, assigned_cpf: e.target.value })}
                    placeholder="Livre para vários CPFs"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Validade (Opcional)
                  </label>
                  <input
                    type="date"
                    value={singleForm.valid_until}
                    onChange={(e) => setSingleForm({ ...singleForm, valid_until: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={singleForm.allows_freight_discount}
                    onChange={(e) =>
                      setSingleForm({ ...singleForm, allows_freight_discount: e.target.checked })
                    }
                    className="rounded text-indigo-600"
                  />
                  Não cobrar frete (Frete Grátis automático ao aplicar este cupom)
                </label>

                {singleForm.discount_type === 'FIXED_BRL' && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={singleForm.allow_residual_balance}
                      onChange={(e) =>
                        setSingleForm({ ...singleForm, allow_residual_balance: e.target.checked })
                      }
                      className="rounded text-indigo-600"
                    />
                    Se sobrar valor na compra, gerar novo cupom automático com o saldo restante
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSingleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  {submitting ? 'Criando...' : 'Criar Cupom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
