'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, User, Mail, Phone, FileText, BookOpen,
  ShieldCheck, ShieldOff, Clock, CheckCircle2, AlertCircle,
  Key, Send, Eye, EyeOff, Loader2, ExternalLink, Copy,
  RefreshCw, Lock, Unlock, Edit2, Save, X
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Author {
  id: number;
  cod_fornecedor: number;
  id_guid: string;
  id_doc: string;
  nome: string;
  nome_fantasia?: string;
  cnpj?: string;
  cpf?: string;
  emailb2b: string;
  end_email?: string;
  num_telefone?: string;
  classificacao_autor: string;
  status: 'PENDENTE_ATIVACAO' | 'ATIVO' | 'INATIVO';
  b2b_mostrar_vendas: string;
  b2b_mostrar_da: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  ATIVO: {
    label: 'Ativo',
    icon: <CheckCircle2 size={14} />,
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  PENDENTE_ATIVACAO: {
    label: 'Pendente Ativação',
    icon: <Clock size={14} />,
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  INATIVO: {
    label: 'Inativo',
    icon: <ShieldOff size={14} />,
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.INATIVO;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

function fmtDate(v?: string) {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AuthorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const authorId = params.id as string;

  const [author, setAuthor] = useState<Author | null>(null);
  const [loading, setLoading] = useState(true);

  // Painel: Definir senha manualmente
  const [showSetPasswordPanel, setShowSetPasswordPanel] = useState(false);
  const [manualPassword, setManualPassword] = useState('');
  const [manualPasswordConfirm, setManualPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Painel: Reenviar e-mail
  const [sendingEmail, setSendingEmail] = useState(false);
  const [activationUrl, setActivationUrl] = useState('');

  // Painel: Editar classificação / status
  const [editStatus, setEditStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [newClassificacao, setNewClassificacao] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchAuthor = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/authors/${authorId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Autor não encontrado');
      const data = await res.json();
      setAuthor(data);
      setNewStatus(data.status);
      setNewClassificacao(data.classificacao_autor);
    } catch {
      toast.error('Não foi possível carregar os dados do autor.');
      router.push('/authors');
    } finally {
      setLoading(false);
    }
  }, [authorId, router]);

  useEffect(() => { fetchAuthor(); }, [fetchAuthor]);

  /* ── Copiar para clipboard ─────────────────────────────────── */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copiado!'));
  };

  /* ── Definir senha manualmente ─────────────────────────────── */
  async function handleSetPassword() {
    if (manualPassword.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (manualPassword !== manualPasswordConfirm) {
      toast.error('As senhas não conferem.');
      return;
    }
    setSavingPassword(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/authors/${authorId}/set-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: manualPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao definir senha.');
      toast.success('✅ Senha definida com sucesso! Autor está ATIVO.');
      setManualPassword('');
      setManualPasswordConfirm('');
      setShowSetPasswordPanel(false);
      fetchAuthor();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao definir senha.');
    } finally {
      setSavingPassword(false);
    }
  }

  /* ── Reenviar e-mail de ativação ────────────────────────────── */
  async function handleSendEmail() {
    setSendingEmail(true);
    setActivationUrl('');
    try {
      const token = getToken();
      const res = await fetch(`${API}/authors/${authorId}/send-activation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao enviar e-mail.');
      toast.success('E-mail de ativação disparado!');
      setActivationUrl(data.activation_url || '');
      fetchAuthor();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar e-mail.');
    } finally {
      setSendingEmail(false);
    }
  }

  /* ── Salvar edição de status/classificação ──────────────────── */
  async function handleSaveEdit() {
    setSavingEdit(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/authors/${authorId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
          classificacao_autor: newClassificacao,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar.');
      toast.success('Dados atualizados com sucesso.');
      setEditStatus(false);
      fetchAuthor();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSavingEdit(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  if (!author) return null;

  const portalSlug = (() => {
    // será derivado pelo backend, aqui apenas info visual
    return authorId;
  })();

  const CLASSIFICACOES = [
    'Autor Principal', 'Coautor', 'Organizador',
    'Tradutor', 'Ilustrador', 'Prefaciador', 'Colaborador', 'Outro',
  ];

  return (
    <div className="space-y-5 pb-10">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/authors')}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={18} className="text-slate-500" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
            {author.nome}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Detalhes e gestão do autor
          </p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={author.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Coluna principal ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Card: Dados do Autor */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <User size={16} className="text-indigo-500" />
                Dados Cadastrais
              </h2>
              <button
                onClick={() => setEditStatus(!editStatus)}
                className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {editStatus ? <X size={14} /> : <Edit2 size={14} />}
                {editStatus ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow icon={<User size={14} />} label="Nome completo" value={author.nome} />
              {author.nome_fantasia && (
                <InfoRow icon={<BookOpen size={14} />} label="Nome fantasia" value={author.nome_fantasia} />
              )}
              <InfoRow icon={<FileText size={14} />} label="Documento (CPF/CNPJ)" value={author.id_doc} />
              {author.cpf && <InfoRow icon={<FileText size={14} />} label="CPF" value={author.cpf} />}
              {author.cnpj && <InfoRow icon={<FileText size={14} />} label="CNPJ" value={author.cnpj} />}
              <InfoRow icon={<Mail size={14} />} label="E-mail pessoal" value={author.end_email || '—'} />
              {author.num_telefone && (
                <InfoRow icon={<Phone size={14} />} label="Telefone" value={author.num_telefone} />
              )}
              <InfoRow icon={<FileText size={14} />} label="Cód. Fornecedor Horus" value={String(author.cod_fornecedor)} />
              <InfoRow icon={<FileText size={14} />} label="ID GUID Horus" value={author.id_guid} mono />
            </div>

            {/* Edição inline: classificação + status */}
            {editStatus && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Classificação
                    </label>
                    <select
                      value={newClassificacao}
                      onChange={e => setNewClassificacao(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      {CLASSIFICACOES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="PENDENTE_ATIVACAO">Pendente Ativação</option>
                      <option value="ATIVO">Ativo</option>
                      <option value="INATIVO">Inativo</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar alterações
                </button>
              </div>
            )}
          </div>

          {/* Card: Acesso B2B */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
              <Mail size={16} className="text-indigo-500" />
              Acesso B2B
            </h2>
            <div className="space-y-3">
              <InfoRow icon={<Mail size={14} />} label="E-mail de acesso (login)" value={author.emailb2b} />
              <InfoRow icon={<BookOpen size={14} />} label="Classificação" value={author.classificacao_autor} />
              <div className="grid grid-cols-2 gap-3">
                <InfoRow
                  icon={<FileText size={14} />}
                  label="Mostrar vendas"
                  value={author.b2b_mostrar_vendas === 'S' ? 'Sim' : 'Não'}
                />
                <InfoRow
                  icon={<FileText size={14} />}
                  label="Mostrar D.A."
                  value={author.b2b_mostrar_da === 'S' ? 'Sim' : 'Não'}
                />
              </div>
              <InfoRow icon={<Clock size={14} />} label="Último login" value={fmtDate(author.last_login_at)} />
              <InfoRow icon={<Clock size={14} />} label="Cadastrado em" value={fmtDate(author.created_at)} />
            </div>
          </div>

          {/* Link de acesso — URL pública do autor */}
          <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900 p-5">
            <h2 className="font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-2 mb-3">
              <ExternalLink size={16} />
              URL de Acesso do Portal
            </h2>
            <p className="text-xs text-indigo-700 dark:text-indigo-400 mb-3">
              Esta é a URL que o autor usa para entrar no Portal. Compartilhe com ele se necessário.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-xl px-3 py-2 text-indigo-700 dark:text-indigo-300 break-all">
                {/* A URL real é gerenciada pelo slug do domínio da empresa */}
                Portal do Autor → Login com: <strong>{author.emailb2b}</strong>
              </code>
            </div>
          </div>
        </div>

        {/* ── Coluna de Ações ─────────────────────────────────── */}
        <div className="space-y-4">

          {/* Card: Definir Senha Manualmente */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2 mb-1">
              <Key size={16} className="text-amber-500" />
              Definir Senha Manualmente
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Use quando o autor tiver dificuldade de acessar o e-mail de convite. Ao definir a senha, o autor é
              <strong className="text-emerald-600 dark:text-emerald-400"> ativado imediatamente</strong>.
            </p>

            {!showSetPasswordPanel ? (
              <button
                onClick={() => setShowSetPasswordPanel(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
              >
                <Unlock size={15} />
                Ativar e Definir Senha
              </button>
            ) : (
              <div className="space-y-3">
                {/* Campo senha */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={manualPassword}
                      onChange={e => setManualPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Confirmar senha */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Confirmar Senha
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={manualPasswordConfirm}
                      onChange={e => setManualPasswordConfirm(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
                    />
                  </div>
                  {manualPasswordConfirm && manualPassword !== manualPasswordConfirm && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={11} /> As senhas não conferem
                    </p>
                  )}
                  {manualPasswordConfirm && manualPassword === manualPasswordConfirm && manualPassword.length >= 6 && (
                    <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Senhas conferem
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowSetPasswordPanel(false); setManualPassword(''); setManualPasswordConfirm(''); }}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSetPassword}
                    disabled={savingPassword || manualPassword !== manualPasswordConfirm || manualPassword.length < 6}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {savingPassword ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card: E-mail de Ativação */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2 mb-1">
              <Send size={16} className="text-sky-500" />
              E-mail de Ativação
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Gera um novo link de primeiro acesso válido por 24h e tenta enviar para{' '}
              <strong className="text-slate-700 dark:text-slate-300">{author.emailb2b}</strong>.
            </p>

            <button
              onClick={handleSendEmail}
              disabled={sendingEmail}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {sendingEmail
                ? <Loader2 size={15} className="animate-spin" />
                : <RefreshCw size={15} />}
              {sendingEmail ? 'Gerando link...' : 'Reenviar / Gerar Link'}
            </button>

            {activationUrl && (
              <div className="mt-3 p-3 bg-sky-50 dark:bg-sky-950/30 rounded-xl border border-sky-100 dark:border-sky-900">
                <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 mb-2">
                  Link gerado (válido 24h):
                </p>
                <div className="flex items-start gap-2">
                  <code className="flex-1 text-[11px] text-sky-800 dark:text-sky-300 break-all leading-relaxed">
                    {activationUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(activationUrl)}
                    className="shrink-0 p-1.5 rounded-lg bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-400 hover:bg-sky-200 transition-colors"
                    title="Copiar link"
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <p className="text-[11px] text-sky-600 dark:text-sky-500 mt-2">
                  ⚠️ Se o SMTP não estiver configurado, o e-mail não é enviado automaticamente. Copie e envie este link manualmente.
                </p>
              </div>
            )}
          </div>

          {/* Card: Info rápida */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Resumo
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Status</span>
              <StatusBadge status={author.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Classificação</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {author.classificacao_autor}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Senha definida</span>
              <span className={`text-xs font-semibold ${author.status === 'ATIVO' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {author.status === 'ATIVO' ? '✓ Sim' : '✗ Não'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Componente auxiliar ─────────────────────────────────────── */
function InfoRow({
  icon, label, value, mono = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
        <span className="text-slate-400">{icon}</span>
        {label}
      </p>
      <p className={`text-sm font-medium text-slate-800 dark:text-white ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </p>
    </div>
  );
}
