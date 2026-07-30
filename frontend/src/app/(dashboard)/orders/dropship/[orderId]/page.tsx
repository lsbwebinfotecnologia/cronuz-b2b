'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, PackageCheck, Send, CheckCircle2, Clock, PackageX,
  Loader2, MapPin, ShoppingCart, Truck, FileText, Tag, Download,
  Printer, RefreshCw, AlertTriangle, X, Search, ClipboardCheck
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface DropshipOrder {
  id: number;
  company_id: number;
  external_order_id: string;
  external_reference: string | null;
  channel: string | null;
  status: string;
  released_at: string | null;
  customer_data: any;
  items_data: any[];
  logistics_data: any;
  fiscal_data: any;
  horus_pedido_remessa: string | null;
  horus_pedido_venda: string | null;
  horus_cod_cli_final: string | null;
  tracking_code: string | null;
  nfe_remessa_key: string | null;
  label_path: string | null;
  danfe_path: string | null;
  xml_path: string | null;
  synced_at: string | null;
  sent_to_horus_at: string | null;
  dispatched_at: string | null;
  created_at: string | null;
  // Campos Erdos em tempo real
  erdos_status: string | null;
  erdos_checked_at: string | null;
  erdos_alert: boolean;
  logs: Array<{ at: string; event: string; erdos_status: string; local_status_before: string; local_status_after: string; detail: string; }> | null;
  conference?: { id: number; branch_id: number; status: string; cod_cli: string; cod_pedido_origem: string; created_at: string; } | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  PENDING:       { label: 'Pendente',         icon: Clock,          color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40' },
  SENT_TO_HORUS: { label: 'Enviado ao Hórus', icon: Send,           color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40' },
  DISPATCHED:    { label: 'Despachado',        icon: CheckCircle2,   color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/40' },
  CANCELLED:     { label: 'Cancelado',         icon: PackageX,       color: 'text-rose-600 dark:text-rose-400',     bg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700/40' },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return dateStr; }
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-violet-500" />
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

interface DispatchModalProps {
  order: DropshipOrder;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function DispatchModal({ order, companyId, onClose, onSuccess }: DispatchModalProps) {
  const [tracking, setTracking] = useState('');
  const [nfeKey, setNfeKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${order.id}/confirm-dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_code: tracking || null, nfe_remessa_key: nfeKey || null }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Despacho confirmado!');
        onSuccess();
        onClose();
      } else {
        toast.error(data.detail || 'Erro ao confirmar despacho');
      }
    } catch { toast.error('Erro de conexão.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-500" /> Confirmar Despacho
          </h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Código de Rastreamento</label>
            <input value={tracking} onChange={e => setTracking(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
              placeholder="BR123456789BR" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Chave NF-e Remessa (6.923)</label>
            <input value={nfeKey} onChange={e => setNfeKey(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
              placeholder="35260631492667..." />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 rounded-xl transition-all disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirmar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function DropshipOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<DropshipOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState('');
  const [sendingToHorus, setSendingToHorus] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [checkingErdos, setCheckingErdos] = useState(false);
  const [erdosCheckResult, setErdosCheckResult] = useState<any>(null);

  // Modal de Conferência Logística
  const [showConfModal, setShowConfModal] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [confCodCli, setConfCodCli] = useState('');
  const [confCodOrigem, setConfCodOrigem] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);

  const openConferenceModal = async () => {
    const cust = order?.customer_data || {};
    const cpfCnpjClean = String(cust.cpf_cnpj || cust.document || '').replace(/\D/g, '');
    const defaultCodCli = order?.horus_cod_cli_final || cpfCnpjClean || '';

    const remessaCode = order?.horus_pedido_remessa ? String(order.horus_pedido_remessa).replace('#', '').trim() : '';
    const extId = order?.external_reference || order?.external_order_id || order?.id || '';
    const defaultCodOrigem = remessaCode || `RM-${extId}`;

    setConfCodCli(defaultCodCli);
    setConfCodOrigem(defaultCodOrigem);
    setShowConfModal(true);

    setLoadingBranches(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/logistics/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBranches(data);
        if (data.length > 0 && !selectedBranchId) {
          setSelectedBranchId(String(data[0].id));
        }
      }
    } catch {
      toast.error('Erro ao carregar filiais');
    } finally {
      setLoadingBranches(false);
    }
  };

  const [startingConf, setStartingConf] = useState(false);
  const [deletingConf, setDeletingConf] = useState(false);

  const handleStartConference = async () => {
    if (!selectedBranchId || !confCodCli || !confCodOrigem) {
      toast.error('Preencha a filial do seller e os códigos para iniciar.');
      return;
    }

    setStartingConf(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/logistics/orders/search?branch_id=${selectedBranchId}&cod_cli=${encodeURIComponent(confCodCli)}&cod_pedido_origem=${encodeURIComponent(confCodOrigem)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao consultar o pedido no Hórus.');
      }

      toast.success('Conferência iniciada no Hórus com sucesso!');
      setShowConfModal(false);

      if (data.session && data.session.id) {
        router.push(`/logistics/conference?conf_id=${data.session.id}`);
      } else {
        router.push(
          `/logistics/conference?branch_id=${selectedBranchId}&cod_cli=${encodeURIComponent(confCodCli)}&cod_pedido_origem=${encodeURIComponent(confCodOrigem)}&auto_start=true`
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao iniciar conferência no Hórus.');
    } finally {
      setStartingConf(false);
    }
  };

  const handleDeleteConference = async (confId: number) => {
    if (!confirm('Tem certeza que deseja cancelar/excluir esta conferência em aberto?')) return;
    setDeletingConf(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/logistics/orders/conferences/${confId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao excluir conferência.');
      }
      toast.success('Conferência em aberto excluída com sucesso.');
      fetchOrder();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir conferência.');
    } finally {
      setDeletingConf(false);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCompanyId(String(payload.company_id || ''));
      } catch {}
    }
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!companyId || !orderId) return;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setOrder(await res.json());
      else toast.error('Pedido não encontrado.');
    } catch { toast.error('Erro ao carregar pedido.'); }
    finally { setLoading(false); }
  }, [companyId, orderId]);

  // Auto-verifica status no Erdos logo após carregar o pedido
  const checkErdosStatus = useCallback(async (silent = true, currentOrder?: DropshipOrder) => {
    const ord = currentOrder || order;
    if (!ord || !companyId) return;
    if (checkingErdos) return;
    setCheckingErdos(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${ord.id}/check-erdos-status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setErdosCheckResult(data);
        if (data.changed) {
          // Recarregar o pedido com os novos dados
          const r2 = await fetch(`${API_URL}/dropship/orders/${companyId}/${ord.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (r2.ok) setOrder(await r2.json());
        }
        if (!silent && data.action) {
          const toastMap: Record<string, () => void> = {
            auto_cancelled:     () => toast.error('⚠️ Pedido cancelado no Erdos. Status atualizado.'),
            alert_cancel_in_horus: () => toast.error('⛔ Pedido cancelado no Erdos após envio ao Hórus. Cancele no Hórus!'),
            tracking_captured:  () => toast.success(`📦 Rastreio capturado: ${data.tracking_code}`),
            delivered_ok:       () => toast.success('✅ Pedido entregue confirmado no Erdos.'),
            conflict_dispatched_but_cancelled: () => toast.error('⚠️ CONFLITO CRÍTICO: despachado mas cancelado no Erdos.'),
          };
          toastMap[data.action]?.();
        }
      }
    } catch { /* silencioso */ }
    finally { setCheckingErdos(false); }
  }, [companyId, order, checkingErdos]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Auto-check Erdos quando o pedido é carregado (e não está cancelado/despachado definitivo)
  useEffect(() => {
    if (!order || !companyId) return;
    if (['CANCELLED', 'DISPATCHED'].includes(order.status)) return; // já terminal — não precisa
    checkErdosStatus(true, order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, companyId]);

  const handleOpenDocument = async (docType: string) => {
    if (!order || !companyId) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${order.id}/documents/${docType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        window.open(`${API_URL}${data.url}`, '_blank');
      } else {
        toast.error(data.detail || `Documento ${docType} indisponível`);
      }
    } catch { toast.error('Erro ao obter documento.'); }
  };

  const handleSendToHorus = async () => {
    if (!order || !companyId) return;
    setSendingToHorus(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${order.id}/send-to-horus`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        if (data.errors?.length > 0) {
          toast.warning(`Enviado com avisos: ${data.errors.join(' | ')}`);
        } else {
          toast.success(`Pedidos gerados! Remessa: #${data.horus_pedido_remessa} | Venda: #${data.horus_pedido_venda}`);
        }
        fetchOrder();
      } else {
        // O backend pode retornar detail como string OU como { mensagem, erros: [] }
        const detail = data.detail;
        if (detail && typeof detail === 'object' && detail.erros) {
          // Validação pré-voo: exibe mensagem principal + cada erro individualmente
          toast.error(detail.mensagem || 'Erro ao enviar ao Hórus', { duration: 6000 });
          (detail.erros as string[]).forEach((err: string) => {
            toast.error(err, { duration: 8000 });
          });
        } else {
          toast.error(typeof detail === 'string' ? detail : 'Erro ao enviar ao Hórus');
        }
      }
    } catch { toast.error('Erro de conexão.'); }
    finally { setSendingToHorus(false); }
  };

  const handleCheckErdosStatus = () => checkErdosStatus(false);


  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-400 mb-3" />
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Pedido não encontrado</p>
        <button onClick={() => router.back()} className="mt-4 text-xs text-violet-600 hover:underline">Voltar</button>
      </div>
    );
  }

  const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
  const StatusIcon = st.icon;
  const customer = order.customer_data || {};
  const items = order.items_data || [];
  const logistics = order.logistics_data || {};
  const fiscal = order.fiscal_data || {};

  const docs = [
    { type: 'xml',      label: 'XML NF-e',  icon: FileText,  available: !!order.xml_path },
    { type: 'danfe',    label: 'DANFE',      icon: Printer,   available: !!order.danfe_path },
    { type: 'etiqueta', label: 'Etiqueta',   icon: Tag,       available: !!order.label_path },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.back()}
            className="mt-0.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {order.external_reference || `Pedido ${order.external_order_id.substring(0, 12)}…`}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${st.bg} ${st.color}`}>
                <StatusIcon className="w-3 h-3" />
                {st.label}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Canal: <span className="capitalize">{order.channel || '—'}</span> ·
              Liberado: {formatDate(order.released_at)}
            </p>
          </div>
        </div>

        {/* Ação principal */}
        <div className="shrink-0 flex items-center gap-2">
          {order.status === 'PENDING' && (
            <button
              onClick={handleSendToHorus}
              disabled={sendingToHorus}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all disabled:opacity-60"
            >
              {sendingToHorus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar para o Hórus
            </button>
          )}
          {order.status === 'SENT_TO_HORUS' && (
            <>
              {/* Verifica status no Erdos: pode ter sido cancelado ou rastreio atualizado */}
              <button
                onClick={handleCheckErdosStatus}
                disabled={checkingErdos}
                title="Consulta GET /pedidos/{id} no Erdos e sincroniza cancelamentos / rastreio"
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition-all disabled:opacity-60"
              >
                {checkingErdos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Verificar no Erdos
              </button>
              <button
                onClick={() => setShowDispatch(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Despacho
              </button>
            </>
          )}
        </div>
      </div>

      {/* Banner de fluxo Erdos — mostra etapa atual */}
      {order.status !== 'CANCELLED' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Fluxo Hub Horus B2B</p>
          <div className="flex items-center gap-1 flex-wrap">
            {([
              { key: 'PENDING',       label: '1. Aguardando',     desc: 'Na fila Erdos' },
              { key: '_arrow1',       label: '→',                 desc: '' },
              { key: 'SENT_TO_HORUS', label: '2. Em Preparação',  desc: 'Hórus + PATCH preparando' },
              { key: '_arrow2',       label: '→',                 desc: '' },
              { key: 'DISPATCHED',   label: '3. Despachado',      desc: 'POST atualizar-status-despacho' },
            ] as const).map((step) => {
              if (step.key.startsWith('_arrow')) {
                return <span key={step.key} className="text-slate-300 dark:text-slate-600 text-sm mx-1">›</span>;
              }
              const isActive = order.status === step.key;
              const isDone =
                (step.key === 'PENDING' && ['SENT_TO_HORUS','DISPATCHED'].includes(order.status)) ||
                (step.key === 'SENT_TO_HORUS' && order.status === 'DISPATCHED');
              return (
                <div key={step.key} className={`flex flex-col px-4 py-2 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700'
                    : isDone
                    ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-50'
                }`}>
                  <span className={`text-xs font-semibold ${
                    isActive ? 'text-violet-700 dark:text-violet-300' :
                    isDone  ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'
                  }`}>{step.label}</span>
                  {step.desc && (
                    <span className="text-[9px] text-slate-400 mt-0.5">{step.desc}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* Banner de alerta bloqueante — cancelado no Erdos após envio ao Hórus */}
      {order.erdos_alert && (
        <div className="flex items-start gap-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-300 dark:border-rose-700 rounded-2xl px-5 py-4">
          <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Ação requerida — Cancelamento no Hórus ERP</p>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
              Este pedido foi <strong>cancelado no Erdos</strong> após ter sido enviado ao Hórus.
              Você precisa cancelar manualmente os pedidos abaixo no Hórus ERP antes de qualquer outra ação.
            </p>
            {(order.horus_pedido_remessa || order.horus_pedido_venda) && (
              <div className="flex gap-3 mt-3 flex-wrap">
                {order.horus_pedido_remessa && (
                  <span className="px-3 py-1 bg-rose-100 dark:bg-rose-900/40 rounded-lg text-xs font-mono font-bold text-rose-700 dark:text-rose-300">
                    Remessa #{order.horus_pedido_remessa}
                  </span>
                )}
                {order.horus_pedido_venda && (
                  <span className="px-3 py-1 bg-rose-100 dark:bg-rose-900/40 rounded-lg text-xs font-mono font-bold text-rose-700 dark:text-rose-300">
                    Venda #{order.horus_pedido_venda}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Badge Erdos live status */}
      {order.erdos_status && (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400">Status Erdos:</span>
          <span className={`px-2 py-0.5 rounded-full font-semibold border ${
            order.erdos_status === 'cancelado'  ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800' :
            order.erdos_status === 'preparando' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' :
            order.erdos_status === 'postado'    ? 'bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800' :
            order.erdos_status === 'entregue'   ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' :
                                                  'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
          }`}>{order.erdos_status}</span>
          {checkingErdos && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
          {order.erdos_checked_at && !checkingErdos && (
            <span className="text-slate-300 dark:text-slate-600">verificado {formatDate(order.erdos_checked_at)}</span>
          )}
          <button
            onClick={handleCheckErdosStatus}
            disabled={checkingErdos}
            className="ml-1 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
            title="Verificar agora no Erdos"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-5">

          {/* Pedidos Hórus */}
          {(order.horus_pedido_remessa || order.horus_pedido_venda) && (
            <Section title="Pedidos Hórus ERP" icon={PackageCheck}>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4">
                  <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">REMESSA</p>
                  <p className="text-lg font-black text-blue-700 dark:text-blue-300 font-mono">
                    {order.horus_pedido_remessa ? `#${order.horus_pedido_remessa}` : '—'}
                  </p>
                  {order.horus_cod_cli_final && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-medium">
                      Cód. Cliente: <span className="font-mono font-bold">{order.horus_cod_cli_final}</span>
                    </p>
                  )}
                  <p className="text-[10px] text-blue-400 mt-0.5">Baixa estoque físico</p>
                </div>
                <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40 rounded-xl p-4">
                  <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider mb-1">VENDA</p>
                  <p className="text-lg font-black text-violet-700 dark:text-violet-300 font-mono">
                    {order.horus_pedido_venda ? `#${order.horus_pedido_venda}` : '—'}
                  </p>
                  <p className="text-[10px] text-violet-400 mt-1">Sem baixa de estoque</p>
                </div>
              </div>
            </Section>
          )}

          {/* Destinatário */}
          <Section title="Destinatário" icon={MapPin}>
            <div className="flex flex-col gap-1.5 text-sm">
              <p className="font-bold text-slate-900 dark:text-white text-base">{customer.nome || '—'}</p>
              {customer.cpf_cnpj && (
                <p className="text-xs text-slate-500">CPF/CNPJ: <span className="font-mono">{customer.cpf_cnpj}</span></p>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {[customer.endereco, customer.numero, customer.complemento].filter(Boolean).join(', ')}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {customer.bairro && <span>{customer.bairro} · </span>}
                <span className="font-medium">{customer.cidade}</span>
                {customer.uf && <span> — {customer.uf}</span>}
              </p>
              {customer.cep && <p className="text-xs text-slate-400">CEP: {customer.cep}</p>}
              {customer.email && <p className="text-xs text-slate-400">{customer.email}</p>}
              {customer.telefone && <p className="text-xs text-slate-400">{customer.telefone}</p>}
            </div>
          </Section>

          {/* Itens */}
          <Section title={`Itens (${items.length})`} icon={ShoppingCart}>
            <div className="space-y-3">
              {items.map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <Tag className="w-4 h-4 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.titulo || item.title || '—'}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">ISBN: {item.sku_fornecedor}</p>
                    {item.autor && <p className="text-xs text-slate-500">{item.autor}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-semibold">
                      Qtd: {item.quantidade}
                    </span>
                    {item.preco_unitario && (
                      <p className="text-xs text-slate-400 mt-1">
                        R$ {Number(item.preco_unitario).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Documentos */}
          <Section title="Documentos" icon={Download}>
            <div className="grid grid-cols-3 gap-3">
              {docs.map(doc => (
                <button
                  key={doc.type}
                  onClick={() => handleOpenDocument(doc.type)}
                  disabled={!doc.available}
                  className={`flex flex-col items-center gap-2 px-4 py-5 rounded-xl border text-sm font-semibold transition-all ${
                    doc.available
                      ? 'bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-700/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:shadow-md hover:-translate-y-0.5'
                      : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/30 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <doc.icon className={`w-6 h-6 ${doc.available ? 'text-violet-500' : 'text-slate-300'}`} />
                  <span className="text-xs">{doc.label}</span>
                  {!doc.available && <span className="text-[9px] opacity-50">Não disponível</span>}
                </button>
              ))}
            </div>
          </Section>
        </div>

        {/* Sidebar direita */}
        <div className="space-y-5">

          {/* Logística */}
          <Section title="Logística" icon={Truck}>
            <div className="space-y-2 text-sm">
              {logistics.forma_envio ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Forma de Envio</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{logistics.forma_envio}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Nenhuma informação de logística</p>
              )}
              {order.tracking_code && (
                <div className="mt-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Código de Rastreio</p>
                  <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">{order.tracking_code}</p>
                </div>
              )}
              {(order.horus_pedido_remessa || order.status === 'SENT_TO_HORUS') && (
                order.conference ? (
                  order.conference.status === 'COMPLETED' ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/logistics/conference?conf_id=${order.conference!.id}`)}
                      className="w-full flex items-center justify-center gap-2 mt-3 py-2.5 px-4 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-xl transition shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Conferência Concluída (Ver)
                    </button>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/logistics/conference?conf_id=${order.conference!.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-xl transition shadow-sm"
                      >
                        <ClipboardCheck className="w-4 h-4 text-amber-600" />
                        Conferência em Andamento
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteConference(order.conference!.id)}
                        disabled={deletingConf}
                        title="Excluir conferência em aberto e iniciar nova"
                        className="p-2.5 text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-xl transition shadow-sm disabled:opacity-50"
                      >
                        {deletingConf ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageX className="w-4 h-4" />}
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={openConferenceModal}
                    className="w-full flex items-center justify-center gap-2 mt-3 py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl transition shadow-sm"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    Conferir Pedido (Logística)
                  </button>
                )
              )}
            </div>
          </Section>

          {/* NF-e Erdos */}
          {fiscal.chave_nfe_erdos && (
            <Section title="NF-e Erdos (6.120)" icon={FileText}>
              <p className="font-mono text-[10px] text-slate-500 break-all leading-relaxed">{fiscal.chave_nfe_erdos}</p>
            </Section>
          )}

          {/* NF-e Remessa */}
          {order.nfe_remessa_key && (
            <Section title="NF-e Remessa (6.923)" icon={FileText}>
              <p className="font-mono text-[10px] text-slate-500 break-all leading-relaxed">{order.nfe_remessa_key}</p>
            </Section>
          )}

          {/* ID externo */}
          <Section title="Identificação" icon={Tag}>
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-slate-400 mb-0.5">ID Externo (Erdos)</p>
                <p className="font-mono text-slate-600 dark:text-slate-300 break-all">{order.external_order_id}</p>
              </div>
              {order.external_reference && (
                <div>
                  <p className="text-slate-400 mb-0.5">Referência</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{order.external_reference}</p>
                </div>
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section title="Histórico" icon={Clock}>
            <div className="space-y-3">
              {[
                { label: 'Sincronizado',      date: order.synced_at,       active: !!order.synced_at,       color: 'bg-violet-500' },
                { label: 'Enviado ao Hórus',  date: order.sent_to_horus_at, active: !!order.sent_to_horus_at, color: 'bg-blue-500' },
                { label: 'Despachado',        date: order.dispatched_at,    active: !!order.dispatched_at,    color: 'bg-emerald-500' },
              ].map((e, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${e.active ? e.color : 'bg-slate-300 dark:bg-slate-700'}`} />
                  <div>
                    <p className={`text-xs font-medium ${e.active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>{e.label}</p>
                    {e.date && <p className="text-[10px] text-slate-400">{formatDate(e.date)}</p>}
                  </div>
                </div>
              ))}
            </div>
            {/* Logs de eventos Erdos */}
            {order.logs && order.logs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Eventos de Integração</p>
                <div className="space-y-2.5">
                  {[...order.logs].reverse().map((log, i) => (
                    <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-xl ${
                      log.event.includes('CANCEL') || log.event.includes('CONFLICT')
                        ? 'bg-rose-50 dark:bg-rose-900/10'
                        : log.event.includes('INCONSISTENCY')
                        ? 'bg-amber-50 dark:bg-amber-900/10'
                        : 'bg-slate-50 dark:bg-slate-800/50'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        log.event.includes('CANCEL') || log.event.includes('CONFLICT') ? 'bg-rose-500' :
                        log.event.includes('INCONSISTENCY') ? 'bg-amber-500' :
                        log.event.includes('DELIVERED') || log.event.includes('TRACKING') ? 'bg-emerald-500' :
                        'bg-blue-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400">{log.event}</span>
                          <span className="text-[9px] text-slate-300 dark:text-slate-600">{formatDate(log.at)}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 break-words">{log.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Modal despacho */}
      {showDispatch && (
        <DispatchModal
          order={order}
          companyId={companyId}
          onClose={() => setShowDispatch(false)}
          onSuccess={fetchOrder}
        />
      )}

      {/* Modal de Inicialização da Conferência */}
      {showConfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Iniciar Conferência Hórus</h3>
              </div>
              <button
                onClick={() => setShowConfModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Filial do Seller *</label>
                {loadingBranches ? (
                  <div className="flex items-center gap-2 py-2 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando filiais...
                  </div>
                ) : (
                  <select
                    value={selectedBranchId}
                    onChange={e => setSelectedBranchId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-medium"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.nome} {b.cod_local ? `(Local: ${b.cod_local})` : ''} — Emp: {b.cod_empresa} / Fil: {b.cod_filial}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Código Cliente (Hórus)</label>
                <input
                  type="text"
                  value={confCodCli}
                  onChange={e => setConfCodCli(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Número Pedido Origem (Remessa)</label>
                <input
                  type="text"
                  value={confCodOrigem}
                  onChange={e => setConfCodOrigem(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowConfModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleStartConference}
                disabled={startingConf}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition flex items-center gap-1.5 shadow-sm"
              >
                {startingConf ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                Iniciar Conferência
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
