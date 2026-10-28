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
  Clock,
  Ban,
  ShieldCheck,
  ExternalLink,
  ShoppingBag,
  Sparkles,
  Loader2,
  RefreshCw,
  Globe,
  FileSpreadsheet,
  ArrowRight,
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import CurrencyInput from '@/components/CurrencyInput';

export default function SellerB2CStorefrontManagementPage() {
  const [activeTab, setActiveTab] = useState<'batches' | 'coupons' | 'redemptions' | 'lgpd'>('batches');
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [lgpdConsents, setLgpdConsents] = useState<any[]>([]);

  // Filters
  const [couponSearch, setCouponSearch] = useState('');
  const [couponStatusFilter, setCouponStatusFilter] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');
  const [redemptionSearch, setRedemptionSearch] = useState('');

  // Modals
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [batchForm, setBatchForm] = useState({
    name: '',
    partner_company_name: '',
    partner_document: '',
    batch_mode: 'INDIVIDUAL_CODES', // INDIVIDUAL_CODES or SHARED_CPF_LIMIT
    code_prefix: 'VOUCHER',
    shared_code: '',
    quantity: 20,
    coupon_value: 100.0,
    discount_type: 'FIXED_BRL', // FIXED_BRL or PERCENTAGE
    allows_freight_discount: false,
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
    allows_freight_discount: false,
    allow_residual_balance: true,
    min_order_value: 0.0,
    assigned_name: '',
    assigned_cpf: '',
    assigned_email: '',
    valid_until: '',
  });

  const [settingsForm, setSettingsForm] = useState({
    b2c_custom_domain: '',
    b2c_storefront_open: false,
    b2c_checkout_mode: 'NATIVE_GATEWAY',
    b2c_default_freight_value: 15.9,
    b2c_free_shipping_min_value: 150.0,
    b2c_lgpd_terms_text: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const loadAllData = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [sumRes, batchRes, coupRes, redRes, lgpdRes] = await Promise.all([
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
          `${apiBase}/b2c/coupons/redemptions?${new URLSearchParams({
            ...(selectedBatchFilter ? { batch_id: selectedBatchFilter } : {}),
            ...(redemptionSearch ? { search: redemptionSearch } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(`${apiBase}/b2c/lgpd/consents`, { headers }),
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
      if (redRes.ok) setRedemptions(await redRes.json());
      if (lgpdRes.ok) setLgpdConsents(await lgpdRes.json());
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
      toast.error('Informe o nome do lote corporativo.');
      return;
    }
    if (batchForm.coupon_value <= 0) {
      toast.error('Informe o valor de cada cupom.');
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
          code_prefix: batchForm.code_prefix || 'VOUCHER',
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
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar lote.');

      toast.success(data.message || 'Lote criado com sucesso!');
      setShowBatchModal(false);
      loadAllData();
      setActiveTab('coupons');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSingleCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (singleForm.initial_value <= 0) {
      toast.error('Informe o valor do cupom.');
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
      toast.success(data.message || 'Cupom criado!');
      setShowSingleModal(false);
      loadAllData();
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

  const exportCouponsCSV = () => {
    if (!coupons.length) {
      toast.error('Nenhum cupom na listagem para exportar.');
      return;
    }
    const headers = [
      'Codigo',
      'Lote',
      'Empresa_Parceira',
      'Modo',
      'Tipo',
      'Valor_Inicial',
      'Valor_Usado',
      'Saldo_Atual',
      'Abate_Frete',
      'Colaborador_Nome',
      'Colaborador_CPF',
      'Colaborador_Email',
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
    a.download = `cupons_corporativos_b2c_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val || 0));

  const storefrontPreviewHostname =
    summary?.settings?.b2c_custom_domain ||
    summary?.settings?.custom_domain ||
    summary?.settings?.domain ||
    'localhost';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/20 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Storefront Aberto B2C &amp; Vouchers Corporativos
              </h1>
              <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300">
                Horus ERP + LGPD + {summary?.settings?.b2c_checkout_mode === 'TRAY_REDIRECT' ? 'Checkout Tray' : 'Gateway Nativo'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Emita cupons para empresas parceiras distribuírem aos funcionários, acompanhe saldos residuais gerados e audite todas as compras.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={`/domain/${storefrontPreviewHostname}?b2c=1`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-fuchsia-600" />
            Abrir Vitrine B2C
          </a>

          <button
            onClick={() => setShowSingleModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-50/70 dark:bg-fuchsia-950/30 hover:bg-fuchsia-100 text-xs sm:text-sm font-bold text-fuchsia-700 dark:text-fuchsia-300 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Cupom Avulso
          </button>

          <button
            onClick={() => setShowBatchModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo Lote Empresa Parceira
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Orçamento Emitido em Vouchers</p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            {formatBRL(summary?.total_issued_value || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary?.total_batches || 0} lotes • {summary?.total_coupons || 0} cupons totais
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Valor Já Consumido</p>
          <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatBRL(summary?.total_used_value || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary?.total_redemptions || 0} pedidos realizados com cupom
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Saldo Residual Disponível</p>
          <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
            {formatBRL(summary?.total_remaining_balance || 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary?.residual_generated_coupons || 0} novos cupons de saldo gerados
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Status de Utilização</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
              {summary?.exhausted_coupons || 0}
            </span>
            <span className="text-xs text-slate-500">100% usados</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {summary?.available_coupons || 0} disponíveis • {summary?.partially_used_coupons || 0} parciais
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Conformidade LGPD</p>
          <p className="text-xl font-extrabold text-teal-600 dark:text-teal-400 mt-1">
            {summary?.total_lgpd_consents || 0} Aceites
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Auditados com IP, Data/Hora e Navegador
          </p>
        </div>
      </div>

      {/* Navigation Tabs (Mobile Scrollable) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'batches', label: '1. Lotes Corporativos (Empresas)', icon: Building2 },
          { id: 'coupons', label: '2. Cupons Emitidos & Saldos', icon: Ticket },
          { id: 'redemptions', label: '3. Relatório de Utilização (Quem Usou)', icon: Users },
          { id: 'lgpd', label: '4. Domínio B2C, Frete & Auditoria LGPD', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                active
                  ? 'bg-fuchsia-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: LOTES CORPORATIVOS */}
      {activeTab === 'batches' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                <th className="py-3.5 px-4">Lote / Campanha</th>
                <th className="py-3.5 px-4">Empresa Parceira</th>
                <th className="py-3.5 px-4">Modo de Distribuição</th>
                <th className="py-3.5 px-4">Valor por Colaborador</th>
                <th className="py-3.5 px-4">Regras de Saldo &amp; Frete</th>
                <th className="py-3.5 px-4">Adesão / Consumo</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhum lote corporativo cadastrado ainda. Clique em <strong>Novo Lote Empresa Parceira</strong> para gerar cupons.
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
                      {b.partner_document && (
                        <span className="block text-[11px] font-mono text-slate-400">{b.partner_document}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {b.batch_mode === 'SHARED_CPF_LIMIT' ? (
                        <div>
                          <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                            Código Geral por CPF
                          </span>
                          <span className="block font-mono font-bold text-xs text-indigo-600 mt-1">
                            {b.shared_code}
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 text-[11px] font-bold">
                          Códigos Individuais ({b.coupons_count})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {b.discount_type === 'PERCENTAGE' ? `${b.coupon_value}%` : formatBRL(b.coupon_value)}
                    </td>
                    <td className="py-3.5 px-4 text-xs space-y-1">
                      <span className="block text-slate-600 dark:text-slate-300">
                        • Frete incluso: <strong>{b.allows_freight_discount ? 'Sim' : 'Não (Só Produtos)'}</strong>
                      </span>
                      <span className="block text-slate-600 dark:text-slate-300">
                        • Gera cupom residual: <strong>{b.allow_residual_balance ? 'Sim (Automático)' : 'Não'}</strong>
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {b.coupons_used_count} / {b.coupons_count || b.max_uses_total} utilizados
                      </div>
                      <div className="text-[11px] text-emerald-600 font-semibold">
                        Consumido: {formatBRL(b.consumed_batch_value)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedBatchFilter(String(b.id));
                          setActiveTab('coupons');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-fuchsia-50 text-xs font-bold text-slate-700 dark:text-slate-200"
                      >
                        Ver Cupons →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: CUPONS EMITIDOS & SALDOS */}
      {activeTab === 'coupons' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={couponSearch}
                  onChange={(e) => setCouponSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                  placeholder="Buscar por código, CPF, nome do colaborador ou cupom residual..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                />
              </div>

              <select
                value={selectedBatchFilter}
                onChange={(e) => setSelectedBatchFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="">Todos os Lotes</option>
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
                <option value="PARTIALLY_USED">Parcialmente Usados</option>
                <option value="EXHAUSTED">100% Utilizados / Esgotados</option>
                <option value="CANCELLED">Cancelados</option>
              </select>

              <button
                onClick={loadAllData}
                className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
              >
                Filtrar
              </button>
            </div>

            <button
              onClick={exportCouponsCSV}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shrink-0"
            >
              <Download className="w-4 h-4" />
              Exportar Planilha CSV (RH)
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3.5 px-4">Código do Cupom</th>
                  <th className="py-3.5 px-4">Empresa / Lote</th>
                  <th className="py-3.5 px-4">Colaborador (CPF / Nome)</th>
                  <th className="py-3.5 px-4">Valor Inicial</th>
                  <th className="py-3.5 px-4">Consumido</th>
                  <th className="py-3.5 px-4">Saldo Atual / Residual</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                {coupons.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Nenhum cupom encontrado para os filtros selecionados.
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
                            Saldo Residual Automático
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.partner_company_name || c.batch_name || 'Avulso'}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {c.allows_freight_discount ? 'Produtos + Frete' : 'Somente Produtos'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {c.assigned_name || c.assigned_cpf ? (
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {c.assigned_name || 'Colaborador'}
                            </span>
                            {c.assigned_cpf && (
                              <span className="block font-mono text-[11px] text-slate-500">
                                CPF: {c.assigned_cpf}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Livre (Vincula no 1º uso)</span>
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
                          {formatBRL(c.current_balance)}
                        </span>
                        {c.generated_child_code && (
                          <div className="text-[11px] text-amber-600 font-semibold mt-0.5">
                            Novo cupom gerado: <code className="font-mono font-bold">{c.generated_child_code}</code>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {c.status === 'AVAILABLE' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-bold">
                            Disponível
                          </span>
                        )}
                        {c.status === 'PARTIALLY_USED' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                            Uso Parcial
                          </span>
                        )}
                        {c.status === 'EXHAUSTED' && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                            Utilizado
                          </span>
                        )}
                        {c.status === 'CANCELLED' && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-[11px] font-bold">
                            Cancelado
                          </span>
                        )}
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
        </div>
      )}

      {/* TAB 3: RELATÓRIO DE UTILIZAÇÃO (AUDITORIA RH / QUEM USOU) */}
      {activeTab === 'redemptions' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={redemptionSearch}
                onChange={(e) => setRedemptionSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                placeholder="Buscar utilização por colaborador, CPF, e-mail ou código do cupom..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
              />
            </div>
            <button
              onClick={loadAllData}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
            >
              Atualizar Relatório
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3.5 px-4">Data / Pedido</th>
                  <th className="py-3.5 px-4">Colaborador / Cliente</th>
                  <th className="py-3.5 px-4">Cupom Usado</th>
                  <th className="py-3.5 px-4">Total Compra (Prod+Frete)</th>
                  <th className="py-3.5 px-4">Abatido no Cupom</th>
                  <th className="py-3.5 px-4">Usou Tudo ou Sobrou?</th>
                  <th className="py-3.5 px-4">Diferença Paga &amp; Canal</th>
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
                        <span className="font-mono font-bold text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-950/40 px-2 py-0.5 rounded">
                          {r.coupon_code}
                        </span>
                        {r.partner_company_name && (
                          <span className="block text-[11px] text-slate-400 mt-0.5">
                            {r.partner_company_name}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {formatBRL(Number(r.order_subtotal || 0) + Number(r.order_freight || 0))}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          Prod: {formatBRL(r.order_subtotal)} | Frete: {formatBRL(r.order_freight)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-600">
                        - {formatBRL(r.discount_applied)}
                      </td>
                      <td className="py-3.5 px-4">
                        {r.used_full_balance ? (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                            Usou 100% do Cupom
                          </span>
                        ) : (
                          <div>
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                              Sobrou {formatBRL(r.remaining_balance)}
                            </span>
                            {r.residual_coupon_code && (
                              <span className="block text-[11px] text-amber-700 dark:text-amber-400 font-mono mt-1">
                                Novo Cupom: <strong>{r.residual_coupon_code}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {Number(r.difference_paid || 0) <= 0.009 ? (
                          <span className="text-xs font-bold text-emerald-600">
                            R$ 0,00 (100% Coberto)
                          </span>
                        ) : (
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              Pagou Dif.: {formatBRL(r.difference_paid)}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              Via: {r.checkout_mode === 'TRAY_REDIRECT' ? 'Carrinho Tray' : 'Gateway Nativo'}
                            </span>
                          </div>
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

      {/* TAB 4: DOMÍNIO B2C, FRETE & AUDITORIA LGPD */}
      {activeTab === 'lgpd' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Configurações do Storefront B2C &amp; Termo LGPD
                </h2>
                <p className="text-xs text-slate-500">
                  Personalize o domínio aberto B2C, regras de frete e o texto de consentimento LGPD apresentado aos clientes.
                </p>
              </div>
              <button
                onClick={handleSaveB2CSettings}
                disabled={savingSettings}
                className="px-4 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50"
              >
                {savingSettings ? 'Salvando...' : 'Salvar Configurações B2C'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Domínio Próprio B2C (Ex: loja.suaeditora.com.br)
                </label>
                <input
                  type="text"
                  value={settingsForm.b2c_custom_domain}
                  onChange={(e) => setSettingsForm({ ...settingsForm, b2c_custom_domain: e.target.value })}
                  placeholder="loja.suaeditora.com.br"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Frete Econômico Padrão (R$)
                </label>
                <CurrencyInput
                  prefixStr="R$ "
                  value={settingsForm.b2c_default_freight_value}
                  onChangeValue={(val) => setSettingsForm({ ...settingsForm, b2c_default_freight_value: val })}
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
                  onChangeValue={(val) => setSettingsForm({ ...settingsForm, b2c_free_shipping_min_value: val })}
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
                onChange={(e) => setSettingsForm({ ...settingsForm, b2c_lgpd_terms_text: e.target.value })}
                placeholder="Ao finalizar seu cadastro e pedido, você autoriza o tratamento dos seus dados pessoais conforme a LGPD..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* Tabela de Auditoria LGPD */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Trilha de Auditoria de Consentimento LGPD (Clientes B2C)
                </h3>
              </div>
              <span className="text-xs text-slate-500">{lgpdConsents.length} registros</span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Data / Hora do Aceite</th>
                  <th className="py-3 px-4">Titular dos Dados (Nome / CPF)</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Endereço IP</th>
                  <th className="py-3 px-4">Versão Termo / Opt-in</th>
                  <th className="py-3 px-4">Dispositivo (User-Agent)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {lgpdConsents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
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
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{c.ip_address}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 font-bold">
                          {c.terms_version}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Mkt: {c.marketing_opt_in ? 'Aceito' : 'Apenas Transacional'}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-400" title={c.user_agent}>
                        {c.user_agent}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NOVO LOTE CORPORATIVO */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-fuchsia-600" />
                Criar Lote de Cupons para Empresa Parceira
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
                    Nome do Lote / Campanha *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchForm.name}
                    onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                    placeholder="Ex: Vale-Livro Natal Empresa X"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Razão Social / Nome da Empresa Parceira
                  </label>
                  <input
                    type="text"
                    value={batchForm.partner_company_name}
                    onChange={(e) => setBatchForm({ ...batchForm, partner_company_name: e.target.value })}
                    placeholder="Ex: TechCorp Brasil Ltda"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Modo de Distribuição */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Modo de Distribuição para os Funcionários
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBatchForm({ ...batchForm, batch_mode: 'INDIVIDUAL_CODES' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      batchForm.batch_mode === 'INDIVIDUAL_CODES'
                        ? 'border-fuchsia-600 bg-fuchsia-50/60 dark:bg-fuchsia-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      1. Lote de Códigos Individuais
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Gera N códigos únicos (1 por funcionário) para exportar em CSV.
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
                      2. Cupom Geral da Empresa por CPF
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Um único código (ex: EMPRESAX100) controlado individualmente pelo CPF do funcionário.
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
                        onChange={(e) => setBatchForm({ ...batchForm, code_prefix: e.target.value.toUpperCase() })}
                        placeholder="Ex: TECHCORP"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Quantidade de Vouchers a Gerar
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={batchForm.quantity}
                        onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })}
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
                        onChange={(e) => setBatchForm({ ...batchForm, shared_code: e.target.value.toUpperCase() })}
                        placeholder="Ex: TECHCORP100"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Limite Máximo de Funcionários (CPFs)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={batchForm.quantity}
                        onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })}
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
                    Tipo de Benefício
                  </label>
                  <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setBatchForm({ ...batchForm, discount_type: 'FIXED_BRL' })}
                      className={`flex-1 py-2 text-xs font-bold ${
                        batchForm.discount_type === 'FIXED_BRL'
                          ? 'bg-fuchsia-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      Valor (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchForm({ ...batchForm, discount_type: 'PERCENTAGE', coupon_value: 20 })}
                      className={`flex-1 py-2 text-xs font-bold ${
                        batchForm.discount_type === 'PERCENTAGE'
                          ? 'bg-fuchsia-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      Desconto (%)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {batchForm.discount_type === 'PERCENTAGE' ? 'Percentual (%)' : 'Valor de Cada Voucher (R$)'}
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
                    onChange={(e) => setBatchForm({ ...batchForm, allows_freight_discount: e.target.checked })}
                    className="mt-0.5 rounded text-fuchsia-600"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Permitir abater o Frete no saldo do cupom
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Se desmarcado, o cupom abate apenas os livros e o cliente paga o frete.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchForm.allow_residual_balance}
                    onChange={(e) => setBatchForm({ ...batchForm, allow_residual_balance: e.target.checked })}
                    className="mt-0.5 rounded text-fuchsia-600"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Gerar novo cupom com Saldo Residual
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Se sobrar valor na compra, cria um novo código automático com a diferença.
                    </span>
                  </div>
                </label>
              </div>

              {/* Lista Opcional de Funcionários */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lista Nominal de Funcionários (Opcional — 1 por linha: <code>Nome;CPF;Email</code>)
                </label>
                <textarea
                  rows={3}
                  value={batchForm.employees_raw}
                  onChange={(e) => setBatchForm({ ...batchForm, employees_raw: e.target.value })}
                  placeholder={'João Silva;12345678901;joao@empresa.com.br\nMaria Souza;98765432100;maria@empresa.com.br'}
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
                  className="px-5 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Gerando Cupons...' : 'Criar Lote & Gerar Vouchers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CUPOM AVULSO */}
      {showSingleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Emitir Cupom Individual Avulso
              </h3>
              <button onClick={() => setShowSingleModal(false)} className="text-slate-400">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSingleCoupon} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Código do Cupom (Deixe em branco para gerar automático)
                </label>
                <input
                  type="text"
                  value={singleForm.code}
                  onChange={(e) => setSingleForm({ ...singleForm, code: e.target.value.toUpperCase() })}
                  placeholder="Ex: PRESENTE100"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Valor do Cupom (R$)
                </label>
                <CurrencyInput
                  prefixStr="R$ "
                  value={singleForm.initial_value}
                  onChangeValue={(val) => setSingleForm({ ...singleForm, initial_value: val })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome do Beneficiário
                  </label>
                  <input
                    type="text"
                    value={singleForm.assigned_name}
                    onChange={(e) => setSingleForm({ ...singleForm, assigned_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    CPF (Opcional)
                  </label>
                  <input
                    type="text"
                    value={singleForm.assigned_cpf}
                    onChange={(e) => setSingleForm({ ...singleForm, assigned_cpf: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={singleForm.allows_freight_discount}
                  onChange={(e) => setSingleForm({ ...singleForm, allows_freight_discount: e.target.checked })}
                />
                Permitir abater o valor do frete neste cupom
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={singleForm.allow_residual_balance}
                  onChange={(e) => setSingleForm({ ...singleForm, allow_residual_balance: e.target.checked })}
                />
                Gerar novo cupom com saldo residual se sobrar valor
              </label>

              <div className="flex justify-end gap-2 pt-2">
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
                  className="px-4 py-2 rounded-xl bg-fuchsia-600 text-white text-xs font-bold"
                >
                  Criar Cupom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
