'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  PackageCheck, Save,
  Wifi, WifiOff,
  Loader2,
  Search, User2, AlertTriangle, CheckCircle2,
  RefreshCw, Info
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';
import { useParams } from 'next/navigation';

interface DropshipConfig {
  id: number;
  company_id: number;
  provider: string;
  enabled: boolean;
  api_token: string | null;
  api_base_url: string | null;
  horus_customer_id: number | null;
  horus_customer_name: string | null;
  horus_customer_document: string | null;
  horus_customer_id_guid: string | null;
  horus_customer_id_doc: string | null;
  horus_fiscal_param_remessa: string | null;
  horus_fiscal_param_venda: string | null;
  stock_sync_interval_min: number;
  stock_sync_enabled: boolean;
  stock_sync_last_run: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CustomerOption {
  id: number;
  name: string;
  document: string;
  id_guid: string | null;
  id_doc: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function CompanyDropshipPage() {
  const { company } = useCompany();
  const params = useParams();
  const companyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [connectionMsg, setConnectionMsg] = useState('');

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [formData, setFormData] = useState<{
    provider: string;
    enabled: boolean;
    api_token: string;
    api_base_url: string;
    horus_customer_id: number | null;
    horus_customer_name: string;
    horus_fiscal_param_remessa: string;
    horus_fiscal_param_venda: string;
    stock_sync_interval_min: number;
    stock_sync_enabled: boolean;
  }>({
    provider: 'ERDOS',
    enabled: false,
    api_token: '',
    api_base_url: 'https://wxcapqbtvgttooamglxx.supabase.co/functions/v1/api-fornecedor',
    horus_customer_id: null,
    horus_customer_name: '',
    horus_fiscal_param_remessa: '',
    horus_fiscal_param_venda: '',
    stock_sync_interval_min: 30,
    stock_sync_enabled: false,
  });

  // Switch idêntico ao padrão da página de Módulos
  const Switch = ({
    active,
    onClick,
    disabled,
    colorClass = 'bg-[var(--color-primary-base)]',
  }: {
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
    colorClass?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        active ? colorClass : 'bg-slate-200 dark:bg-slate-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          active ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const fetchConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/config/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: DropshipConfig = await res.json();
        setFormData({
          provider: data.provider || 'ERDOS',
          enabled: data.enabled,
          api_token: data.api_token || '',
          api_base_url: data.api_base_url || '',
          horus_customer_id: data.horus_customer_id,
          horus_customer_name: data.horus_customer_name || '',
          horus_fiscal_param_remessa: data.horus_fiscal_param_remessa || '',
          horus_fiscal_param_venda: data.horus_fiscal_param_venda || '',
          stock_sync_interval_min: data.stock_sync_interval_min || 30,
          stock_sync_enabled: data.stock_sync_enabled,
        });
        if (data.horus_customer_name) {
          setCustomerSearch(data.horus_customer_name);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/config/${companyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success('Configuração Dropship salva com sucesso!');
        fetchConfig();
      } else {
        const err = await res.json();
        toast.error(`Erro ao salvar: ${err.detail || 'Erro desconhecido'}`);
      }
    } catch (e) {
      toast.error('Erro de conexão ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/test-connection`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'connected') {
        setConnectionStatus('connected');
        setConnectionMsg(data.detail?.mensagem || 'Conexão estabelecida com sucesso.');
      } else {
        setConnectionStatus('error');
        setConnectionMsg(data.detail || 'Falha na conexão.');
      }
    } catch {
      setConnectionStatus('error');
      setConnectionMsg('Erro de rede ao testar conexão.');
    } finally {
      setTestingConnection(false);
    }
  };

  const searchCustomers = async (q: string) => {
    if (!q || q.length < 2) {
      setCustomerOptions([]);
      return;
    }
    setSearchingCustomer(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/customers?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: CustomerOption[] = await res.json();
        setCustomerOptions(data);
        setShowCustomerDropdown(true);
      }
    } catch {
      setCustomerOptions([]);
    } finally {
      setSearchingCustomer(false);
    }
  };

  const handleCustomerSearchChange = (val: string) => {
    setCustomerSearch(val);
    if (!val) {
      setFormData(p => ({ ...p, horus_customer_id: null, horus_customer_name: '' }));
      setShowCustomerDropdown(false);
    }
    searchCustomers(val);
  };

  const selectCustomer = (c: CustomerOption) => {
    setFormData(p => ({ ...p, horus_customer_id: c.id, horus_customer_name: c.name }));
    setCustomerSearch(`${c.name} — ${c.document}`);
    setShowCustomerDropdown(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-gradient-to-r from-violet-600/5 to-purple-600/5 dark:from-violet-900/20 dark:to-purple-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
              <PackageCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Dropshipping</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Integração Hub-Erdos · Livraria Erdos</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Configuração
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 flex-1">
        {/* Toggle Habilitação */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                formData.enabled
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}>
                <PackageCheck className={`w-4 h-4 ${
                  formData.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                }`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Dropshipping {formData.provider}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formData.enabled ? 'Integração ativa — pedidos serão sincronizados' : 'Integração desativada'}
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400">
                {formData.enabled ? 'Ativado' : 'Desativado'}
              </span>
              <Switch
                active={formData.enabled}
                onClick={() => setFormData(p => ({ ...p, enabled: !p.enabled }))}
                colorClass="bg-emerald-500"
              />
            </div>
          </div>
        </motion.div>

        {/* Credenciais do Hub */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Credenciais do Hub-Erdos</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Token de autenticação fornecido pela Livraria Erdos</p>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                URL Base da API
              </label>
              <input
                type="text"
                value={formData.api_base_url}
                onChange={e => setFormData(p => ({ ...p, api_base_url: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                placeholder="https://hub-erdos.supabase.co/functions/v1/api-fornecedor"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                API Key (x-api-key)
              </label>
              <input
                type="password"
                value={formData.api_token}
                onChange={e => setFormData(p => ({ ...p, api_token: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                placeholder="efb8fbc8dd4d..."
              />
            </div>

            {/* Teste de Conexão */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTestConnection}
                disabled={testingConnection || !formData.api_token || !formData.api_base_url}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                {testingConnection ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wifi className="w-3.5 h-3.5" />
                )}
                Testar Conexão
              </button>
              {connectionStatus === 'connected' && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {connectionMsg}
                </span>
              )}
              {connectionStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                  <WifiOff className="w-3.5 h-3.5" /> {connectionMsg}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Vínculo do Customer Hórus (Parceiro) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl"
        >
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 rounded-t-2xl">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Customer Parceiro (Hórus)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Customer cadastrado no Cronuz com id_guid e id_doc vinculados — usado como destinatário do pedido de venda no Hórus
            </p>
          </div>
          <div className="p-5">
            <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40 rounded-xl p-3 mb-4 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
              <p className="text-xs text-violet-700 dark:text-violet-300">
                Apenas customers com <strong>id_guid</strong> e <strong>id_doc</strong> configurados são exibidos,
                pois são necessários para a integração com o Hórus ERP.
              </p>
            </div>

            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Buscar Customer (nome ou CNPJ)
            </label>
            <div
              className="relative"
              onBlur={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setTimeout(() => setShowCustomerDropdown(false), 150);
                }
              }}
            >
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                {searchingCustomer ? (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-slate-400" />
                )}
              </div>
              <input
                type="text"
                value={customerSearch}
                onChange={e => handleCustomerSearchChange(e.target.value)}
                onFocus={() => customerOptions.length > 0 && setShowCustomerDropdown(true)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                placeholder="Digite nome ou CNPJ do parceiro..."
              />

              {showCustomerDropdown && customerOptions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-[999] max-h-52 overflow-y-auto">
                  {customerOptions.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-left transition-colors"
                    >
                      <User2 className="w-4 h-4 text-violet-500 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">{c.name}</p>
                        <p className="text-[10px] text-slate-500">{c.document} · id_doc: {c.id_doc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {formData.horus_customer_id && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Customer vinculado: <strong>{formData.horus_customer_name}</strong>
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Parâmetros Fiscais Hórus */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Parâmetros Fiscais Hórus</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Códigos dos parâmetros fiscais criados no Hórus para o fluxo de dropshipping
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  COD_PARAM_FISCAL — Remessa (CFOP 6.923)
                </label>
                <input
                  type="text"
                  value={formData.horus_fiscal_param_remessa}
                  onChange={e => setFormData(p => ({ ...p, horus_fiscal_param_remessa: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                  placeholder="Ex: 123"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Tipo DIVERSOS · Baixa estoque físico · movimentação = Sim
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  COD_PARAM_FISCAL — Venda (CFOP 6.118)
                </label>
                <input
                  type="text"
                  value={formData.horus_fiscal_param_venda}
                  onChange={e => setFormData(p => ({ ...p, horus_fiscal_param_venda: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                  placeholder="Ex: 124"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Tipo VENDA · Não baixa estoque · movimentação = Não
                </p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Os parâmetros fiscais devem ser criados previamente no Hórus ERP e os códigos gerados informados aqui.
                Para o pedido de <strong>Venda (6.118)</strong>, o parâmetro deve estar configurado também diretamente
                no Hórus nas configurações do customer ERDOS para o B2B.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Sincronização de Estoque */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sincronização de Estoque</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Envio automático de posição de estoque para o Hub-Erdos via AcervoB2B (COD_BARRA_ITEM → SKU)
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Sincronização Automática</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Ativar envio periódico de estoque (Fase 2)</p>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-400">
                  {formData.stock_sync_enabled ? 'Ativado' : 'Desativado'}
                </span>
                <Switch
                  active={formData.stock_sync_enabled}
                  onClick={() => setFormData(p => ({ ...p, stock_sync_enabled: !p.stock_sync_enabled }))}
                  colorClass="bg-violet-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Intervalo de Envio (minutos)
              </label>
              <input
                type="number"
                min={10}
                max={1440}
                value={formData.stock_sync_interval_min}
                onChange={e => setFormData(p => ({ ...p, stock_sync_interval_min: parseInt(e.target.value) || 30 }))}
                className="w-32 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <p className="text-[10px] text-slate-400 mt-1">Recomendado: mínimo 30 minutos</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
