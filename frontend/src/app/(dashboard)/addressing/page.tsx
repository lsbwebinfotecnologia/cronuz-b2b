'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import {
  MapPin,
  Upload,
  Barcode,
  Search,
  Plus,
  Trash2,
  Edit,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Filter,
  Layers,
  ArrowRight,
  Database,
  Smartphone,
  FileSpreadsheet,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import {
  addPendingScan,
  getPendingScans,
  getPendingScansCount,
  removePendingScan,
  clearPendingScans,
  playSuccessBeep,
  playWarningBeep,
  PendingAddressScanRecord,
} from '@/lib/addressingIndexedDb';

interface Branch {
  id: number;
  nome: string;
  cod_empresa: string;
  cod_filial: string;
  cod_local?: string;
  cod_local_estoque?: string[] | null;
  active: boolean;
}

interface ProductAddressItem {
  id: number;
  company_id: number;
  branch_id: number;
  cod_local_estoque?: string | null;
  isbn: string;
  horus_cod_item?: string | null;
  title?: string | null;
  address: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  branch_name?: string | null;
  creator_name?: string | null;
}

interface UploadSummary {
  total_rows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export default function AddressingPage() {
  const [activeTab, setActiveTab] = useState<'gestao' | 'planilha' | 'coletor'>('gestao');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Status de conexão
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // ─── ABA 1: GESTÃO & LISTA ──────────────────────────────────────────────
  const [addresses, setAddresses] = useState<ProductAddressItem[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('');
  const [selectedLocalFilter, setSelectedLocalFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Seleção múltipla para exclusão em lote
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Modal Novo/Editar Endereço
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductAddressItem | null>(null);
  const [modalBranchId, setModalBranchId] = useState<string>('');
  const [modalLocalEstoque, setModalLocalEstoque] = useState<string>('');
  const [modalIsbn, setModalIsbn] = useState<string>('');
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalCodItem, setModalCodItem] = useState<string>('');
  const [modalAddress, setModalAddress] = useState<string>('');
  const [modalNotes, setModalNotes] = useState<string>('');
  const [savingAddress, setSavingAddress] = useState(false);

  // ─── ABA 2: IMPORTAÇÃO PLANILHA ─────────────────────────────────────────
  const [uploadBranchId, setUploadBranchId] = useState<string>('');
  const [uploadLocalEstoque, setUploadLocalEstoque] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'append' | 'replace'>('append');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // ─── ABA 3: COLETOR MOBILE ──────────────────────────────────────────────
  const [collectorBranchId, setCollectorBranchId] = useState<string>('');
  const [collectorLocalEstoque, setCollectorLocalEstoque] = useState<string>('');
  const [collectorBaseAddress, setCollectorBaseAddress] = useState<string>('');
  const [collectorIsbnInput, setCollectorIsbnInput] = useState<string>('');
  const [collectorTitleInput, setCollectorTitleInput] = useState<string>('');
  const [collectorNotesInput, setCollectorNotesInput] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pendingScans, setPendingScans] = useState<PendingAddressScanRecord[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncingBatch, setSyncingBatch] = useState<boolean>(false);

  const isbnScanInputRef = useRef<HTMLInputElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  // Monitora status online/offline nativo
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Você está offline. Os bips serão salvos localmente.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Carrega filiais do seller
  useEffect(() => {
    fetchBranches();
  }, []);

  async function fetchBranches() {
    setBranchesLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: Branch[] = await res.json();
        const activeOnly = data.filter((b) => b.active);
        setBranches(activeOnly);
        if (activeOnly.length > 0) {
          if (!uploadBranchId) setUploadBranchId(String(activeOnly[0].id));
          if (!collectorBranchId) setCollectorBranchId(String(activeOnly[0].id));
        }
      }
    } catch {
      toast.error('Não foi possível carregar as filiais.');
    } finally {
      setBranchesLoading(false);
    }
  }

  // Carrega lista de endereços quando estiver na aba de Gestão
  useEffect(() => {
    if (activeTab === 'gestao') {
      fetchAddresses();
    }
  }, [activeTab, page, selectedBranchFilter, selectedLocalFilter]);

  async function fetchAddresses() {
    setLoadingAddresses(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        page: String(page),
        per_page: '50',
      });
      if (selectedBranchFilter) params.append('branch_id', selectedBranchFilter);
      if (selectedLocalFilter) params.append('cod_local_estoque', selectedLocalFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`${apiUrl}/addressing?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAddresses(data.items || []);
        setTotalPages(data.pages || 1);
        setTotalCount(data.total || 0);
      } else {
        toast.error('Erro ao carregar endereços.');
      }
    } catch {
      toast.error('Falha de conexão ao buscar endereçamentos.');
    } finally {
      setLoadingAddresses(false);
    }
  }

  // Atualiza fila do IndexedDB quando entrar no coletor
  useEffect(() => {
    if (activeTab === 'coletor') {
      refreshPendingQueue();
      setTimeout(() => isbnScanInputRef.current?.focus(), 150);
    }
  }, [activeTab, collectorBranchId]);

  async function refreshPendingQueue() {
    try {
      const bId = collectorBranchId ? Number(collectorBranchId) : undefined;
      const scans = await getPendingScans(bId);
      setPendingScans(scans);
      const total = await getPendingScansCount();
      setPendingCount(total);
    } catch (err) {
      console.error('Erro ao acessar fila IndexedDB:', err);
    }
  }

  // ─── Ações da Aba Gestão ────────────────────────────────────────────────
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchAddresses();
  }

  function handleOpenCreateModal() {
    setEditingItem(null);
    setModalBranchId(branches.length > 0 ? String(branches[0].id) : '');
    setModalLocalEstoque('');
    setModalIsbn('');
    setModalTitle('');
    setModalCodItem('');
    setModalAddress('');
    setModalNotes('');
    setIsModalOpen(true);
  }

  function handleOpenEditModal(item: ProductAddressItem) {
    setEditingItem(item);
    setModalBranchId(String(item.branch_id));
    setModalLocalEstoque(item.cod_local_estoque || '');
    setModalIsbn(item.isbn);
    setModalTitle(item.title || '');
    setModalCodItem(item.horus_cod_item || '');
    setModalAddress(item.address);
    setModalNotes(item.notes || '');
    setIsModalOpen(true);
  }

  async function handleSaveModal(e: React.FormEvent) {
    e.preventDefault();
    if (!modalBranchId || !modalIsbn.trim() || !modalAddress.trim()) {
      toast.error('Preencha os campos obrigatórios (Filial, ISBN e Endereço).');
      return;
    }

    setSavingAddress(true);
    try {
      const token = getToken();
      if (editingItem) {
        // Atualizar
        const res = await fetch(`${apiUrl}/addressing/${editingItem.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            branch_id: Number(modalBranchId),
            cod_local_estoque: modalLocalEstoque.trim() || null,
            isbn: modalIsbn.trim(),
            title: modalTitle.trim() || null,
            horus_cod_item: modalCodItem.trim() || null,
            address: modalAddress.trim().toUpperCase(),
            notes: modalNotes.trim() || null,
          }),
        });
        if (res.ok) {
          toast.success('Endereço atualizado com sucesso.');
          setIsModalOpen(false);
          fetchAddresses();
        } else {
          const err = await res.json();
          toast.error(err.detail || 'Erro ao atualizar endereço.');
        }
      } else {
        // Criar
        const res = await fetch(`${apiUrl}/addressing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            branch_id: Number(modalBranchId),
            cod_local_estoque: modalLocalEstoque.trim() || null,
            isbn: modalIsbn.trim(),
            title: modalTitle.trim() || null,
            horus_cod_item: modalCodItem.trim() || null,
            address: modalAddress.trim().toUpperCase(),
            notes: modalNotes.trim() || null,
          }),
        });
        if (res.ok) {
          toast.success('Endereço cadastrado com sucesso.');
          setIsModalOpen(false);
          fetchAddresses();
        } else {
          const err = await res.json();
          toast.error(err.detail || 'Erro ao cadastrar endereço.');
        }
      }
    } catch {
      toast.error('Falha de conexão.');
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleDeleteSingle(id: number) {
    if (!confirm('Deseja realmente excluir este endereço?')) return;
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/addressing/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Endereço removido.');
        fetchAddresses();
      } else {
        toast.error('Erro ao excluir endereço.');
      }
    } catch {
      toast.error('Falha de conexão.');
    }
  }

  async function handleBatchDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Deseja realmente excluir os ${selectedIds.length} endereços selecionados?`)) return;

    setBatchDeleting(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/addressing/batch/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(selectedIds),
      });
      if (res.ok) {
        toast.success(`${selectedIds.length} endereços removidos.`);
        setSelectedIds([]);
        fetchAddresses();
      } else {
        toast.error('Erro ao excluir em lote.');
      }
    } catch {
      toast.error('Falha de conexão ao excluir.');
    } finally {
      setBatchDeleting(false);
    }
  }

  function handleToggleSelectAll() {
    if (selectedIds.length === addresses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(addresses.map((a) => a.id));
    }
  }

  function handleToggleSelectOne(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  // ─── Ações da Aba Importação de Planilha ─────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação rígida de 10 MB no cliente (Mobile First & Proteção de Memória)
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_SIZE) {
      toast.error(
        `O arquivo excede o limite máximo permitido de 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      );
      e.target.value = '';
      setSelectedFile(null);
      return;
    }

    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.xlsx') && !nameLower.endsWith('.csv')) {
      toast.error('Formato inválido. Selecione um arquivo Excel (.xlsx) ou CSV.');
      e.target.value = '';
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadSummary(null);
  }

  async function handleDownloadTemplate() {
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/addressing/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao baixar modelo.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo_enderecamento_produtos.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Planilha modelo baixada com sucesso.');
    } catch {
      toast.error('Erro ao baixar modelo de planilha.');
    }
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Selecione uma planilha para envio.');
      return;
    }
    if (!uploadBranchId) {
      toast.error('Selecione a filial de destino do endereçamento.');
      return;
    }

    setUploading(true);
    setUploadSummary(null);

    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('branch_id', uploadBranchId);
      if (uploadLocalEstoque) formData.append('cod_local_estoque', uploadLocalEstoque);
      formData.append('mode', uploadMode);

      const res = await fetch(`${apiUrl}/addressing/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const summary: UploadSummary = await res.json();
        setUploadSummary(summary);
        toast.success(
          `Importação finalizada! ${summary.inserted} inseridos, ${summary.updated} atualizados.`
        );
        setSelectedFile(null);
        // Atualiza a lista na aba de gestão caso o usuário alterne
        fetchAddresses();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Falha ao processar planilha.');
      }
    } catch {
      toast.error('Erro de conexão durante o upload.');
    } finally {
      setUploading(false);
    }
  }

  // ─── Ações da Aba Coletor Mobile (Bipagem Offline) ───────────────────────
  async function handleCollectorScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanIsbn = collectorIsbnInput.trim();
    const cleanAddr = collectorBaseAddress.trim().toUpperCase();

    if (!collectorBranchId) {
      toast.error('Selecione uma filial antes de bipar.');
      if (soundEnabled) playWarningBeep();
      return;
    }

    if (!cleanAddr) {
      toast.error('Defina o Endereço / Prateleira atual antes de bipar.');
      if (soundEnabled) playWarningBeep();
      return;
    }

    if (!cleanIsbn) {
      if (soundEnabled) playWarningBeep();
      return;
    }

    const currentBranch = branches.find((b) => b.id === Number(collectorBranchId));

    try {
      await addPendingScan({
        branch_id: Number(collectorBranchId),
        branch_name: currentBranch?.nome,
        cod_local_estoque: collectorLocalEstoque.trim() || undefined,
        address: cleanAddr,
        isbn: cleanIsbn,
        title: collectorTitleInput.trim() || undefined,
        notes: collectorNotesInput.trim() || undefined,
      });

      if (soundEnabled) playSuccessBeep();
      toast.success(`Bipado: ${cleanIsbn} → ${cleanAddr}`);

      // Reseta campo de ISBN e mantém foco e seleção
      setCollectorIsbnInput('');
      setCollectorTitleInput('');
      isbnScanInputRef.current?.focus();

      // Recarrega fila
      refreshPendingQueue();
    } catch (err) {
      console.error(err);
      if (soundEnabled) playWarningBeep();
      toast.error('Erro ao gravar bip na fila offline.');
    }
  }

  async function handleSyncBatch() {
    if (pendingScans.length === 0) {
      toast.info('Nenhum item pendente para sincronizar.');
      return;
    }

    if (!isOnline) {
      toast.error('Você está sem conexão com a internet. Conecte-se para sincronizar.');
      return;
    }

    setSyncingBatch(true);
    try {
      const token = getToken();
      const itemsToSync = pendingScans.map((s) => ({
        branch_id: s.branch_id,
        cod_local_estoque: s.cod_local_estoque,
        isbn: s.isbn,
        horus_cod_item: s.horus_cod_item,
        title: s.title,
        address: s.address,
        notes: s.notes,
        scanned_at: s.scanned_at,
      }));

      const res = await fetch(`${apiUrl}/addressing/sync-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: itemsToSync,
          mode: 'append',
        }),
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(
          `Sincronizado com sucesso! ${result.inserted_count} novos, ${result.updated_count} atualizados.`
        );
        // Limpa registros do IndexedDB
        await clearPendingScans();
        await refreshPendingQueue();
        fetchAddresses();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao sincronizar fila com o servidor.');
      }
    } catch {
      toast.error('Falha na comunicação com o servidor.');
    } finally {
      setSyncingBatch(false);
    }
  }

  async function handleRemoveLocalItem(clientUuid: string) {
    try {
      await removePendingScan(clientUuid);
      await refreshPendingQueue();
      toast.info('Item removido da fila local.');
    } catch {
      toast.error('Erro ao remover item local.');
    }
  }

  async function handleClearAllLocal() {
    if (!confirm('Deseja descartar todos os itens da fila local não sincronizados?')) return;
    try {
      await clearPendingScans();
      await refreshPendingQueue();
      toast.info('Fila local limpa.');
    } catch {
      toast.error('Erro ao limpar fila.');
    }
  }

  // Filiais selecionadas atuais para locais de estoque
  const selectedUploadBranch = branches.find((b) => b.id === Number(uploadBranchId));
  const selectedCollectorBranch = branches.find((b) => b.id === Number(collectorBranchId));
  const selectedFilterBranch = branches.find((b) => b.id === Number(selectedBranchFilter));
  const selectedModalBranch = branches.find((b) => b.id === Number(modalBranchId));

  return (
    <div className="space-y-6 pb-20">
      {/* ─── HEADER PRINCIPAL COM STATUS ONLINE/OFFLINE ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-xs">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Endereçamento de Produtos
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Localização física multi-endereço integrada ao estoque das filiais
            </p>
          </div>
        </div>

        {/* Status de Conexão e Fila Offline */}
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              isOnline
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {pendingCount > 0 && (
            <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Database className="w-3.5 h-3.5" />
              <span>{pendingCount} pendente(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── NAVEGAÇÃO POR ABAS (MOBILE FIRST) ─── */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('gestao')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all flex-1 justify-center ${
            activeTab === 'gestao'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Gestão de Endereços</span>
        </button>

        <button
          onClick={() => setActiveTab('planilha')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all flex-1 justify-center ${
            activeTab === 'planilha'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Importar Planilha</span>
        </button>

        <button
          onClick={() => setActiveTab('coletor')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all flex-1 justify-center relative ${
            activeTab === 'coletor'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Coletor Mobile</span>
          {pendingCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-indigo-500 absolute top-2 right-2" />
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─── ABA 1: GESTÃO & LISTAGEM ──────────────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'gestao' && (
        <div className="space-y-4">
          {/* Barra de Filtros e Ações */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Filtro Filial */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Filial
                </label>
                <select
                  value={selectedBranchFilter}
                  onChange={(e) => {
                    setSelectedBranchFilter(e.target.value);
                    setSelectedLocalFilter('');
                    setPage(1);
                  }}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Todas as Filiais</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome} (Emp {b.cod_empresa} / Fil {b.cod_filial})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Local Estoque */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Local de Estoque
                </label>
                <select
                  value={selectedLocalFilter}
                  onChange={(e) => {
                    setSelectedLocalFilter(e.target.value);
                    setPage(1);
                  }}
                  disabled={!selectedBranchFilter || !selectedFilterBranch?.cod_local_estoque?.length}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="">Todos os Locais</option>
                  {selectedFilterBranch?.cod_local_estoque?.map((loc, idx) => (
                    <option key={idx} value={loc}>
                      Local {loc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Busca por ISBN / Endereço / Título */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Buscar ISBN, Título ou Endereço
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Ex: 97885..., RUA-A, O Alquimista..."
                      className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 pl-9 pr-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
                  >
                    Filtrar
                  </button>
                </div>
              </div>
            </form>

            {/* Linha de Botões de Ação */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleBatchDelete}
                    disabled={batchDeleting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir Selecionados ({selectedIds.length})</span>
                  </button>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Total: <strong>{totalCount}</strong> item(ns)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchAddresses}
                  disabled={loadingAddresses}
                  className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingAddresses ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={handleOpenCreateModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Endereço</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Dados (Mobile First com overflow-x-auto e visual responsivo) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={addresses.length > 0 && selectedIds.length === addresses.length}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="py-3 px-4">Produto (ISBN / Título)</th>
                    <th className="py-3 px-4">Filial / Local</th>
                    <th className="py-3 px-4 text-center">Endereço Físico</th>
                    <th className="py-3 px-4">Observações</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {loadingAddresses && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Carregando endereçamentos...
                      </td>
                    </tr>
                  )}

                  {!loadingAddresses && addresses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                        <MapPin className="w-8 h-8 opacity-30 mx-auto mb-2" />
                        Nenhum produto endereçado encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  )}

                  {!loadingAddresses &&
                    addresses.map((item) => {
                      const isSelected = selectedIds.includes(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                            isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOne(item.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800 dark:text-slate-100 text-xs">
                              {item.title || 'Produto sem título'}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                ISBN: {item.isbn}
                              </span>
                              {item.horus_cod_item && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  Cód: {item.horus_cod_item}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              {item.branch_name || `Filial #${item.branch_id}`}
                            </div>
                            {item.cod_local_estoque && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                Local: {item.cod_local_estoque}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                              <MapPin className="w-3 h-3 shrink-0 opacity-70" />
                              {item.address}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            {item.notes || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSingle(item.id)}
                                className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─── ABA 2: IMPORTAÇÃO VIA PLANILHA ─────────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'planilha' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card de Configuração e Envio */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                Upload de Planilha de Endereçamento
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Importe planilhas Excel (.xlsx) ou CSV para atualizar a localização física em lote.
              </p>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Seleção de Filial */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Filial de Destino <span className="text-red-500">*</span>
                </label>
                <select
                  value={uploadBranchId}
                  onChange={(e) => {
                    setUploadBranchId(e.target.value);
                    setUploadLocalEstoque('');
                  }}
                  required
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione a Filial...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome} (Emp {b.cod_empresa} / Fil {b.cod_filial})
                    </option>
                  ))}
                </select>
              </div>

              {/* Seleção de Local de Estoque da Filial (se houver configurado) */}
              {selectedUploadBranch?.cod_local_estoque && selectedUploadBranch.cod_local_estoque.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Local de Estoque Padrão (Opcional)
                  </label>
                  <select
                    value={uploadLocalEstoque}
                    onChange={(e) => setUploadLocalEstoque(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Nenhum (usar coluna da planilha ou sem local específico)</option>
                    {selectedUploadBranch.cod_local_estoque.map((loc, idx) => (
                      <option key={idx} value={loc}>
                        Local {loc}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Se preenchido, os registros da planilha sem coluna de local assumirão este valor.
                  </p>
                </div>
              )}

              {/* Modo de Importação: Append vs Overwrite */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Modo de Importação
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      uploadMode === 'append'
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="uploadMode"
                      value="append"
                      checked={uploadMode === 'append'}
                      onChange={() => setUploadMode('append')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold">Acrescentar / Atualizar (Append)</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Mantém os endereços existentes e adiciona os novos (ou atualiza notas/título).
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      uploadMode === 'replace'
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="uploadMode"
                      value="replace"
                      checked={uploadMode === 'replace'}
                      onChange={() => setUploadMode('replace')}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        Substituir Todos (Overwrite)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Apaga os endereços desta filial antes de inserir a nova carga da planilha.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Upload Dropzone / Seletor de Arquivo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Arquivo da Planilha (.xlsx ou .csv) <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-2xl p-6 text-center transition-colors">
                  <input
                    type="file"
                    id="sheetFileInput"
                    accept=".xlsx,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <label htmlFor="sheetFileInput" className="cursor-pointer block space-y-2">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-indigo-500 opacity-80" />
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {selectedFile ? selectedFile.name : 'Clique para selecionar a planilha'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB selecionado`
                        : 'Formatos aceitos: .xlsx, .csv · Limite máximo: 10 MB'}
                    </div>
                  </label>
                </div>
              </div>

              {/* Botão de Envio */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={uploading || !selectedFile || !uploadBranchId}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processando Arquivo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Iniciar Importação</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Relatório / Resumo da Importação */}
            {uploadSummary && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Resultado do Processamento
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase font-bold">Total Linhas</div>
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {uploadSummary.total_rows}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <div className="text-emerald-700 dark:text-emerald-400 text-[10px] uppercase font-bold">
                      Inseridos
                    </div>
                    <div className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                      {uploadSummary.inserted}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                    <div className="text-blue-700 dark:text-blue-400 text-[10px] uppercase font-bold">
                      Atualizados
                    </div>
                    <div className="text-base font-bold text-blue-800 dark:text-blue-300">
                      {uploadSummary.updated}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                    <div className="text-amber-700 dark:text-amber-400 text-[10px] uppercase font-bold">
                      Ignorados
                    </div>
                    <div className="text-base font-bold text-amber-800 dark:text-amber-300">
                      {uploadSummary.skipped}
                    </div>
                  </div>
                </div>

                {uploadSummary.errors && uploadSummary.errors.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Avisos / Inconsistências na leitura:</span>
                    </div>
                    <ul className="text-[11px] text-slate-600 dark:text-slate-400 max-h-32 overflow-y-auto space-y-0.5 pl-4 list-disc font-mono">
                      {uploadSummary.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card Lateral: Modelo e Instruções */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                Modelo da Planilha
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Baixe o modelo com cabeçalhos pré-formatados e exemplos prontos.
              </p>
            </div>

            <button
              onClick={handleDownloadTemplate}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors border border-slate-200 dark:border-slate-700"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Planilha Modelo (.xlsx)</span>
            </button>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Colunas Reconhecidas:
              </h4>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-4">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono">ISBN</strong> ou{' '}
                  <span className="font-mono">CODIGO DE BARRAS</span> (Obrigatório)
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono">ENDERECO</strong> (Obrigatório, ex:
                  RUA-A-01, P-02)
                </li>
                <li>
                  <span className="font-mono">TITULO</span> (Opcional)
                </li>
                <li>
                  <span className="font-mono">COD_ITEM</span> (Código interno no Horus, opcional)
                </li>
                <li>
                  <span className="font-mono">COD_LOCAL_ESTOQUE</span> (Opcional, ex: 001)
                </li>
                <li>
                  <span className="font-mono">OBSERVACOES</span> (Opcional)
                </li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-900 dark:text-indigo-300 space-y-1">
              <p className="font-bold">Dica de Multi-endereço:</p>
              <p>
                O mesmo ISBN pode estar em mais de uma linha com endereços diferentes (ex: Rua A e Vitrine). O sistema
                salva e exibe todas as posições físicas do produto.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─── ABA 3: COLETOR MOBILE (BIPAGEM OFFLINE) ────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'coletor' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Painel de Bipagem Mobile-First */}
          <div className="lg:col-span-2 space-y-4">
            {/* Bloco de Configuração da Posição / Prateleira Atual */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  1. Configuração do Ponto Físico
                </span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium">Som Ativo</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">Mudo</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Filial */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Filial
                  </label>
                  <select
                    value={collectorBranchId}
                    onChange={(e) => {
                      setCollectorBranchId(e.target.value);
                      setCollectorLocalEstoque('');
                    }}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Local de Estoque */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Local de Estoque
                  </label>
                  <select
                    value={collectorLocalEstoque}
                    onChange={(e) => setCollectorLocalEstoque(e.target.value)}
                    disabled={!selectedCollectorBranch?.cod_local_estoque?.length}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <option value="">Geral / Sem Local</option>
                    {selectedCollectorBranch?.cod_local_estoque?.map((loc, idx) => (
                      <option key={idx} value={loc}>
                        Local {loc}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Endereço Base / Prateleira */}
                <div>
                  <label className="block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                    Endereço / Prateleira Atual <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={collectorBaseAddress}
                    onChange={(e) => setCollectorBaseAddress(e.target.value.toUpperCase())}
                    placeholder="Ex: RUA-A-01, EST-02"
                    className="w-full text-xs font-mono font-bold uppercase rounded-xl border-2 border-indigo-400 dark:border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Bloco de Bipagem Rápida */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border-2 border-indigo-500/40 dark:border-indigo-500/30 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <Barcode className="w-4 h-4" />
                  2. Bipagem Consecutiva (Leitor / Teclado)
                </span>
                <span className="text-[11px] text-slate-400">
                  {isOnline ? 'Online / Gravação Imediata' : 'Modo Offline Ativo'}
                </span>
              </div>

              <form onSubmit={handleCollectorScanSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    ref={isbnScanInputRef}
                    type="text"
                    value={collectorIsbnInput}
                    onChange={(e) => setCollectorIsbnInput(e.target.value)}
                    placeholder="Bipe o código de barras ou digite o ISBN..."
                    autoFocus
                    className="w-full text-base sm:text-lg font-mono font-bold rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white px-4 py-3.5 focus:outline-hidden focus:ring-4 focus:ring-indigo-500/30 focus:border-indigo-600"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-2 bottom-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                  >
                    <span>Gravar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={collectorTitleInput}
                    onChange={(e) => setCollectorTitleInput(e.target.value)}
                    placeholder="Título do produto (opcional)"
                    className="text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2"
                  />
                  <input
                    type="text"
                    value={collectorNotesInput}
                    onChange={(e) => setCollectorNotesInput(e.target.value)}
                    placeholder="Observação rápida (opcional)"
                    className="text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2"
                  />
                </div>
              </form>

              <p className="text-[11px] text-slate-400">
                Pressione <strong>Enter</strong> ou acione o gatilho da pistola de código de barras. O sistema limpa o
                campo e emite um bipe sonoro de confirmação.
              </p>
            </div>
          </div>

          {/* Painel da Fila Local e Sincronização */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-500" />
                  Fila Local (IndexedDB)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pendingScans.length} item(ns) aguardando sincronização
                </p>
              </div>

              {pendingScans.length > 0 && (
                <button
                  onClick={handleClearAllLocal}
                  className="text-[11px] text-red-500 hover:text-red-700 font-semibold"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Botão Principal de Sincronização */}
            <button
              onClick={handleSyncBatch}
              disabled={syncingBatch || pendingScans.length === 0 || !isOnline}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md"
            >
              {syncingBatch ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sincronizando com o Servidor...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Sincronizar com o Servidor ({pendingScans.length})</span>
                </>
              )}
            </button>

            {!isOnline && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-[11px] text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>Sem internet. Continue bipando normalmente; sincronize quando reconectar.</span>
              </div>
            )}

            {/* Listagem da Fila */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {pendingScans.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 opacity-30 mx-auto mb-1 text-emerald-500" />
                  Nenhum bip pendente na fila local.
                </div>
              ) : (
                pendingScans.map((s) => (
                  <div
                    key={s.client_uuid}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                          {s.isbn}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          {s.address}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {s.title || s.branch_name || 'Sem título'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(s.scanned_at).toLocaleTimeString('pt-BR')}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveLocalItem(s.client_uuid)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                      title="Remover este item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─── MODAL DE NOVO / EDITAR ENDEREÇO ───────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-500" />
                {editingItem ? 'Editar Endereço' : 'Novo Endereço de Produto'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-4 space-y-3.5">
              {/* Filial */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Filial <span className="text-red-500">*</span>
                </label>
                <select
                  value={modalBranchId}
                  onChange={(e) => {
                    setModalBranchId(e.target.value);
                    setModalLocalEstoque('');
                  }}
                  required
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome} (Emp {b.cod_empresa} / Fil {b.cod_filial})
                    </option>
                  ))}
                </select>
              </div>

              {/* Local de Estoque */}
              {selectedModalBranch?.cod_local_estoque && selectedModalBranch.cod_local_estoque.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Local de Estoque
                  </label>
                  <select
                    value={modalLocalEstoque}
                    onChange={(e) => setModalLocalEstoque(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Sem local específico</option>
                    {selectedModalBranch.cod_local_estoque.map((loc, idx) => (
                      <option key={idx} value={loc}>
                        Local {loc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* ISBN */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ISBN / Cód. Barras <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalIsbn}
                  onChange={(e) => setModalIsbn(e.target.value)}
                  placeholder="Ex: 9786555640123"
                  required
                  className="w-full text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Endereço */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Endereço Físico <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modalAddress}
                  onChange={(e) => setModalAddress(e.target.value.toUpperCase())}
                  placeholder="Ex: RUA-A-01, EST-02, VITRINE"
                  required
                  className="w-full text-xs font-mono uppercase font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Título (opcional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Título do Produto (Opcional)
                </label>
                <input
                  type="text"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder="Ex: O Senhor dos Anéis"
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Código Item Horus (opcional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Código Item Horus (Opcional)
                </label>
                <input
                  type="text"
                  value={modalCodItem}
                  onChange={(e) => setModalCodItem(e.target.value)}
                  placeholder="Ex: 55001"
                  className="w-full text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Ex: Prateleira superior, fundo..."
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAddress}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  {savingAddress ? 'Salvando...' : 'Salvar Endereço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
