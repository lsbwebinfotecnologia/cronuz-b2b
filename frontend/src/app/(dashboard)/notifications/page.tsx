'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, Bell, Plus, Pencil, Trash2, X, Save,
  Info, AlertTriangle, CheckCircle, Bell as BellIcon,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';


// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AlertType = 'info' | 'warning' | 'success' | 'urgent';

interface Alert {
  id: number;
  company_id: number;
  title: string;
  message: string;
  type: AlertType;
  active: boolean;
  dismissible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  scope: 'all' | 'home';
  pin_to_top: boolean;
  created_at: string;
}

interface AlertFormState {
  title: string;
  message: string;
  type: AlertType;
  active: boolean;
  dismissible: boolean;
  starts_at: string;
  ends_at: string;
  scope: 'all' | 'home';
  pin_to_top: boolean;
}

const EMPTY_FORM: AlertFormState = {
  title: '',
  message: '',
  type: 'info',
  active: true,
  dismissible: true,
  starts_at: '',
  ends_at: '',
  scope: 'all',
  pin_to_top: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<AlertType, { label: string; icon: React.ElementType; badge: string; preview: string }> = {
  info: {
    label: 'Informação',
    icon: Info,
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    preview: 'bg-sky-50 border-sky-200 text-sky-800',
  },
  warning: {
    label: 'Atenção',
    icon: AlertTriangle,
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    preview: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  success: {
    label: 'Sucesso',
    icon: CheckCircle,
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    preview: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  urgent: {
    label: 'Urgente',
    icon: BellIcon,
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    preview: 'bg-rose-50 border-rose-200 text-rose-800',
  },
};

const TYPE_ICONS: Record<AlertType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  success: '✅',
  urgent: '🔔',
};

function getAlertStatus(alert: Alert): { label: string; className: string } {
  const now = new Date();
  const startsAt = alert.starts_at ? new Date(alert.starts_at) : null;
  const endsAt = alert.ends_at ? new Date(alert.ends_at) : null;

  if (!alert.active) return { label: 'Inativo', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' };
  if (endsAt && endsAt < now) return { label: 'Expirado', className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' };
  if (startsAt && startsAt > now) return { label: 'Agendado', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' };
  return { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocal(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CompanyAlertsPage() {
  
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null);
  const [form, setForm] = useState<AlertFormState>(EMPTY_FORM);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    // Seller: usa company_id do token — sem necessidade de company na URL
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAlerts(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // ── Form helpers ─────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingAlert(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (alert: Alert) => {
    setEditingAlert(alert);
    setForm({
      title: alert.title,
      message: alert.message,
      type: alert.type,
      active: alert.active,
      dismissible: alert.dismissible,
      starts_at: toDatetimeLocal(alert.starts_at),
      ends_at: toDatetimeLocal(alert.ends_at),
      scope: alert.scope || 'all',
      pin_to_top: alert.pin_to_top || false,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingAlert(null);
    setForm(EMPTY_FORM);
  };

  const handleField = (field: keyof AlertFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Seller: usa company_id do token — sem necessidade de company na URL
    if (!form.title.trim()) { toast.error('Título é obrigatório.'); return; }

    setSaving(true);
    const payload = {
      // company_id resolvido no backend pelo token
      title: form.title.trim(),
      message: form.message.trim(),
      type: form.type,
      active: form.active,
      dismissible: form.dismissible,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      scope: form.scope,
      pin_to_top: form.pin_to_top,
    };

    try {
      const token = getToken();
      const url = editingAlert ? `${API}/alerts/${editingAlert.id}` : `${API}/alerts`;
      const method = editingAlert ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Falha ao salvar alerta');
      toast.success(editingAlert ? 'Alerta atualizado!' : 'Alerta criado!');
      closeForm();
      fetchAlerts();
    } catch {
      toast.error('Erro ao salvar alerta.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este alerta permanentemente?')) return;
    setDeleting(id);
    try {
      const token = getToken();
      const res = await fetch(`${API}/alerts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success('Alerta excluído.');
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      if (editingAlert?.id === id) closeForm();
    } catch {
      toast.error('Erro ao excluir alerta.');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  const previewConfig = TYPE_CONFIG[form.type];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto">
      {/* ── Header ── */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-rose-500" /> Alertas B2B
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie os banners de alerta exibidos no storefront dos clientes.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold rounded-xl shadow-sm transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Novo Alerta
        </button>
      </div>

      <div className="p-6 space-y-4 flex-1">
        {/* ── Form Panel ── */}
        {formOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm overflow-hidden mb-6"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingAlert ? `Editar Alerta #${editingAlert.id}` : 'Novo Alerta'}
              </h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Title */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Título *</label>
                  <span className="text-xs text-slate-400">{form.title.length}/120</span>
                </div>
                <input
                  type="text"
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => handleField('title', e.target.value)}
                  placeholder="Ex: Novidades no catálogo de primavera"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Mensagem</label>
                <textarea
                  rows={2}
                  value={form.message}
                  onChange={(e) => handleField('message', e.target.value)}
                  placeholder="Descrição detalhada que aparece ao lado do título..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 resize-none"
                />
              </div>

              {/* Type selector */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(Object.entries(TYPE_CONFIG) as [AlertType, typeof TYPE_CONFIG[AlertType]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const isSelected = form.type === key;
                    return (
                      <label
                        key={key}
                        className={
                          'flex items-center gap-2 cursor-pointer px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ' +
                          (isSelected
                            ? cfg.badge + ' border-current ring-2 ring-current/20'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300')
                        }
                      >
                        <input
                          type="radio"
                          name="alert-type"
                          value={key}
                          checked={isSelected}
                          onChange={() => handleField('type', key)}
                          className="sr-only"
                        />
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {cfg.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Início (opcional)</label>
                  <input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => handleField('starts_at', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fim (opcional)</label>
                  <input
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(e) => handleField('ends_at', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => handleField('active', !form.active)}
                    className={'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ' + (form.active ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700')}
                  >
                    <span className={'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ' + (form.active ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Ativo</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => handleField('dismissible', !form.dismissible)}
                    className={'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ' + (form.dismissible ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700')}
                  >
                    <span className={'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ' + (form.dismissible ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Dispensável pelo cliente</span>
                </label>
              </div>

              {/* Escopo e Posicionamento */}
              <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/30">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Exibição no Storefront</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Páginas</label>
                  <div className="flex gap-2">
                    {(['all', 'home'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleField('scope', s)}
                        className={'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ' + (form.scope === s ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300')}
                      >
                        {s === 'all' ? '🌐 Todas as páginas' : '🏠 Somente Home'}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => handleField('pin_to_top', !form.pin_to_top)}
                    className={'mt-0.5 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ' + (form.pin_to_top ? 'bg-rose-500' : 'bg-slate-200 dark:bg-slate-700')}
                  >
                    <span className={'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ' + (form.pin_to_top ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Fixar no topo da loja</span>
                    <span className="text-xs text-slate-500">Faixa colorida acima do header, sem botão fechar. Ideal para instabilidades, manutenção ou lançamentos urgentes.</span>
                  </div>
                </label>
              </div>

              {/* Live preview */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-500">Preview do banner</label>
                <div className={'rounded-xl border px-4 py-3 flex items-center gap-3 ' + previewConfig.preview}>
                  <span className="text-lg select-none" aria-hidden="true">{TYPE_ICONS[form.type]}</span>
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm truncate">{form.title || 'Título do alerta'}</span>
                    <span className="opacity-40 select-none hidden sm:inline">·</span>
                    <span className="text-sm opacity-90 truncate">{form.message || 'Mensagem do alerta aparece aqui...'}</span>
                  </div>
                  {form.dismissible && (
                    <span className="shrink-0 p-1 rounded-lg opacity-50"><X className="w-4 h-4" /></span>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  {editingAlert && (
                    <button
                      type="button"
                      onClick={() => handleDelete(editingAlert.id)}
                      disabled={deleting === editingAlert.id}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                    >
                      {deleting === editingAlert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Excluir
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="px-5 py-2.5 text-sm font-bold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold rounded-xl shadow-sm transition-all active:scale-95"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}

        {/* ── Empty state ── */}
        {alerts.length === 0 && !formOpen && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
              <Bell className="w-10 h-10 text-slate-400" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum alerta criado ainda.</p>
            <p className="text-sm text-slate-400 mt-1">Clique em "Novo Alerta" para criar o primeiro banner.</p>
          </div>
        )}

        {/* ── Alert list ── */}
        {alerts.length > 0 && (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const status = getAlertStatus(alert);
              const cfg = TYPE_CONFIG[alert.type];
              const TypeIcon = cfg.icon;
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    <span className={'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ' + cfg.badge}>
                      <TypeIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{alert.title}</p>
                      {alert.message && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{alert.message}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-1.5">
                        {alert.starts_at && (
                          <span className="text-[11px] text-slate-400">Início: {formatDate(alert.starts_at)}</span>
                        )}
                        {alert.ends_at && (
                          <span className="text-[11px] text-slate-400">Fim: {formatDate(alert.ends_at)}</span>
                        )}
                        {!alert.starts_at && !alert.ends_at && (
                          <span className="text-[11px] text-slate-400">Sem agendamento</span>
                        )}
                      </div>
                    </div>

                    <span className={'px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ' + status.className}>
                      {status.label}
                    </span>

                    <button
                      onClick={() => openEdit(alert)}
                      className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(alert.id)}
                      disabled={deleting === alert.id}
                      className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      title="Excluir"
                    >
                      {deleting === alert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
