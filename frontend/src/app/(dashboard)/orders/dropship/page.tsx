'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PackageCheck, RefreshCw, ArrowUpFromLine, Loader2,
  FileText, Tag, ShoppingCart, CheckCircle2, Truck, X, MapPin, Download,
  AlertTriangle, Clock, Send, PackageX, Filter,
  Printer, Eye, Ban, CheckSquare, Square, ClipboardList, UserCheck, Calendar
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface DropshipOrder {
  id: number;
  company_id: number;
  config_id: number;
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
  tracking_code: string | null;
  nfe_remessa_key: string | null;
  label_path: string | null;
  danfe_path: string | null;
  xml_path: string | null;
  synced_at: string | null;
  sent_to_horus_at: string | null;
  dispatched_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  erdos_credential_id: number | null;
  erdos_credential_label: string | null;
  manifest_id: number | null;
  manifest_number: string | null;
  manifest_at: string | null;
}

interface ManifestData {
  id: number;
  company_id: number;
  manifest_number: string;
  carrier_name?: string | null;
  driver_name?: string | null;
  driver_document?: string | null;
  vehicle_plate?: string | null;
  notes?: string | null;
  total_orders: number;
  total_volumes: number;
  total_value: number;
  created_at: string;
  created_by_name?: string | null;
  orders: DropshipOrder[];
  company_name?: string | null;
  company_cnpj?: string | null;
  company_address?: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function CancelOrderModal({
  order,
  isOpen,
  onClose,
  onConfirm,
  loading,
}: {
  order: DropshipOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Cancelar Pedido</h3>
              <p className="text-xs text-slate-400">{order.external_reference || `#${order.id}`}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Esta ação marcará o pedido como <strong>Cancelado</strong> no sistema e notificará o Hub-Erdos.
            {order.status === 'SENT_TO_HORUS' && (
              <span className="block mt-1 font-semibold text-rose-600 dark:text-rose-400">
                Atenção: Este pedido já foi enviado ao Hórus. Cancele também os pedidos correspondentes no Hórus ERP.
              </span>
            )}
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Motivo / Justificativa do Cancelamento *
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Cliente solicitou cancelamento / Produto sem estoque físico..."
            rows={3}
            disabled={loading}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={loading || reason.trim().length < 3}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-md"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            Confirmar Cancelamento
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40', icon: Clock },
  SENT_TO_HORUS: { label: 'Enviado ao Hórus', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700/40', icon: Send },
  DISPATCHED: { label: 'Despachado', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/40', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-700/40', icon: PackageX },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

interface ConfirmDispatchModalProps {
  order: DropshipOrder;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ConfirmDispatchModal({ order, companyId, onClose, onSuccess }: ConfirmDispatchModalProps) {
  const [trackingCode, setTrackingCode] = useState('');
  const [nfeKey, setNfeKey] = useState('');
  const [sending, setSending] = useState(false);

  const handleConfirm = async () => {
    setSending(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${order.id}/confirm-dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_code: trackingCode || null, nfe_remessa_key: nfeKey || null }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Despacho confirmado com sucesso!');
        onSuccess();
        onClose();
      } else {
        toast.error(`Erro: ${data.detail || 'Erro ao confirmar despacho'}`);
      }
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Truck className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Confirmar Despacho</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Pedido: <strong className="text-slate-700 dark:text-slate-300">{order.external_reference || order.external_order_id}</strong>
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Código de Rastreamento (Correios)
            </label>
            <input
              type="text"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
              placeholder="Ex: BR123456789BR"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Chave NF-e de Remessa (6.923)
            </label>
            <input
              type="text"
              value={nfeKey}
              onChange={e => setNfeKey(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
              placeholder="35260631492667000182..."
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 rounded-xl transition-all disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirmar Despacho
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CreateManifestModal({
  selectedOrders,
  isOpen,
  onClose,
  onSuccess,
  companyId,
}: {
  selectedOrders: DropshipOrder[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (manifest: ManifestData) => void;
  companyId: string;
}) {
  const [carrier, setCarrier] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverDoc, setDriverDoc] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCarrier('');
      setDriverName('');
      setDriverDoc('');
      setVehiclePlate('');
      setNotes('');
    }
  }, [isOpen]);

  if (!isOpen || selectedOrders.length === 0) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/manifests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_ids: selectedOrders.map(o => o.id),
          carrier_name: carrier || null,
          driver_name: driverName || null,
          driver_document: driverDoc || null,
          vehicle_plate: vehiclePlate || null,
          notes: notes || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`✅ Minuta ${data.manifest_number} gerada com sucesso!`);
        onSuccess(data);
      } else {
        toast.error(`Erro: ${data.detail || 'Não foi possível gerar a minuta.'}`);
      }
    } catch {
      toast.error('Erro de conexão ao gerar minuta de coleta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Gerar Minuta de Despacho</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Termo de Coleta e Transferência de Custódia
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo da carga selecionada */}
        <div className="p-3.5 bg-violet-50/70 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">
              Pedidos despachados selecionados:
            </span>
          </div>
          <span className="font-bold text-violet-700 dark:text-violet-300 text-sm">
            {selectedOrders.length} pedido(s)
          </span>
        </div>

        {/* Formulário de Identificação do Coletor */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Transportadora
              </label>
              <input
                type="text"
                value={carrier}
                onChange={e => setCarrier(e.target.value)}
                placeholder="Ex: Correios, Jadlog, Própria..."
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Placa do Veículo
              </label>
              <input
                type="text"
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="Ex: ABC-1D23"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 uppercase font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome do Motorista / Coletor
              </label>
              <input
                type="text"
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
                placeholder="Nome completo de quem retira"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                RG / CPF do Motorista
              </label>
              <input
                type="text"
                value={driverDoc}
                onChange={e => setDriverDoc(e.target.value)}
                placeholder="Documento para conferência"
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações da Coleta (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Coleta programada das 16:30 / 2 caixas grandes..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Gerar e Visualizar Minuta
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PrintManifestModal({
  manifest,
  isOpen,
  onClose,
}: {
  manifest: ManifestData | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen || !manifest) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      {/* Botões de Ação Flutuantes na tela (não aparecem na impressão) */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
        >
          <Printer className="w-4 h-4" />
          Imprimir Minuta (A4)
        </button>
        <button
          onClick={onClose}
          className="p-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Conteúdo Imprimível A4 */}
      <div
        id="printable-manifest"
        className="bg-white text-black w-full max-w-4xl p-8 rounded-2xl shadow-2xl my-8 print:my-0 print:p-4 print:max-w-none print:w-full print:shadow-none print:rounded-none font-sans"
      >
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-manifest, #printable-manifest * {
              visibility: visible;
            }
            #printable-manifest {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              margin: 0;
              padding: 15mm;
              font-size: 11px;
            }
          }
        `}</style>

        {/* Cabeçalho da Minuta */}
        <div className="border-b-2 border-slate-800 pb-4 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">
                Minuta de Despacho & Romaneio de Coleta
              </h1>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                {manifest.company_name || 'Empresa Remetente'}
              </p>
              {manifest.company_cnpj && (
                <p className="text-[11px] text-slate-500">
                  CNPJ: {manifest.company_cnpj}
                </p>
              )}
              {manifest.company_address && (
                <p className="text-[10px] text-slate-400">
                  {manifest.company_address}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="inline-block border-2 border-slate-800 px-3 py-1.5 rounded-lg bg-slate-50">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Número da Minuta</span>
                <span className="text-base font-black font-mono text-slate-900">{manifest.manifest_number}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Data/Hora: {new Date(manifest.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </p>
            </div>
          </div>
        </div>

        {/* Dados da Transportadora e Motorista */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs mb-4">
          <div>
            <span className="block text-[9px] uppercase font-bold text-slate-500">Transportadora:</span>
            <span className="font-semibold text-slate-900">{manifest.carrier_name || 'Não informada'}</span>
          </div>
          <div>
            <span className="block text-[9px] uppercase font-bold text-slate-500">Motorista / Coletor:</span>
            <span className="font-semibold text-slate-900">{manifest.driver_name || '______________________'}</span>
          </div>
          <div>
            <span className="block text-[9px] uppercase font-bold text-slate-500">RG / CPF:</span>
            <span className="font-semibold text-slate-900">{manifest.driver_document || '______________________'}</span>
          </div>
          <div>
            <span className="block text-[9px] uppercase font-bold text-slate-500">Placa Veículo:</span>
            <span className="font-semibold font-mono text-slate-900">{manifest.vehicle_plate || '________'}</span>
          </div>
        </div>

        {manifest.notes && (
          <div className="text-[10px] text-slate-600 bg-amber-50/60 border border-amber-200 p-2 rounded mb-3">
            <strong>Observações:</strong> {manifest.notes}
          </div>
        )}

        {/* Tabela de Pedidos / Pacotes */}
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-[10px] border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                <th className="border border-slate-300 p-1.5 text-center w-8">#</th>
                <th className="border border-slate-300 p-1.5 text-left">Pedido / Ref. Hub</th>
                <th className="border border-slate-300 p-1.5 text-left">Ped. Hórus</th>
                <th className="border border-slate-300 p-1.5 text-left">NF-e Remessa / Rastreio</th>
                <th className="border border-slate-300 p-1.5 text-left">Destinatário Final</th>
                <th className="border border-slate-300 p-1.5 text-center">Cidade/UF</th>
                <th className="border border-slate-300 p-1.5 text-center w-12">Vol.</th>
                <th className="border border-slate-300 p-1.5 text-right">Valor R$</th>
                <th className="border border-slate-300 p-1.5 text-center">Token / Canal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {manifest.orders.map((o, idx) => {
                const customer = o.customer_data || {};
                const items = o.items_data || [];
                const vol = items.reduce((acc: number, it: any) => acc + (parseInt(it.quantidade) || 1), 0) || 1;
                const val = items.reduce((acc: number, it: any) => acc + ((parseInt(it.quantidade) || 1) * (parseFloat(it.preco_unitario || it.preco || 0) || 0)), 0);

                return (
                  <tr key={o.id} className={idx % 2 === 1 ? 'bg-slate-50/50' : ''}>
                    <td className="border border-slate-300 p-1.5 text-center font-mono font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-300 p-1.5">
                      <span className="font-bold text-slate-900">{o.external_reference || `#${o.id}`}</span>
                      <span className="block text-[8px] text-slate-400 font-mono">{o.external_order_id.substring(0, 14)}…</span>
                    </td>
                    <td className="border border-slate-300 p-1.5 font-mono">
                      {o.horus_pedido_remessa ? `#${o.horus_pedido_remessa}` : '—'}
                    </td>
                    <td className="border border-slate-300 p-1.5">
                      {o.tracking_code && <span className="font-mono font-semibold block">{o.tracking_code}</span>}
                      {o.nfe_remessa_key && (
                        <span className="text-[8px] font-mono text-slate-500 block truncate max-w-[140px]" title={o.nfe_remessa_key}>
                          {o.nfe_remessa_key.substring(0, 25)}…
                        </span>
                      )}
                      {!o.tracking_code && !o.nfe_remessa_key && <span className="text-slate-400">—</span>}
                    </td>
                    <td className="border border-slate-300 p-1.5">
                      <span className="font-semibold text-slate-900 block truncate max-w-[150px]">{customer.nome || '—'}</span>
                      {customer.cpf_cnpj && <span className="text-[8px] text-slate-500 block">{customer.cpf_cnpj}</span>}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-center">
                      {[customer.cidade, customer.uf].filter(Boolean).join('/') || '—'}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-center font-bold">
                      {vol}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono font-semibold">
                      {val > 0 ? val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-center">
                      <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-slate-100 text-slate-700">
                        {o.erdos_credential_label || 'Padrão'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totalizadores Consolidados */}
        <div className="flex items-center justify-between p-3 bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold mb-6">
          <div className="flex items-center gap-6">
            <span>
              TOTAL DE PEDIDOS: <span className="text-sm font-black text-slate-900 ml-1">{manifest.total_orders}</span>
            </span>
            <span>
              TOTAL DE VOLUMES: <span className="text-sm font-black text-slate-900 ml-1">{manifest.total_volumes}</span>
            </span>
          </div>
          <div>
            VALOR TOTAL DECLARADO: <span className="text-sm font-black text-slate-900 ml-1">
              {manifest.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        </div>

        {/* Termo de Custódia e Declaração de Coleta */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-600 mb-8 leading-relaxed">
          <p className="font-bold text-slate-800 uppercase mb-1">Declaração de Recebimento e Transferência de Custódia:</p>
          <p>
            Declaro para os devidos fins que recebi da empresa remetente identificada nesta minuta os volumes devidamente lacrados,
            acondicionados e sem avarias externas aparentes, acompanhados de suas respectivas notas fiscais / etiquetas de postagem,
            assumindo a responsabilidade pela guarda, transporte e entrega aos destinatários finais relacionados.
          </p>
        </div>

        {/* Canhoto Duplo de Assinaturas */}
        <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-300">
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 pb-8"></div>
            <p className="text-xs font-bold text-slate-900 uppercase">Expedição / Remetente</p>
            <p className="text-[9px] text-slate-500">
              {manifest.created_by_name || 'Conferente Responsável'}
            </p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 pb-8"></div>
            <p className="text-xs font-bold text-slate-900 uppercase">Motorista / Coletor Transportadora</p>
            <p className="text-[9px] text-slate-500">
              Nome: {manifest.driver_name || '__________________________'} · Doc: {manifest.driver_document || '________________'}
            </p>
          </div>
        </div>

        {/* Rodapé das Vias */}
        <div className="flex items-center justify-between text-[8px] text-slate-400 mt-6 pt-2 border-t border-slate-200">
          <span>Sistema Cronuz B2B · Módulo Dropshipping</span>
          <span className="font-semibold uppercase">
            1ª Via: Expedição Remetente (Comprovante) &nbsp;|&nbsp; 2ª Via: Transportador (Controle de Carga)
          </span>
        </div>
      </div>
    </div>
  );
}

interface OrderDetailDrawerProps {
  order: DropshipOrder;
  companyId: string;
  onClose: () => void;
  onSendToHorus: () => void;
  onConfirmDispatch: () => void;
  sendingToHorus: boolean;
}

function OrderDetailDrawer({ order, companyId, onClose, onSendToHorus, onConfirmDispatch, sendingToHorus }: OrderDetailDrawerProps) {
  const customer = order.customer_data || {};
  const items = order.items_data || [];
  const logistics = order.logistics_data || {};
  const fiscal = order.fiscal_data || {};

  const handleDownload = async (docType: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/${order.id}/documents/${docType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.url, '_blank');
      } else {
        const err = await res.json();
        toast.error(err.detail || `Documento ${docType} não disponível`);
      }
    } catch {
      toast.error('Erro ao obter documento');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-violet-600/5 to-purple-600/5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {order.external_reference || order.external_order_id}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <span className="text-xs text-slate-400">{order.channel}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Pedidos Hórus */}
          {(order.horus_pedido_remessa || order.horus_pedido_venda) && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Pedidos Hórus Gerados</p>
              {order.horus_pedido_remessa && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-600 dark:text-blue-400">Remessa (6.923):</span>
                  <span className="text-xs font-mono font-bold text-blue-800 dark:text-blue-200">#{order.horus_pedido_remessa}</span>
                </div>
              )}
              {order.horus_pedido_venda && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-blue-600 dark:text-blue-400">Venda (6.118):</span>
                  <span className="text-xs font-mono font-bold text-blue-800 dark:text-blue-200">#{order.horus_pedido_venda}</span>
                </div>
              )}
            </div>
          )}

          {/* Cliente Final */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> Destinatário
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-1.5 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white">{customer.nome || '—'}</p>
              {customer.cpf_cnpj && <p className="text-slate-500">CPF/CNPJ: {customer.cpf_cnpj}</p>}
              <p className="text-slate-600 dark:text-slate-300">
                {[customer.endereco, customer.numero, customer.complemento].filter(Boolean).join(', ')}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {[customer.bairro, customer.cidade, customer.uf].filter(Boolean).join(' · ')}
              </p>
              {customer.cep && <p className="text-slate-500">CEP: {customer.cep}</p>}
            </div>
          </div>

          {/* Itens */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <ShoppingCart className="w-3.5 h-3.5" /> Itens ({items.length})
            </h3>
            <div className="space-y-2">
              {items.map((item: any, i: number) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <Tag className="w-3.5 h-3.5 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.titulo || item.title || '—'}</p>
                    <p className="text-[10px] text-slate-400 font-mono">ISBN: {item.sku_fornecedor}</p>
                    <p className="text-[10px] text-slate-500">Qtd: {item.quantidade}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Logística */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5" /> Logística
            </h3>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-xs space-y-1.5">
              {logistics.forma_envio && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Forma de Envio</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{logistics.forma_envio}</span>
                </div>
              )}
              {order.tracking_code && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Rastreamento</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{order.tracking_code}</span>
                </div>
              )}
            </div>
          </div>

          {/* NF-e */}
          {fiscal.chave_nfe_erdos && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> NF-e Erdos (6.120)
              </h3>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-xs">
                <p className="font-mono text-[10px] text-slate-500 break-all">{fiscal.chave_nfe_erdos}</p>
              </div>
            </div>
          )}

          {/* Downloads */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Download className="w-3.5 h-3.5" /> Documentos
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'xml', label: 'XML NF-e', icon: FileText, available: !!order.xml_path },
                { type: 'danfe', label: 'DANFE', icon: Printer, available: !!order.danfe_path },
                { type: 'etiqueta', label: 'Etiqueta', icon: Tag, available: !!order.label_path },
              ].map(doc => (
                <button
                  key={doc.type}
                  onClick={() => handleDownload(doc.type)}
                  disabled={!doc.available}
                  className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border text-xs font-medium transition-all ${
                    doc.available
                      ? 'bg-violet-50 dark:bg-violet-900/10 border-violet-200 dark:border-violet-700/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/20'
                      : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/30 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <doc.icon className="w-4 h-4" />
                  {doc.label}
                  {!doc.available && <span className="text-[9px] opacity-60">Indisponível</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Histórico</h3>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Sincronizado', date: order.synced_at },
                { label: 'Enviado ao Hórus', date: order.sent_to_horus_at },
                { label: 'Despachado', date: order.dispatched_at },
              ].filter(e => e.date).map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  <span>{e.label}:</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatDate(e.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {order.status === 'PENDING' && (
            <button
              onClick={onSendToHorus}
              disabled={sendingToHorus}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
            >
              {sendingToHorus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar para o Hórus
            </button>
          )}
          {order.status === 'SENT_TO_HORUS' && (
            <button
              onClick={onConfirmDispatch}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-sm font-semibold rounded-xl transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Despacho
            </button>
          )}
          {order.status === 'DISPATCHED' && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Pedido Concluído
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function DropshipOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<DropshipOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pushingStock, setPushingStock] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [cancelModalOrder, setCancelModalOrder] = useState<DropshipOrder | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);

  // Inicializa período com os últimos 30 dias (máximo permitido: 90 dias)
  const [dateStart, setDateStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateEnd, setDateEnd] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Paginação
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Minuta ativa para visualização/reimpressão
  const [activeManifest, setActiveManifest] = useState<ManifestData | null>(null);
  const [isPrintManifestOpen, setIsPrintManifestOpen] = useState(false);

  // Get company ID from auth
  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCompanyId(String(payload.company_id || ''));
      } catch { /* ignore */ }
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const url = statusFilter
        ? `${API_URL}/dropship/orders/${companyId}?status=${statusFilter}`
        : `${API_URL}/dropship/orders/${companyId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => {
    if (companyId) fetchOrders();
  }, [fetchOrders]);

  const handleOpenExistingManifest = async (manifestId: number) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/manifests/${manifestId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActiveManifest(data);
        setIsPrintManifestOpen(true);
      } else {
        toast.error('Não foi possível carregar a minuta.');
      }
    } catch {
      toast.error('Erro de conexão ao carregar minuta.');
    }
  };

  const handleConfirmCancel = async (reason: string) => {
    if (!companyId || !cancelModalOrder) return;
    setCancellingOrder(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/dropship/orders/${companyId}/${cancelModalOrder.id}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(`Pedido #${cancelModalOrder.external_reference || cancelModalOrder.id} cancelado com sucesso.`);
        setCancelModalOrder(null);
        fetchOrders();
      } else {
        toast.error(`Erro ao cancelar: ${data.detail || 'Não foi possível cancelar o pedido.'}`);
      }
    } catch {
      toast.error('Erro de conexão ao cancelar o pedido.');
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleSync = async () => {
    if (!companyId) return;
    setSyncing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/orders/${companyId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        // Toast principal
        if (data.synced === 0) {
          toast.success('Sincronizado! Nenhum pedido novo encontrado.');
        } else {
          toast.success(`Sincronizado! ${data.synced} novo(s) pedido(s) importado(s).`);
        }
        // Breakdown por credencial — toasts secundários
        if (data.by_credential && data.by_credential.length > 1) {
          data.by_credential.forEach((c: { label: string; hub_total: number; synced: number }) => {
            toast.info(`${c.label}: ${c.hub_total} no Hub · ${c.synced} novos`, {
              duration: 6000,
            });
          });
        }
        fetchOrders();
      } else {
        toast.error(`Erro: ${data.detail}`);
      }
    } catch {
      toast.error('Erro ao sincronizar pedidos.');
    } finally {
      setSyncing(false);
    }
  };

  const handlePushStock = async () => {
    if (!companyId) return;
    setPushingStock(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/stock/${companyId}/push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Estoque enviado! ${data.skus_sent} SKU(s) atualizados no Hub-Erdos.`);
      } else {
        toast.error(`Erro: ${data.detail}`);
      }
    } catch {
      toast.error('Erro ao enviar estoque.');
    } finally {
      setPushingStock(false);
    }
  };

  const pendingCount = orders.filter(o => o.status === 'PENDING').length;
  const sentCount = orders.filter(o => o.status === 'SENT_TO_HORUS').length;
  const dispatchedCount = orders.filter(o => o.status === 'DISPATCHED').length;

  // Validação de intervalo de datas (máximo 90 dias)
  const handleDateChange = (newStart: string, newEnd: string) => {
    if (newStart && newEnd) {
      const d1 = new Date(newStart);
      const d2 = new Date(newEnd);
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        toast.error('A data inicial não pode ser posterior à data final.');
        return;
      }
      if (diffDays > 90) {
        toast.error('O período selecionado não pode ser superior a 90 dias.');
        return;
      }
    }
    setDateStart(newStart);
    setDateEnd(newEnd);
    setCurrentPage(1);
  };

  // Filtragem por status e período
  const filteredOrders = orders.filter(order => {
    if (statusFilter && order.status !== statusFilter) return false;

    if (dateStart) {
      const orderDate = order.dispatched_at || order.released_at || order.created_at;
      if (orderDate && new Date(orderDate) < new Date(`${dateStart}T00:00:00`)) return false;
    }
    if (dateEnd) {
      const orderDate = order.dispatched_at || order.released_at || order.created_at;
      if (orderDate && new Date(orderDate) > new Date(`${dateEnd}T23:59:59`)) return false;
    }

    return true;
  });

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
              <PackageCheck className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pedidos Dropship</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 ml-12">
            Hub Horus B2B
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePushStock}
            disabled={pushingStock || !companyId}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition-all disabled:opacity-60"
          >
            {pushingStock ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
            Enviar Estoque
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !companyId}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar Pedidos
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: orders.length, color: 'from-slate-500 to-slate-600' },
          { label: 'Pendentes', value: pendingCount, color: 'from-amber-500 to-orange-500' },
          { label: 'No Hórus', value: sentCount, color: 'from-blue-500 to-indigo-500' },
          { label: 'Despachados', value: dispatchedCount, color: 'from-emerald-500 to-green-500' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4"
          >
            <div className={`text-2xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
              {stat.value}
            </div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filtros Limpos e Organizados */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 mr-1" />
          {['', 'PENDING', 'SENT_TO_HORUS', 'DISPATCHED', 'CANCELLED'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === s
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {s === '' ? 'Todos' : (STATUS_CONFIG[s]?.label || s)}
            </button>
          ))}
        </div>

        {/* Filtro de Período (Últimos 30 dias por padrão / Limite máximo de 90 dias) */}
        <div className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 px-3 py-1.5 rounded-xl">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Período:</span>
          <input
            type="date"
            value={dateStart}
            onChange={e => handleDateChange(e.target.value, dateEnd)}
            className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
            title="Data Inicial"
          />
          <span className="text-slate-400">até</span>
          <input
            type="date"
            value={dateEnd}
            onChange={e => handleDateChange(dateStart, e.target.value)}
            className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
            title="Data Final"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <PackageCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhum pedido Dropship encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Tente ajustar o período ou o status selecionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                  {['Referência', 'Canal', 'Cliente', 'Itens', 'Status', 'Ped. Remessa', 'Data', 'Docs', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedOrders.map((order, i) => {
                  const customer = order.customer_data || {};
                  const items = order.items_data || [];
                  const logistics = order.logistics_data || {};

                  return (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-violet-50/30 dark:hover:bg-violet-900/5 transition-colors cursor-pointer"
                      onClick={() => router.push(`/orders/dropship/${order.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white text-xs">
                          {order.external_reference || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
                          {order.external_order_id.substring(0, 12)}…
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 capitalize">{order.channel || '—'}</td>
                      <td className="px-4 py-3">
                         <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                           {(order.customer_data || {}).nome || '—'}
                         </div>
                         <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                           {[
                             (order.customer_data || {}).cidade,
                             (order.customer_data || {}).uf
                           ].filter(Boolean).join(' - ')}
                         </div>
                         {order.erdos_credential_label && (
                           <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700/40">
                             {order.erdos_credential_label}
                           </span>
                         )}
                         <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                           {[
                             (order.customer_data || {}).endereco,
                             (order.customer_data || {}).numero,
                             (order.customer_data || {}).bairro,
                             (order.customer_data || {}).cep,
                           ].filter(Boolean).join(', ')}
                         </div>
                       </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full text-xs font-semibold">
                          <ShoppingCart className="w-3 h-3" />
                          {(order.items_data || []).length}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} />

                        {/* Badge de Minuta de Coleta (se houver) */}
                        {order.manifest_number && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (order.manifest_id) handleOpenExistingManifest(order.manifest_id);
                            }}
                            title="Ver / Re-imprimir Minuta de Coleta"
                            className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                          >
                            <ClipboardList className="w-2.5 h-2.5 text-violet-500" />
                            {order.manifest_number}
                          </button>
                        )}

                        {order.status === 'CANCELLED' && order.cancel_reason && (
                          <span
                            className="block text-[10px] text-rose-500 font-medium truncate max-w-[130px] mt-0.5"
                            title={`Motivo: ${order.cancel_reason}`}
                          >
                            {order.cancel_reason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                        {order.horus_pedido_remessa ? `#${order.horus_pedido_remessa}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {order.released_at ? new Date(order.released_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      {/* Ícones de documentos disponíveis */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {order.xml_path && (
                            <span title="XML NF-e disponível" className="w-5 h-5 flex items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                              <FileText className="w-3 h-3" />
                            </span>
                          )}
                          {order.danfe_path && (
                            <span title="DANFE disponível" className="w-5 h-5 flex items-center justify-center rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                              <Printer className="w-3 h-3" />
                            </span>
                          )}
                          {order.label_path && (
                            <span title="Etiqueta disponível" className="w-5 h-5 flex items-center justify-center rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                              <Tag className="w-3 h-3" />
                            </span>
                          )}
                          {!order.xml_path && !order.danfe_path && !order.label_path && (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {order.status !== 'CANCELLED' && order.status !== 'DISPATCHED' && (
                            <button
                              title="Cancelar Pedido"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelModalOrder(order);
                              }}
                              className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            title="Ver Detalhes"
                            onClick={(e) => { e.stopPropagation(); router.push(`/orders/dropship/${order.id}`); }}
                            className="p-1.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-600 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-500">
            <div>
              Mostrando <strong className="text-slate-700 dark:text-slate-300">{(currentPage - 1) * pageSize + 1}</strong> a{' '}
              <strong className="text-slate-700 dark:text-slate-300">{Math.min(currentPage * pageSize, filteredOrders.length)}</strong> de{' '}
              <strong className="text-slate-700 dark:text-slate-300">{filteredOrders.length}</strong> pedidos
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-all"
              >
                Anterior
              </button>
              <span className="px-2 font-medium">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-all"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Cancelamento de Pedido */}
      <CancelOrderModal
        order={cancelModalOrder}
        isOpen={!!cancelModalOrder}
        onClose={() => setCancelModalOrder(null)}
        onConfirm={handleConfirmCancel}
        loading={cancellingOrder}
      />

      {/* Modal de Impressão A4 da Minuta (se aberto pelo badge) */}
      <PrintManifestModal
        manifest={activeManifest}
        isOpen={isPrintManifestOpen}
        onClose={() => setIsPrintManifestOpen(false)}
      />
    </div>
  );
}
