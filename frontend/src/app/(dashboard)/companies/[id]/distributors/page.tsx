'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Truck, Plus, Save, Loader2, CheckCircle2, XCircle, AlertTriangle,
  Eye, EyeOff, Plug, Settings2, ToggleLeft, ToggleRight, Trash2,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type DistributorOut = {
  id: number;
  slug: string;
  name: string;
  enabled: boolean;
  base_url: string | null;
  username: string | null;
  has_password: boolean;
  has_api_key: boolean;
  token_configured: boolean;
};

// Distribuidores suportados — aparecerão mesmo sem configuração prévia
const KNOWN_DISTRIBUTORS = [
  {
    slug: 'catavento',
    name: 'Catavento',
    color: '#16a34a',
    auth_type: 'user_pass',   // username + password → token gerado automaticamente
    default_base_url: 'https://api.cataventobr.com.br',
    description: 'Distribuidora nacional de livros. Autenticação via usuário e senha (token gerado automaticamente).',
    logo: '📚',
  },
  {
    slug: 'disal',
    name: 'Disal',
    color: '#2563eb',
    auth_type: 'api_key',     // header xLtOpenKeyId
    default_base_url: 'https://marketplaceintegracao.disal.com.br',
    description: 'Disal Marketplace API. Autenticação via chave de API (xLtOpenKeyId).',
    logo: '📦',
  },
];

type DistributorMeta = typeof KNOWN_DISTRIBUTORS[0];

// ──────────────────────────────────────────────────────────────────────────────
// Helper: campo de senha com toggle show/hide
// ──────────────────────────────────────────────────────────────────────────────
function PasswordInput({
  value, onChange, placeholder, label, hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '••••••••'}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 pr-10 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Card de cada distribuidor
// ──────────────────────────────────────────────────────────────────────────────
function DistributorCard({
  meta, config, companyId, onSaved,
}: {
  meta: DistributorMeta;
  config: DistributorOut | null;
  companyId: string;
  onSaved: () => void;
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [baseUrl,   setBaseUrl]   = useState(config?.base_url   ?? meta.default_base_url);
  const [username,  setUsername]  = useState(config?.username   ?? '');
  const [password,  setPassword]  = useState('');
  const [apiKey,    setApiKey]    = useState('');
  const [enabled,   setEnabled]   = useState(config?.enabled    ?? false);
  const [saving,    setSaving]    = useState(false);
  const [testing,   setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [toggling,  setToggling]  = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const hasConfig = !!config;

  async function handleSave() {
    setSaving(true);
    try {
      const token = getToken();
      const body: Record<string, unknown> = {
        slug: meta.slug,
        name: meta.name,
        enabled,
        base_url: baseUrl || meta.default_base_url,
      };

      if (meta.auth_type === 'user_pass') {
        body.username = username;
        if (password) body.password = password;
      } else if (meta.auth_type === 'api_key') {
        if (apiKey) body.api_key = apiKey;
      }

      const res = await fetch(
        `${apiUrl}/companies/${companyId}/distributors/${meta.slug}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao salvar configuração.');
        return;
      }

      toast.success(`${meta.name} configurada com sucesso!`);
      setPassword('');
      setApiKey('');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      const token = getToken();
      const newEnabled = !enabled;
      const res = await fetch(
        `${apiUrl}/companies/${companyId}/distributors/${meta.slug}/toggle`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: newEnabled }),
        }
      );
      if (res.ok) {
        setEnabled(newEnabled);
        toast.success(`${meta.name} ${newEnabled ? 'habilitada' : 'desabilitada'}.`);
        onSaved();
      } else {
        toast.error('Erro ao alterar status.');
      }
    } finally {
      setToggling(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/companies/${companyId}/distributors/${meta.slug}/test`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({ ok: false, message: 'Erro desconhecido.' }));
      setTestResult(data);
      if (data.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remover credenciais da ${meta.name}? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/companies/${companyId}/distributors/${meta.slug}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok || res.status === 204) {
        toast.success(`${meta.name} removida.`);
        onSaved();
      } else {
        toast.error('Erro ao remover distribuidor.');
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderLeft: `4px solid ${meta.color}` }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.logo}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{meta.name}</h3>
              {hasConfig && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider
                    ${enabled
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                    }`}
                >
                  {enabled ? '● Ativo' : '○ Inativo'}
                </span>
              )}
              {!hasConfig && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                  Não configurado
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="flex items-center gap-2 shrink-0">
          {hasConfig && (
            <>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                Testar
              </button>

              <button
                onClick={handleToggle}
                disabled={toggling}
                title={enabled ? 'Desabilitar' : 'Habilitar'}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  background: enabled ? `${meta.color}15` : '#f1f5f9',
                  color:      enabled ? meta.color : '#64748b',
                }}
              >
                {toggling
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : enabled
                    ? <ToggleRight className="w-4 h-4" />
                    : <ToggleLeft className="w-4 h-4" />
                }
                {enabled ? 'Desabilitar' : 'Habilitar'}
              </button>

              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                title="Remover credenciais"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resultado do teste */}
      {testResult && (
        <div
          className={`mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium
            ${testResult.ok
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            }`}
        >
          {testResult.ok
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <XCircle className="w-4 h-4 shrink-0" />
          }
          {testResult.message}
        </div>
      )}

      {/* Formulário de credenciais */}
      <div className="px-5 pb-5 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          <Settings2 className="w-3.5 h-3.5" />
          Credenciais
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">URL Base</label>
          <input
            type="url"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder={meta.default_base_url}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
          />
        </div>

        {meta.auth_type === 'user_pass' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">E-mail / Usuário</label>
              <input
                type="email"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
              />
            </div>
            <PasswordInput
              label="Senha"
              value={password}
              onChange={setPassword}
              placeholder={hasConfig && config?.has_password ? '(mantém senha atual)' : 'Nova senha'}
              hint={hasConfig && config?.has_password ? 'Deixe em branco para manter a senha atual.' : undefined}
            />
            {hasConfig && config?.token_configured && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                Token de autenticação cacheado — será renovado automaticamente ao expirar.
              </div>
            )}
          </>
        )}

        {meta.auth_type === 'api_key' && (
          <PasswordInput
            label={`API Key (xLtOpenKeyId)`}
            value={apiKey}
            onChange={setApiKey}
            placeholder={hasConfig && config?.has_api_key ? '(mantém chave atual)' : 'Sua chave de API'}
            hint={hasConfig && config?.has_api_key ? 'Deixe em branco para manter a chave atual.' : undefined}
          />
        )}

        <div className="flex items-center gap-3 pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-[#00b4b4]"
            />
            Habilitar este distribuidor
          </label>

          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto flex items-center gap-2 rounded-lg bg-[#00b4b4] hover:bg-[#009999] text-white px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────

export default function CompanyDistributorsPage() {
  const params    = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [configs,  setConfigs]  = useState<DistributorOut[]>([]);
  const [loading,  setLoading]  = useState(true);

  async function loadConfigs() {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/companies/${companyId}/distributors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConfigs(await res.json());
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadConfigs(); }, [companyId]);

  const getConfig = (slug: string) => configs.find(c => c.slug === slug) || null;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00b4b4]/10 flex items-center justify-center">
            <Truck className="w-5 h-5 text-[#00b4b4]" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">Distribuidores</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure as integrações com distribuidores de livros para <strong>{company?.name}</strong>.
              O saldo de cada distribuidor habilitado aparecerá na tela de Busca Preço.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-6 space-y-4 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Carregando configurações...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              As credenciais são armazenadas de forma segura. Senhas e chaves de API nunca são exibidas após salvas.
            </div>

            {KNOWN_DISTRIBUTORS.map(meta => (
              <DistributorCard
                key={meta.slug}
                meta={meta}
                config={getConfig(meta.slug)}
                companyId={companyId}
                onSaved={loadConfigs}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
