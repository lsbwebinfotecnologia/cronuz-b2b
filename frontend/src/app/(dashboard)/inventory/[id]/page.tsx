'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Boxes, 
  ArrowLeft, 
  Download, 
  ScanBarcode, 
  Lock, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Users, 
  Upload, 
  Loader2, 
  FileSpreadsheet,
  RefreshCw,
  Search,
  Filter,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Pencil,
  Edit3,
  Ban,
  Sliders,
  MapPin
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

interface InventoryDetail {
  id: number;
  company_id: number;
  code: string;
  name: string;
  status: 'EM_ANDAMENTO' | 'AUDITANDO' | 'FINALIZADO' | 'CANCELADO';
  description?: string;
  supervisor_pin?: string;
  total_expected_skus: number;
  total_scanned_items: number;
  total_sessions: number;
  open_sessions: number;
  access_token?: string;
  is_public_access_enabled?: boolean;
  created_at: string;
  finalized_at?: string;
}

interface SessionItem {
  id: number;
  location: string;
  session_type: string;
  round_number: number;
  status: string;
  total_scans: number;
  started_at: string;
  closed_at?: string;
  operator_name: string;
}

interface DiscrepancyItem {
  isbn: string;
  title: string;
  publisher?: string;
  category?: string;
  default_location?: string;
  location: string;
  count_1_qty: number;
  count_2_qty: number;
  difference: number;
  has_divergence: boolean;
  validated_qty: number;
  operator_name?: string;
}

interface SkuSummaryItem {
  isbn: string;
  title: string;
  publisher?: string;
  category?: string;
  default_location?: string;
  locations_list: string[];
  total_count_1: number;
  total_count_2: number;
  total_validated_qty: number;
  has_divergence: boolean;
}

export default function InventoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const inventoryId = params.id as string;
  const user = getUser();
  const companyId = user?.company_id;

  const [inventory, setInventory] = useState<InventoryDetail | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [skuSummaries, setSkuSummaries] = useState<SkuSummaryItem[]>([]);
  const [auditSubTab, setAuditSubTab] = useState<'sku_summary' | 'location_detail'>('sku_summary');
  const [activeTab, setActiveTab] = useState<'sessions' | 'discrepancies' | 'upload'>('sessions');
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [regeneratingToken, setRegeneratingToken] = useState(false);

  // Modal de Status / Cancelamento com Senha de Usuário Seller
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'EM_ANDAMENTO' | 'AUDITANDO' | 'FINALIZADO' | 'CANCELADO'>('EM_ANDAMENTO');
  const [sellerPassword, setSellerPassword] = useState('');
  const [submittingStatusChange, setSubmittingStatusChange] = useState(false);

  // Upload adicional
  const [extraFile, setExtraFile] = useState<File | null>(null);
  const [uploadingExtra, setUploadingExtra] = useState(false);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyDivergent, setOnlyDivergent] = useState(false);

  // Modais de Manutenção na Auditoria
  const [adjustItem, setAdjustItem] = useState<{
    location: string;
    isbn: string;
    title: string;
    round_number: number;
    current_qty: number;
  } | null>(null);
  const [adjustPin, setAdjustPin] = useState('');
  const [adjustNewQty, setAdjustNewQty] = useState<number>(0);
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  const [editProductItem, setEditProductItem] = useState<{
    isbn: string;
    title: string;
    publisher: string;
  } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPublisher, setEditPublisher] = useState('');
  const [submittingProductEdit, setSubmittingProductEdit] = useState(false);

  function handleCopyLink(url: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
    setCopiedLink(true);
    toast.success('Link do operador copiado com sucesso!');
    setTimeout(() => setCopiedLink(false), 2500);
  }

  async function handleRegenerateToken() {
    if (!companyId || !inventoryId) return;
    if (!window.confirm('Deseja realmente gerar um novo link de acesso? O link anterior deixará de funcionar imediatamente.')) {
      return;
    }
    setRegeneratingToken(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/regenerate-token`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao gerar novo link.');
      }
      const data = await res.json();
      setInventory(prev => prev ? { ...prev, access_token: data.access_token } : null);
      toast.success('Novo link gerado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao regenerar link.');
    } finally {
      setRegeneratingToken(false);
    }
  }

  async function loadData() {
    if (!companyId || !inventoryId) return;
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const [invRes, sessRes, divRes, skuRes] = await Promise.all([
        fetch(`${baseUrl}/companies/${companyId}/inventory/${inventoryId}`, { headers }),
        fetch(`${baseUrl}/companies/${companyId}/inventory/${inventoryId}/sessions-list`, { headers }),
        fetch(`${baseUrl}/companies/${companyId}/inventory/${inventoryId}/discrepancies`, { headers }),
        fetch(`${baseUrl}/companies/${companyId}/inventory/${inventoryId}/sku-summary`, { headers }),
      ]);

      if (invRes.ok) setInventory(await invRes.json());
      if (sessRes.ok) setSessions(await sessRes.json());
      if (divRes.ok) setDiscrepancies(await divRes.json());
      if (skuRes.ok) setSkuSummaries(await skuRes.json());
    } catch (err) {
      toast.error('Erro ao carregar dados do inventário.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [companyId, inventoryId]);

  async function handleUpdateStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !inventoryId) return;
    if (!sellerPassword.trim()) {
      toast.error('Digite a sua senha de usuário logado para confirmar.');
      return;
    }
    setSubmittingStatusChange(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            status: targetStatus,
            password: sellerPassword.trim()
          })
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao alterar status.');
      }

      const data = await res.json();
      toast.success(data.message || 'Status do inventário alterado com sucesso!');
      setShowStatusModal(false);
      setSellerPassword('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao alterar status.');
    } finally {
      setSubmittingStatusChange(false);
    }
  }

  async function handleFinalize() {
    if (!companyId || !inventoryId) return;
    setFinalizing(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/finalize`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao finalizar inventário.');
      }

      toast.success('Inventário finalizado com sucesso! Trava de segurança ativada.');
      setShowFinalizeModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao finalizar inventário.');
    } finally {
      setFinalizing(false);
    }
  }

  async function handleAdjustQuantity(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustItem || !companyId || !inventoryId) return;
    if (!adjustPin.trim()) {
      toast.error('Digite a senha do supervisor.');
      return;
    }
    setSubmittingAdjust(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/audit-adjust`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            pin: adjustPin.trim(),
            location: adjustItem.location,
            isbn: adjustItem.isbn,
            round_number: adjustItem.round_number,
            new_quantity: adjustNewQty
          })
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao ajustar quantidade.');
      }

      const data = await res.json();
      toast.success(data.message || 'Quantidade ajustada com sucesso!');
      setAdjustItem(null);
      setAdjustPin('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao ajustar quantidade.');
    } finally {
      setSubmittingAdjust(false);
    }
  }

  async function handleUpdateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editProductItem || !companyId || !inventoryId) return;
    setSubmittingProductEdit(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/items/${editProductItem.isbn}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: editTitle.trim(),
            publisher: editPublisher.trim()
          })
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao atualizar produto.');
      }

      const data = await res.json();
      toast.success(data.message || 'Produto atualizado com sucesso!');
      setEditProductItem(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao atualizar produto.');
    } finally {
      setSubmittingProductEdit(false);
    }
  }

  async function handleExportExcel() {
    if (!companyId || !inventoryId) return;
    setExportingExcel(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/export-excel`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!res.ok) throw new Error('Erro ao gerar planilha.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Relatorio_Inventario_${inventory?.code || inventoryId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Relatório Excel baixado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao exportar relatório.');
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleUploadExtra(e: React.FormEvent) {
    e.preventDefault();
    if (!extraFile || !companyId || !inventoryId) return;
    setUploadingExtra(true);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', extraFile);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/upload-sheet`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro no upload.');
      }

      const data = await res.json();
      toast.success(data.message || 'Itens adicionados com sucesso!');
      setExtraFile(null);
      loadData();
      setActiveTab('sessions');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar planilha.');
    } finally {
      setUploadingExtra(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm text-slate-500">Carregando painel do inventário...</p>
      </div>
    );
  }

  if (!inventory) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Inventário não encontrado.</p>
        <Link href="/inventory" className="text-teal-600 underline text-sm mt-2 inline-block">
          Voltar para listagem
        </Link>
      </div>
    );
  }

  const isEmAndamento = inventory.status === 'EM_ANDAMENTO';
  const totalDivergences = discrepancies.filter(d => d.has_divergence).length;

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Voltar */}
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para todos os inventários
      </Link>

      {/* Header Principal */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-md">
              {inventory.code}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              inventory.status === 'EM_ANDAMENTO' 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : inventory.status === 'AUDITANDO'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                : inventory.status === 'CANCELADO'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
            }`}>
              {inventory.status === 'EM_ANDAMENTO' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              {inventory.status === 'EM_ANDAMENTO' ? 'Em Andamento' : inventory.status === 'AUDITANDO' ? 'Auditando' : inventory.status === 'CANCELADO' ? 'Cancelado' : 'Finalizado'}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20" title="Senha de Supervisor para manutenções na contagem">
              <ShieldCheck className="h-3.5 w-3.5" />
              PIN Supervisor: {inventory.supervisor_pin || '1234'}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {inventory.name}
          </h1>

          {inventory.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              {inventory.description}
            </p>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadData}
            title="Recarregar dados"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            {exportingExcel ? <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> : <Download className="h-4 w-4 text-teal-600" />}
            Exportar Excel
          </button>

          <button
            onClick={() => {
              setTargetStatus(inventory.status);
              setSellerPassword('');
              setShowStatusModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold shadow-sm transition-colors"
          >
            <Sliders className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Alterar Status / Cancelar
          </button>

          {isEmAndamento ? (
            <>
              {inventory.access_token && (
                <button
                  onClick={() => setShowShareModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 text-sm font-semibold shadow-sm transition-colors"
                >
                  <QrCode className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Link & QR Code Mobile
                </button>
              )}

              <Link
                href={`/inventory/${inventory.id}/count`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-sm transition-colors"
              >
                <ScanBarcode className="h-4 w-4" />
                Iniciar Bipagem / Contagem
              </Link>
            </>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-semibold border border-slate-200 dark:border-slate-700">
              <Lock className="h-3.5 w-3.5" />
              Contagem Bloqueada ({inventory.status})
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">SKUs na Base</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {inventory.total_expected_skus.toLocaleString('pt-BR')}
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-teal-100 dark:border-teal-500/20 bg-teal-50/40 dark:bg-teal-950/20 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">Total Bipado</span>
          <p className="text-2xl font-bold text-teal-900 dark:text-teal-200 mt-1">
            {inventory.total_scanned_items.toLocaleString('pt-BR')}
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sessões / Prateleiras</span>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {inventory.total_sessions}{' '}
            <span className="text-xs font-normal text-slate-400">({inventory.open_sessions} ativas)</span>
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-amber-100 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Divergências</span>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-200 mt-1">
            {totalDivergences}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'sessions'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          Sessões e Prateleiras ({sessions.length})
        </button>

        <button
          onClick={() => setActiveTab('discrepancies')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'discrepancies'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Auditoria & Divergências ({totalDivergences})
        </button>

        {isEmAndamento && (
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="h-4 w-4" />
            Carga de Produtos
          </button>
        )}
      </div>

      {/* Conteúdo da Tab 1: Sessões */}
      {activeTab === 'sessions' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Histórico de Sessões por Prateleira
            </h3>
            <span className="text-xs text-slate-400">Total de {sessions.length} sessões registradas</span>
          </div>

          {sessions.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              Nenhuma prateleira contada ainda. Clique em "Iniciar Bipagem" para abrir a primeira sessão.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Localização / Prateleira</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Rodada</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Operador</th>
                    <th className="px-4 py-3">Total Bipado</th>
                    <th className="px-4 py-3">Início</th>
                    <th className="px-4 py-3">Conclusão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessions.map((sess) => (
                    <tr key={sess.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                        {sess.location}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                          sess.session_type === 'RECONTAGEM_AUDITORIA'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        }`}>
                          {sess.session_type === 'RECONTAGEM_AUDITORIA' ? 'Recontagem / Auditoria' : '1ª Contagem'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                        #{sess.round_number}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          sess.status === 'ABERTA'
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-emerald-500/10 text-emerald-600'
                        }`}>
                          {sess.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {sess.operator_name}
                      </td>
                      <td className="px-4 py-3 font-bold text-teal-600 dark:text-teal-400">
                        {sess.total_scans} peças
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {sess.started_at ? new Date(sess.started_at).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {sess.closed_at ? new Date(sess.closed_at).toLocaleString('pt-BR') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Conteúdo da Tab 2: Auditoria & Divergências */}
      {activeTab === 'discrepancies' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden space-y-4 p-4">
          {/* Header da Aba Auditoria */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                Auditoria, Saldos Validados e Manutenção
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Alterne entre o Saldo Validado Consolidado por SKU (Geral da Loja) e o Detalhamento por Prateleira.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setOnlyDivergent(!onlyDivergent)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  onlyDivergent
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                {onlyDivergent ? 'Mostrando Apenas Divergentes' : 'Filtrar Divergências'}
              </button>

              <div className="relative w-full sm:w-60">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar ISBN, obra, prateleira..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Sub-abas de Auditoria */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-bold">
            <button
              type="button"
              onClick={() => setAuditSubTab('sku_summary')}
              className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                auditSubTab === 'sku_summary'
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Boxes className="h-3.5 w-3.5" />
              Saldos Validados por SKU (Consolidado Geral)
            </button>

            <button
              type="button"
              onClick={() => setAuditSubTab('location_detail')}
              className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                auditSubTab === 'location_detail'
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              Detalhamento por Prateleira ({discrepancies.length})
            </button>
          </div>

          {/* VISÃO 1: Consolidado Geral por SKU (Saldos Validados Excel Sheet 1) */}
          {auditSubTab === 'sku_summary' && (
            <div>
              {skuSummaries.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  Nenhum item contabilizado para consolidação de SKU.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3">ISBN / Código</th>
                        <th className="px-4 py-3">Título / Marca</th>
                        <th className="px-4 py-3">Prateleiras Onde Foi Contado</th>
                        <th className="px-4 py-3 text-center">1ª Contagem Total</th>
                        <th className="px-4 py-3 text-center">Recontagem Total</th>
                        <th className="px-4 py-3 text-center bg-teal-500/10 text-teal-700 dark:text-teal-300">
                          Saldo Validado Final
                        </th>
                        <th className="px-4 py-3">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {skuSummaries
                        .filter(s => {
                          if (onlyDivergent && !s.has_divergence) return false;
                          if (!searchQuery) return true;
                          const q = searchQuery.toLowerCase();
                          return (
                            s.isbn.toLowerCase().includes(q) ||
                            s.title.toLowerCase().includes(q) ||
                            (s.publisher && s.publisher.toLowerCase().includes(q)) ||
                            s.locations_list.some(l => l.toLowerCase().includes(q))
                          );
                        })
                        .map((s, i) => (
                          <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors ${
                            s.has_divergence ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                          }`}>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 font-bold">
                              {s.isbn}
                            </td>
                            <td className="px-4 py-3 text-slate-800 dark:text-slate-200 max-w-xs">
                              <div className="truncate font-medium" title={s.title}>{s.title}</div>
                              <div className="text-xs text-slate-400">{s.publisher || s.category || 'Sem marca'}</div>
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <div className="flex flex-wrap gap-1">
                                {s.locations_list.map((loc, idx) => (
                                  <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    {loc}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                              {s.total_count_1}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-purple-600 dark:text-purple-400">
                              {s.total_count_2 > 0 ? s.total_count_2 : '-'}
                            </td>
                            <td className="px-4 py-3 text-center font-black text-teal-600 dark:text-teal-400 text-base bg-teal-500/5">
                              {s.total_validated_qty} un
                            </td>
                            <td className="px-4 py-3">
                              {s.has_divergence ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Divergente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Validado
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VISÃO 2: Detalhamento por Prateleira com Coluna de Operador */}
          {auditSubTab === 'location_detail' && (
            <div>
              {discrepancies.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  Nenhum item bipado ou auditado até o momento.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3">Localização</th>
                        <th className="px-4 py-3">Operador(es)</th>
                        <th className="px-4 py-3">ISBN / Código</th>
                        <th className="px-4 py-3">Título / Marca</th>
                        <th className="px-4 py-3 text-center">1ª Contagem</th>
                        <th className="px-4 py-3 text-center">Recontagem</th>
                        <th className="px-4 py-3 text-center">Saldo Validado</th>
                        <th className="px-4 py-3 text-center">Divergência</th>
                        <th className="px-4 py-3">Situação</th>
                        <th className="px-4 py-3 text-right">Manutenção</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {discrepancies
                        .filter(d => {
                          if (onlyDivergent && !d.has_divergence) return false;
                          if (!searchQuery) return true;
                          const q = searchQuery.toLowerCase();
                          return (
                            d.isbn.toLowerCase().includes(q) ||
                            d.location.toLowerCase().includes(q) ||
                            d.title.toLowerCase().includes(q) ||
                            (d.operator_name && d.operator_name.toLowerCase().includes(q)) ||
                            (d.publisher && d.publisher.toLowerCase().includes(q))
                          );
                        })
                        .map((d, i) => (
                          <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors ${
                            d.has_divergence ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                          }`}>
                            <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                              {d.location}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                              {d.operator_name || '-'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                              {d.isbn}
                            </td>
                            <td className="px-4 py-3 text-slate-800 dark:text-slate-200 max-w-xs">
                              <div className="truncate font-medium" title={d.title}>{d.title}</div>
                              <div className="text-xs text-slate-400">{d.publisher || d.category || 'Sem marca'}</div>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                              {d.count_1_qty}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-purple-600 dark:text-purple-400">
                              {d.count_2_qty > 0 ? d.count_2_qty : '-'}
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-teal-600 dark:text-teal-400 bg-teal-500/5">
                              {d.validated_qty}
                            </td>
                            <td className="px-4 py-3 text-center font-bold">
                              <span className={`px-2 py-0.5 rounded-md text-xs ${
                                d.difference === 0
                                  ? 'text-slate-500'
                                  : d.difference > 0
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-rose-500/10 text-rose-600'
                              }`}>
                                {d.difference > 0 ? `+${d.difference}` : d.difference}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {d.has_divergence ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Divergente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Validado
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Botão de Ajuste de Quantidade (PIN Supervisor) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdjustItem({
                                      location: d.location,
                                      isbn: d.isbn,
                                      title: d.title,
                                      round_number: d.count_2_qty > 0 ? 2 : 1,
                                      current_qty: d.validated_qty
                                    });
                                    setAdjustNewQty(d.validated_qty);
                                    setAdjustPin('');
                                  }}
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-slate-600 hover:text-teal-600 dark:text-slate-400 transition-colors"
                                  title="Ajustar quantidade contada (Requer PIN de Supervisor)"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>

                                {/* Botão de Edição de Dados do Produto */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditProductItem({
                                      isbn: d.isbn,
                                      title: d.title,
                                      publisher: d.publisher || ''
                                    });
                                    setEditTitle(d.title);
                                    setEditPublisher(d.publisher || '');
                                  }}
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-slate-600 hover:text-blue-600 dark:text-slate-400 transition-colors"
                                  title="Editar título e editora/marca do produto"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Manutenção de Quantidade com PIN de Supervisor */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-w-md w-full p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Manutenção de Contagem
                  </h3>
                  <p className="text-xs text-slate-500">Ajuste de quantidade com autorização</p>
                </div>
              </div>
              <button
                onClick={() => setAdjustItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
              <p><strong className="text-slate-700 dark:text-slate-300">Prateleira:</strong> {adjustItem.location}</p>
              <p><strong className="text-slate-700 dark:text-slate-300">ISBN:</strong> {adjustItem.isbn}</p>
              <p><strong className="text-slate-700 dark:text-slate-300">Obra:</strong> {adjustItem.title}</p>
              <p><strong className="text-slate-700 dark:text-slate-300">Qtd Atual Validada:</strong> {adjustItem.current_qty} un</p>
            </div>

            <form onSubmit={handleAdjustQuantity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nova Quantidade para esta Prateleira:
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustNewQty}
                  onChange={(e) => setAdjustNewQty(parseInt(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Senha do Supervisor (PIN):
                </label>
                <input
                  type="password"
                  required
                  placeholder="Digite o PIN de supervisor"
                  value={adjustPin}
                  onChange={(e) => setAdjustPin(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">PIN padrão do inventário: {inventory.supervisor_pin || '1234'}</p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {submittingAdjust ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal de Edição de Produto (Título / Marca) */}
      {editProductItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-w-md w-full p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Editar Cadastro do Produto
                  </h3>
                  <p className="text-xs text-slate-500">Atualizar título ou marca/editora</p>
                </div>
              </div>
              <button
                onClick={() => setEditProductItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              ISBN: <strong className="font-mono text-slate-800 dark:text-slate-200">{editProductItem.isbn}</strong>
            </p>

            <form onSubmit={handleUpdateProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título da Obra:
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Marca / Editora / Fabricante:
                </label>
                <input
                  type="text"
                  value={editPublisher}
                  onChange={(e) => setEditPublisher(e.target.value)}
                  placeholder="Ex: Companhia das Letras, Panini..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditProductItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingProductEdit}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {submittingProductEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
                  Salvar Alterações
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Conteúdo da Tab 3: Upload Extra */}
      {activeTab === 'upload' && isEmAndamento && (
        <form onSubmit={handleUploadExtra} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4 max-w-2xl">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            Importar Mais Itens para este Inventário
          </h3>
          <p className="text-xs text-slate-500">
            Você pode importar planilhas complementares para adicionar ou atualizar endereços padrão dos itens esperados.
          </p>

          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) setExtraFile(e.target.files[0]);
            }}
            className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
          />

          <button
            type="submit"
            disabled={!extraFile || uploadingExtra}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            {uploadingExtra ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Carregar Planilha Adicional
          </button>
        </form>
      )}

      {/* Modal de Finalização / Trava Geral */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl max-w-md w-full p-6 space-y-5"
          >
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-600 w-fit">
              <Lock className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Finalizar Inventário Geral?
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Atenção: Ao finalizar, o inventário será <strong className="text-slate-800 dark:text-slate-200">bloqueado permanentemente</strong>.
                Todas as sessões abertas serão encerradas e novos bips serão estritamente rejeitados pelo sistema.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1 text-slate-600 dark:text-slate-300">
              <p>• Total apurado: <strong>{inventory.total_scanned_items} peças</strong></p>
              <p>• Total de prateleiras contadas: <strong>{sessions.length}</strong></p>
              <p>• Divergências registradas: <strong>{totalDivergences}</strong></p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={finalizing}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Confirmar e Travar Inventário
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal de Alteração de Status / Cancelamento com Senha de Usuário Seller */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-w-md w-full p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Alterar Status do Inventário
                  </h3>
                  <p className="text-xs text-slate-500">Exige confirmação por senha de usuário</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStatusModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Selecione o Novo Status:
                </label>
                <div className="space-y-2">
                  {[
                    { id: 'EM_ANDAMENTO', label: '🟢 Em Andamento', desc: 'Permite iniciar sessões e registrar bips' },
                    { id: 'AUDITANDO', label: '🟡 Auditando', desc: 'Bloqueia bipagem para conferência e auditoria' },
                    { id: 'FINALIZADO', label: '🔒 Finalizado', desc: 'Encerra o inventário e trava bipagens' },
                    { id: 'CANCELADO', label: '🔴 Cancelado', desc: 'Cancela o inventário e rejeita bipagens' }
                  ].map((st) => (
                    <label
                      key={st.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        targetStatus === st.id
                          ? 'border-teal-500 bg-teal-500/5 dark:bg-teal-500/10'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="status_option"
                        value={st.id}
                        checked={targetStatus === st.id}
                        onChange={() => setTargetStatus(st.id as any)}
                        className="mt-0.5 text-teal-600 focus:ring-teal-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">{st.label}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{st.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sua Senha de Usuário Seller Logado:
                </label>
                <input
                  type="password"
                  required
                  placeholder="Digite sua senha de login"
                  value={sellerPassword}
                  onChange={(e) => setSellerPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Confirmação obrigatória para segurança do sistema.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingStatusChange}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {submittingStatusChange ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirmar e Salvar Status
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal de Compartilhamento / QR Code Operador */}
      {showShareModal && inventory.access_token && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-w-lg w-full p-6 space-y-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <QrCode className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Acesso Rápido para Operadores
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Acesso Mobile-First direto (sem login/senha)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* QR Code Container */}
            {(() => {
              const operatorUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/inventory/op/${inventory.access_token}`;
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(operatorUrl)}`;

              return (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-center">
                    <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-100">
                      <img
                        src={qrImageUrl}
                        alt="QR Code de Acesso do Operador"
                        className="w-48 h-48 rounded-lg"
                        loading="eager"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 font-medium">
                      Aponte a câmera do celular ou leitor para abrir a tela de bipagem diretamente.
                    </p>
                  </div>

                  {/* Campo com Link Direto */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block">
                      Link direto (compartilhe via WhatsApp, Telegram ou e-mail):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={operatorUrl}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-700 dark:text-slate-300 select-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyLink(operatorUrl)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors whitespace-nowrap shadow-sm"
                      >
                        {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedLink ? 'Copiado!' : 'Copiar'}
                      </button>
                      <a
                        href={operatorUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                        title="Abrir em nova aba"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>

                  {/* Instruções passo a passo */}
                  <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-800 dark:text-teal-300 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Como funciona para a equipe de chão de loja:
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      1. O operador abre o link no smartphone ou tablet (sem necessidade de senha).
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      2. Informa seu nome e a prateleira/estante atual para iniciar a contagem.
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      3. Os bips são armazenados localmente e sincronizados mesmo se houver oscilação de internet.
                    </p>
                  </div>

                  {/* Rodapé do Modal com Regeneração */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleRegenerateToken}
                      disabled={regeneratingToken}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                    >
                      {regeneratingToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Regenerar Link de Acesso
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowShareModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        </div>
      )}
    </div>
  );
}
