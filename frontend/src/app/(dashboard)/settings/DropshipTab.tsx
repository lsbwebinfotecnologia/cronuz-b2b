'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Save, Package, AlertTriangle, CheckCircle2, Search,
  Plus, Pencil, Trash2, Star, ShieldCheck, Key,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DropshipConfig {
  id?: number;
  enabled: boolean;
  api_token: string | null;
  api_base_url: string | null;
  horus_customer_id: number | null;
  horus_customer_name: string | null;
  horus_fiscal_param_remessa_intra: string | null;
  horus_fiscal_param_remessa_inter: string | null;
  horus_fiscal_param_venda: string | null;
  horus_tipo_cliente: string | null;
  horus_resp_cliente: string | null;
  horus_cod_resp: string | null;
  horus_cod_endereco: string | null;
  horus_cod_metodo: string | null;
  horus_cod_endereco_pedido: string | null;
  horus_cod_transp: string | null;
  horus_frete_emit_dest: string | null;
  horus_status_envio_erp: string | null;
  vlr_taxa_frete: number | null;
  perc_desconto_remessa: number | null;
  usar_pedido_remessa: boolean;
  horus_status_pedido_venda: string | null;
}

interface CustomerOption {
  id: number;
  name: string;
  document: string;
}

interface ErdosCredential {
  id: number;
  company_id: number;
  config_id: number;
  label: string;
  api_token: string;
  horus_customer_id: number;
  horus_customer_name: string | null;
  horus_customer_document: string | null;
  horus_customer_cod_cli: string | null;
  horus_fiscal_param_remessa_intra: string | null;
  horus_fiscal_param_remessa_inter: string | null;
  horus_fiscal_param_venda: string | null;
  is_primary: boolean;
  is_active: boolean;
}

interface CredentialForm {
  label: string;
  api_token: string;
  horus_customer_id: number | null;
  horus_customer_name: string;
  horus_customer_cod_cli: string;
  horus_fiscal_param_remessa_intra: string;
  horus_fiscal_param_remessa_inter: string;
  horus_fiscal_param_venda: string;
  is_primary: boolean;
  is_active: boolean;
}

const EMPTY_CRED_FORM: CredentialForm = {
  label: '',
  api_token: '',
  horus_customer_id: null,
  horus_customer_name: '',
  horus_customer_cod_cli: '',
  horus_fiscal_param_remessa_intra: '',
  horus_fiscal_param_remessa_inter: '',
  horus_fiscal_param_venda: '',
  is_primary: false,
  is_active: true,
};

function FieldInput({
  label, hint, value, onChange, placeholder, mono = true,
}: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">{label}</label>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        className={`w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 ${mono ? 'font-mono' : ''}`}
      />
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Modal de Credencial ──────────────────────────────────────────────────────
function CredentialModal({
  companyId, editing, onClose, onSaved,
}: {
  companyId: number;
  editing: ErdosCredential | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CredentialForm>(
    editing
      ? {
          label: editing.label,
          api_token: editing.api_token,
          horus_customer_id: editing.horus_customer_id,
          horus_customer_name: editing.horus_customer_name || '',
          horus_customer_cod_cli: editing.horus_customer_cod_cli || '',
          horus_fiscal_param_remessa_intra: editing.horus_fiscal_param_remessa_intra || '',
          horus_fiscal_param_remessa_inter: editing.horus_fiscal_param_remessa_inter || '',
          horus_fiscal_param_venda: editing.horus_fiscal_param_venda || '',
          is_primary: editing.is_primary,
          is_active: editing.is_active,
        }
      : EMPTY_CRED_FORM
  );
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState(editing?.horus_customer_name || '');
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchCustomers = async (q: string) => {
    if (!q || q.length < 2) { setCustomerOptions([]); return; }
    setSearchingCustomer(true);
    try {
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/customers?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) { setCustomerOptions(await res.json()); setShowDropdown(true); }
    } catch { setCustomerOptions([]); }
    finally { setSearchingCustomer(false); }
  };

  const handleSave = async () => {
    if (!form.label.trim()) { toast.error('Informe um rótulo para a credencial.'); return; }
    if (!form.api_token.trim()) { toast.error('Informe o token de acesso.'); return; }
    if (!form.horus_customer_id) { toast.error('Vincule um customer Hórus.'); return; }
    setSaving(true);
    try {
      const url = editing
        ? `${API_URL}/dropship/config/${companyId}/credentials/${editing.id}`
        : `${API_URL}/dropship/config/${companyId}/credentials`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: form.label,
          api_token: form.api_token,
          horus_customer_id: form.horus_customer_id,
          horus_customer_cod_cli: form.horus_customer_cod_cli || null,
          horus_fiscal_param_remessa_intra: form.horus_fiscal_param_remessa_intra || null,
          horus_fiscal_param_remessa_inter: form.horus_fiscal_param_remessa_inter || null,
          horus_fiscal_param_venda: form.horus_fiscal_param_venda || null,
          is_primary: form.is_primary,
          is_active: form.is_active,
        }),
      });
      if (res.ok) {
        toast.success(editing ? 'Credencial atualizada!' : 'Credencial criada!');
        onSaved();
        onClose();
      } else {
        const err = await res.json();
        toast.error(`Erro: ${err.detail || 'Erro desconhecido'}`);
      }
    } catch { toast.error('Erro de conexão.'); }
    finally { setSaving(false); }
  };

  const inputBase = 'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-lg">
            <Key className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
            {editing ? 'Editar Credencial' : 'Nova Credencial Erdos'}
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Rótulo da Credencial *</label>
            <input
              type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              placeholder="Ex: Editora XYZ (SP)" className={inputBase}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Token de Acesso (x-api-key) *</label>
            <input
              type="password" value={form.api_token} onChange={e => setForm(p => ({ ...p, api_token: e.target.value }))}
              placeholder="Token do Hub-Erdos" className={`${inputBase} font-mono`}
            />
          </div>
          {/* Customer */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Customer Hórus *</label>
            <p className="text-[11px] text-slate-400">Empresa Erdos no Hórus vinculada a este CNPJ</p>
            <div className="relative">
              <input
                type="text" value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); searchCustomers(e.target.value); }}
                onFocus={() => { if (customerOptions.length > 0) setShowDropdown(true); }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Buscar customer por nome..."
                className={inputBase}
              />
              {searchingCustomer && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                </div>
              )}
              {showDropdown && customerOptions.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {customerOptions.map(c => (
                    <button
                      key={c.id} type="button"
                      onClick={() => {
                        setForm(p => ({ ...p, horus_customer_id: c.id, horus_customer_name: c.name }));
                        setCustomerSearch(c.name); setShowDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm transition-colors"
                    >
                      <p className="font-medium text-slate-800 dark:text-slate-200">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.document}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.horus_customer_id && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Vinculado: <strong>{form.horus_customer_name}</strong></p>
              </div>
            )}
          </div>
          {/* Fiscais */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Parâmetros Fiscais desta Credencial</p>
            <p className="text-[11px] text-slate-400">Variam por CNPJ/UF — específicos deste token</p>
            <div className="grid grid-cols-2 gap-3">
              <FieldInput label="COD_PARAM_FISCAL — Intraestadual" hint="UF do cliente == UF do seller"
                value={form.horus_fiscal_param_remessa_intra}
                onChange={v => setForm(p => ({ ...p, horus_fiscal_param_remessa_intra: v }))} placeholder="Ex: 123" />
              <FieldInput label="COD_PARAM_FISCAL — Interestadual" hint="UF do cliente != UF do seller"
                value={form.horus_fiscal_param_remessa_inter}
                onChange={v => setForm(p => ({ ...p, horus_fiscal_param_remessa_inter: v }))} placeholder="Ex: 124" />
            </div>
            <FieldInput label="COD_PARAM_FISCAL — Venda" hint="Tipo VENDA · Não baixa estoque"
              value={form.horus_fiscal_param_venda}
              onChange={v => setForm(p => ({ ...p, horus_fiscal_param_venda: v }))} placeholder="Ex: 125" />
          </div>
          {/* Flags */}
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_primary}
                onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))}
                className="w-4 h-4 rounded accent-violet-500" />
              <span className="text-xs text-slate-700 dark:text-slate-300">Credencial Primária (estoque)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                className="w-4 h-4 rounded accent-violet-500" />
              <span className="text-xs text-slate-700 dark:text-slate-300">Ativa</span>
            </label>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 px-5 rounded-xl transition-all text-sm disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editing ? 'Salvar Alterações' : 'Criar Credencial'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export function DropshipTab() {
  const [companyId, setCompanyId] = useState<number | null>(null);

  useEffect(() => {
    const user = getUser();
    setCompanyId(user?.company_id ?? null);
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [credentials, setCredentials] = useState<ErdosCredential[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [credModal, setCredModal] = useState<{ open: boolean; editing: ErdosCredential | null }>({ open: false, editing: null });
  const [deletingCredId, setDeletingCredId] = useState<number | null>(null);

  const [form, setForm] = useState<{
    enabled: boolean;
    api_token: string;
    api_base_url: string;
    horus_customer_id: number | null;
    horus_customer_name: string;
    horus_fiscal_param_remessa_intra: string;
    horus_fiscal_param_remessa_inter: string;
    horus_fiscal_param_venda: string;
    horus_tipo_cliente: string;
    horus_resp_cliente: string;
    horus_cod_resp: string;
    horus_cod_endereco: string;
    horus_cod_metodo: string;
    horus_cod_endereco_pedido: string;
    horus_cod_transp: string;
    horus_frete_emit_dest: string;
    horus_status_envio_erp: string;
    vlr_taxa_frete: number;
    perc_desconto_remessa: number;
    usar_pedido_remessa: boolean;
    horus_status_pedido_venda: string;
  }>({
    enabled: false,
    api_token: '',
    api_base_url: 'https://wxcapqbtvgttooamglxx.supabase.co/functions/v1/api-fornecedor',
    horus_customer_id: null,
    horus_customer_name: '',
    horus_fiscal_param_remessa_intra: '',
    horus_fiscal_param_remessa_inter: '',
    horus_fiscal_param_venda: '',
    horus_tipo_cliente: '',
    horus_resp_cliente: '',
    horus_cod_resp: '',
    horus_cod_endereco: '',
    horus_cod_metodo: '',
    horus_cod_endereco_pedido: '',
    horus_cod_transp: '',
    horus_frete_emit_dest: '',
    horus_status_envio_erp: '',
    vlr_taxa_frete: 0,
    perc_desconto_remessa: 0,
    usar_pedido_remessa: true,
    horus_status_pedido_venda: '',
  });

  const fetchConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/dropship/config/${companyId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data: DropshipConfig = await res.json();
        setForm({
          enabled: data.enabled,
          api_token: data.api_token || '',
          api_base_url: data.api_base_url || 'https://wxcapqbtvgttooamglxx.supabase.co/functions/v1/api-fornecedor',
          horus_customer_id: data.horus_customer_id,
          horus_customer_name: data.horus_customer_name || '',
          horus_fiscal_param_remessa_intra: data.horus_fiscal_param_remessa_intra || '',
          horus_fiscal_param_remessa_inter: data.horus_fiscal_param_remessa_inter || '',
          horus_fiscal_param_venda: data.horus_fiscal_param_venda || '',
          horus_tipo_cliente: data.horus_tipo_cliente || '',
          horus_resp_cliente: data.horus_resp_cliente || '',
          horus_cod_resp: data.horus_cod_resp || '',
          horus_cod_endereco: data.horus_cod_endereco || '',
          horus_cod_metodo: data.horus_cod_metodo || '',
          horus_cod_endereco_pedido: data.horus_cod_endereco_pedido || '',
          horus_cod_transp: data.horus_cod_transp || '',
          horus_frete_emit_dest: data.horus_frete_emit_dest || '',
          horus_status_envio_erp: data.horus_status_envio_erp || '',
          vlr_taxa_frete: data.vlr_taxa_frete ?? 0,
          perc_desconto_remessa: data.perc_desconto_remessa ?? 0,
          usar_pedido_remessa: data.usar_pedido_remessa ?? true,
          horus_status_pedido_venda: data.horus_status_pedido_venda || '',
        });
        if (data.horus_customer_name) setCustomerSearch(data.horus_customer_name);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [companyId]);

  const fetchCredentials = useCallback(async () => {
    if (!companyId) return;
    setLoadingCreds(true);
    try {
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/credentials`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setCredentials(await res.json());
    } catch { /* silencioso */ }
    finally { setLoadingCreds(false); }
  }, [companyId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);

  const searchCustomers = async (q: string) => {
    if (!q || q.length < 2) { setCustomerOptions([]); return; }
    setSearchingCustomer(true);
    try {
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/customers?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) { setCustomerOptions(await res.json()); setShowDropdown(true); }
    } catch { setCustomerOptions([]); }
    finally { setSearchingCustomer(false); }
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/dropship/config/${companyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success('Configuração Dropship salva!');
        fetchConfig();
        fetchCredentials();
      } else {
        const err = await res.json();
        toast.error(`Erro: ${err.detail || 'Erro desconhecido'}`);
      }
    } catch { toast.error('Erro de conexão ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleDeleteCred = async (credId: number) => {
    if (!companyId || !confirm('Confirma a remoção desta credencial?')) return;
    setDeletingCredId(credId);
    try {
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/credentials/${credId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) { toast.success('Credencial removida.'); fetchCredentials(); }
      else { const err = await res.json(); toast.error(err.detail || 'Erro ao remover.'); }
    } catch { toast.error('Erro de conexão.'); }
    finally { setDeletingCredId(null); }
  };

  const handleSetPrimary = async (credId: number) => {
    if (!companyId) return;
    try {
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/credentials/${credId}/set-primary`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) { toast.success('Credencial primária definida.'); fetchCredentials(); }
      else { const err = await res.json(); toast.error(err.detail || 'Erro.'); }
    } catch { toast.error('Erro de conexão.'); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const inputBase = 'w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30';

  return (
    <div className="space-y-6 p-1">
      {credModal.open && companyId && (
        <CredentialModal
          companyId={companyId}
          editing={credModal.editing}
          onClose={() => setCredModal({ open: false, editing: null })}
          onSaved={fetchCredentials}
        />
      )}

      {/* Cabeçalho */}
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-4">
        <div className="p-2 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-lg">
          <Package className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Configurações Dropship — Hórus</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Parâmetros de integração para envio de pedidos Erdos ao Hórus ERP
          </p>
        </div>
      </div>

      {/* Ativação + URL base */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/40">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Integração Erdos Ativa</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Habilita o fluxo de recebimento de pedidos dropship</p>
          </div>
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, enabled: !p.enabled }))}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${form.enabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <FieldInput
          label="URL Base — Hub-Erdos"
          hint="Não alterar a menos que a Erdos forneça outro endpoint"
          value={form.api_base_url}
          onChange={v => setForm(p => ({ ...p, api_base_url: v }))}
          placeholder="https://wxcapqbtvgttooamglxx.supabase.co/functions/v1/api-fornecedor"
        />
      </div>

      {/* ── Credenciais Erdos (Multi-Token) ── */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />
              Credenciais Erdos (Multi-Token)
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Cada credencial representa um CNPJ com token, customer e parâmetros fiscais próprios
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCredModal({ open: true, editing: null })}
            className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Credencial
          </button>
        </div>

        {loadingCreds ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
        ) : credentials.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <Key className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Nenhuma credencial configurada. Clique em <strong>Nova Credencial</strong>.</p>
            <p className="text-[11px] text-slate-400 mt-1">Token legado será migrado automaticamente ao carregar a tela.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map(cred => (
              <div
                key={cred.id}
                className={`flex items-start justify-between p-3.5 rounded-xl border transition-colors ${
                  cred.is_primary
                    ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/10'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30'
                } ${!cred.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{cred.label}</p>
                    {cred.is_primary && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-violet-500 text-white px-2 py-0.5 rounded-full">
                        <Star className="w-2.5 h-2.5" />
                        Primária
                      </span>
                    )}
                    {!cred.is_active && (
                      <span className="text-[10px] bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                        Inativa
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Customer: <span className="font-medium">{cred.horus_customer_name || cred.horus_customer_id}</span>
                    {cred.horus_fiscal_param_venda && (
                      <> · Venda: <span className="font-mono">{cred.horus_fiscal_param_venda}</span></>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-300 dark:text-slate-600 font-mono mt-0.5 truncate">
                    {cred.api_token.substring(0, 8)}••••••
                  </p>
                </div>
                <div className="flex items-center gap-1.5 ml-3 shrink-0">
                  {!cred.is_primary && (
                    <button
                      type="button" title="Definir como primária"
                      onClick={() => handleSetPrimary(cred.id)}
                      className="p-1.5 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button" title="Editar"
                    onClick={() => setCredModal({ open: true, editing: cred })}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button" title="Remover"
                    onClick={() => handleDeleteCred(cred.id)}
                    disabled={deletingCredId === cred.id}
                    className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    {deletingCredId === cred.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer do Seller (para busca de acervo) */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Customer do Seller (Hórus) — para busca de acervo
        </label>
        <p className="text-[11px] text-slate-400">Representa o SELLER no Hórus — usado para busca de estoque. Diferente do customer por credencial Erdos.</p>
        <div className="relative">
          <div className="relative">
            <input
              type="text" value={customerSearch}
              onChange={e => { setCustomerSearch(e.target.value); searchCustomers(e.target.value); }}
              onFocus={() => { if (customerOptions.length > 0) setShowDropdown(true); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Buscar customer por nome..."
              className={inputBase}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          {searchingCustomer && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          )}
          {showDropdown && customerOptions.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {customerOptions.map(c => (
                <button key={c.id} type="button"
                  onClick={() => {
                    setForm(p => ({ ...p, horus_customer_id: c.id, horus_customer_name: c.name }));
                    setCustomerSearch(c.name); setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm transition-colors"
                >
                  <p className="font-medium text-slate-800 dark:text-slate-200">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.document}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {form.horus_customer_id && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Vinculado: <strong>{form.horus_customer_name}</strong>
            </p>
          </div>
        )}
      </div>

      {/* Parâmetros do Cliente */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Parâmetros do Cliente — Hórus (InsCliente)</p>
          <p className="text-[11px] text-slate-400">Usados ao cadastrar o cliente consumidor final no Hórus (todos opcionais)</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FieldInput label="TIPO_CLI" hint="Tipo de cliente" value={form.horus_tipo_cliente} onChange={v => setForm(p => ({ ...p, horus_tipo_cliente: v }))} placeholder="Ex: 1" />
          <FieldInput label="RESP_CLI" hint="Responsável" value={form.horus_resp_cliente} onChange={v => setForm(p => ({ ...p, horus_resp_cliente: v }))} placeholder="Ex: 1" />
          <FieldInput label="COD_RESP" hint="Cód. responsável" value={form.horus_cod_resp} onChange={v => setForm(p => ({ ...p, horus_cod_resp: v }))} placeholder="Ex: 1" />
          <FieldInput label="COD_END" hint="Cód. endereço padrão" value={form.horus_cod_endereco} onChange={v => setForm(p => ({ ...p, horus_cod_endereco: v }))} placeholder="Ex: 1" />
        </div>
      </div>

      {/* Parâmetros do Pedido B2C Remessa */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Parâmetros da Remessa B2C — Hórus (InsPedidoVenda)</p>
          <p className="text-[11px] text-slate-400">Parâmetros obrigatórios para o pedido de remessa B2C</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <FieldInput label="COD_MET" hint="Método de venda" value={form.horus_cod_metodo} onChange={v => setForm(p => ({ ...p, horus_cod_metodo: v }))} placeholder="Ex: 2" />
          <FieldInput label="COD_TRANSP *" hint="Cód. Transportadora (obrigatório)" value={form.horus_cod_transp} onChange={v => setForm(p => ({ ...p, horus_cod_transp: v }))} placeholder="Ex: 1" />
          <FieldInput label="FRETE_EMIT_DEST *" hint="1=Emitente | 2=Destinatário" value={form.horus_frete_emit_dest} onChange={v => setForm(p => ({ ...p, horus_frete_emit_dest: v }))} placeholder="Ex: 1" />
          <FieldInput label="Status ao enviar (AltStatus)" hint="Cód. status pós-criação" value={form.horus_status_envio_erp} onChange={v => setForm(p => ({ ...p, horus_status_envio_erp: v }))} placeholder="Ex: LEX" />
          <FieldInput label="COD_END_PED" hint="Endereço do pedido (opcional)" value={form.horus_cod_endereco_pedido} onChange={v => setForm(p => ({ ...p, horus_cod_endereco_pedido: v }))} placeholder="Ex: 1" />
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">Parâmetros Financeiros</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Taxa de Frete — Venda (R$)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-xs text-slate-400 pointer-events-none">R$</span>
                <input id="vlr_taxa_frete" type="number" min={0} step={0.01} value={form.vlr_taxa_frete}
                  onChange={e => setForm(p => ({ ...p, vlr_taxa_frete: parseFloat(e.target.value) || 0 }))}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  placeholder="0.00" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Enviado como <span className="font-mono">VLR_FRETE</span> no pedido de Venda (6.118). Zero = não envia.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Desconto por Item — Remessa (%)</label>
              <div className="relative">
                <input id="perc_desconto_remessa" type="number" min={0} max={100} step={0.01} value={form.perc_desconto_remessa}
                  onChange={e => setForm(p => ({ ...p, perc_desconto_remessa: parseFloat(e.target.value) || 0 }))}
                  className="w-full pr-8 pl-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  placeholder="0.00" />
                <span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 pointer-events-none">%</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Desconto sobre <span className="font-mono">VLR_LIQUIDO</span> na Remessa (6.923). Zero = sem desconto.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Comportamento de Envio ao Hórus */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Comportamento de Envio ao Hórus</p>
          <p className="text-[11px] text-slate-400">Define se o sistema cria pedido de remessa (B2C) além do pedido de venda</p>
        </div>
        <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/40">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Usar Pedido de Remessa</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {form.usar_pedido_remessa
                ? 'SIM — envia Remessa (6.923) + Venda (6.118) para o Hórus'
                : 'NÃO — envia apenas Venda (6.118) com dados do cliente na observação'}
            </p>
          </div>
          <button
            type="button" id="toggle-usar-pedido-remessa"
            onClick={() => setForm(p => ({ ...p, usar_pedido_remessa: !p.usar_pedido_remessa }))}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${form.usar_pedido_remessa ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.usar_pedido_remessa ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {!form.usar_pedido_remessa && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Modo <strong>sem remessa</strong>: apenas o Pedido de Venda (6.118) será enviado ao Hórus.
              </p>
            </div>
            <div className="max-w-xs">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Status a Enviar (AltStatus Venda)</label>
              <input
                id="horus_status_pedido_venda" type="text" value={form.horus_status_pedido_venda}
                onChange={e => setForm(p => ({ ...p, horus_status_pedido_venda: e.target.value }))}
                placeholder="LEX (padrão se vazio)"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Aviso */}
      <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Os parâmetros fiscais são configurados <strong>por credencial</strong> e devem existir no Hórus ERP previamente.
        </p>
      </div>

      {/* Botão Salvar */}
      <div className="flex justify-end pt-2">
        <button
          type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações Dropship
        </button>
      </div>
    </div>
  );
}
