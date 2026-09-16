'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ScanBarcode, 
  ArrowLeft, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  RotateCcw, 
  MapPin, 
  BookOpen, 
  Layers,
  PlusCircle,
  X,
  Undo2,
  Trash2,
  Pencil,
  Hash,
  Camera,
  Building2,
  Search,
  Check
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import CameraBarcodeScanner from '@/components/inventory/CameraBarcodeScanner';
import SupervisorPinModal from '@/components/inventory/SupervisorPinModal';
import { 
  saveCatalogItems, 
  upsertCatalogItem,
  findCatalogItem, 
  savePendingScan, 
  getPendingScans, 
  markScansSynced, 
  deleteLastPendingScan,
  clearPendingScansForIsbn,
  playSuccessBeep, 
  playWarningBeep,
  CatalogItemRecord,
  PendingScanRecord
} from '@/lib/inventoryIndexedDb';

interface SessionState {
  id: number;
  location: string;
  session_type: string;
  round_number: number;
  status: string;
  total_scans: number;
}

interface LastScanned {
  isbn: string;
  title: string;
  publisher?: string;
  category?: string;
  isUnregistered: boolean;
  timestamp: string;
}

export default function InventoryCountPage() {
  const params = useParams();
  const router = useRouter();
  const inventoryId = Number(params.id);
  const user = getUser();
  const companyId = user?.company_id;

  // Estados de Sessão
  const [session, setSession] = useState<SessionState | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [locationAuditWarning, setLocationAuditWarning] = useState<{
    exists: boolean;
    last_operator_name?: string;
    total_scans_previous?: number;
  } | null>(null);

  // Estados de Bipagem
  const [barcodeInput, setBarcodeInput] = useState('');
  const [useCamera, setUseCamera] = useState(false);
  const [quantityMode, setQuantityMode] = useState<'unit' | 'custom'>('unit');
  const [lastScanned, setLastScanned] = useState<LastScanned | null>(null);
  const [sessionScannedCount, setSessionScannedCount] = useState(0);
  const [undoingLastScan, setUndoingLastScan] = useState(false);

  // Modal de Digitar Quantidade por Bip (em modo custom)
  const [qtyPromptModal, setQtyPromptModal] = useState<{
    isOpen: boolean;
    isbn: string;
    title: string;
    publisher?: string;
    category?: string;
    clientUuid: string;
    nowIso: string;
  } | null>(null);
  const [promptQuantity, setPromptQuantity] = useState<number>(1);
  const promptQtyInputRef = useRef<HTMLInputElement>(null);

  // Navegação da Sessão (Abas) & Manutenção
  const [sessionTab, setSessionTab] = useState<'scan' | 'items'>('scan');
  const [sessionItems, setSessionItems] = useState<Array<{
    isbn: string;
    title: string;
    publisher?: string;
    category?: string;
    total_quantity: number;
  }>>([]);
  const [loadingSessionItems, setLoadingSessionItems] = useState(false);
  const [searchItemQuery, setSearchItemQuery] = useState('');

  // Supervisor PIN & Modal
  const [authorizedPin, setAuthorizedPin] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<{
    isOpen: boolean;
    action: 'edit' | 'delete';
    targetIsbn: string;
    targetTitle: string;
    currentQty: number;
  } | null>(null);

  // Modal Item Não Cadastrado
  const [unregisteredModal, setUnregisteredModal] = useState<{
    isOpen: boolean;
    isbn: string;
    clientUuid: string;
    nowIso: string;
  } | null>(null);
  const [unregisteredTitle, setUnregisteredTitle] = useState('');
  const [unregisteredPublisher, setUnregisteredPublisher] = useState('');
  const [unregisteredQuantity, setUnregisteredQuantity] = useState<number>(1);
  const [savingUnregistered, setSavingUnregistered] = useState(false);
  const unregTitleInputRef = useRef<HTMLInputElement>(null);

  // Estados de Rede & Offline
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [closingSession, setClosingSession] = useState(false);

  // Referência para focar sempre no input de código de barras
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // 1. Inicializar Catálogo Offline e Monitorar Conexão
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida! Sincronizando bips...');
      flushPendingScans();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Sem conexão à internet. Operando em Modo Offline.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    async function initCatalog() {
      if (!companyId || !inventoryId) return;
      try {
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/catalog-cache`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const items = await res.json();
          await saveCatalogItems(inventoryId, items);
          console.log(`[IndexedDB] ${items.length} itens armazenados no cache local.`);
        }
      } catch (err) {
        console.warn('[IndexedDB] Erro ao sincronizar catálogo:', err);
      }
    }

    initCatalog();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [companyId, inventoryId]);

  // Manter foco permanente no input quando a sessão estiver aberta (se nenhum modal estiver aberto)
  useEffect(() => {
    if (session && session.status === 'ABERTA' && !unregisteredModal && !pinModal && !qtyPromptModal) {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);

      const handleGlobalClick = (e: MouseEvent) => {
        if (unregisteredModal || pinModal || qtyPromptModal) return;
        const target = e.target as HTMLElement;
        if (!target.closest('button') && !target.closest('a') && !target.closest('input')) {
          barcodeInputRef.current?.focus();
        }
      };

      window.addEventListener('click', handleGlobalClick);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', handleGlobalClick);
      };
    }
  }, [session, unregisteredModal, pinModal, qtyPromptModal]);

  // Auto-focar no campo de quantidade quando o modal de bipagem em quantidade abrir
  useEffect(() => {
    if (qtyPromptModal?.isOpen) {
      const timer = setTimeout(() => {
        promptQtyInputRef.current?.focus();
        promptQtyInputRef.current?.select();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [qtyPromptModal]);

  // Timer de sincronização em background a cada 3 segundos
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      flushPendingScans();
    }, 3000);
    return () => clearInterval(interval);
  }, [session]);

  // 2. Despachar bips pendentes para o backend
  async function flushPendingScans() {
    if (!session || syncing || !isOnline) return;
    try {
      const pendings = await getPendingScans(session.id);
      setPendingSyncCount(pendings.length);
      if (pendings.length === 0) return;

      setSyncing(true);
      const token = getToken();

      const batchPayload = {
        scans: pendings.map(p => ({
          client_uuid: p.client_uuid,
          isbn: p.isbn,
          location: p.location,
          quantity: p.quantity,
          scanned_at: p.scanned_at,
          title: p.title,
          publisher: p.publisher
        }))
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/sessions/${session.id}/scans/batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(batchPayload)
        }
      );

      if (res.ok) {
        const uuids = pendings.map(p => p.client_uuid);
        await markScansSynced(uuids);
        const remaining = await getPendingScans(session.id);
        setPendingSyncCount(remaining.length);
      } else if (res.status === 409 || res.status === 423) {
        const err = await res.json();
        toast.error(err.detail || 'Sessão ou inventário bloqueado.');
      }
    } catch (err) {
      // Erro silencioso em background
    } finally {
      setSyncing(false);
    }
  }

  // 3. Checar localização antes de abrir sessão
  async function handleCheckLocation(e: React.FormEvent) {
    e.preventDefault();
    const loc = locationInput.trim().toUpperCase();
    if (!loc) {
      toast.error('Informe a localização / prateleira.');
      return;
    }

    setCheckingLocation(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/sessions/check-location?location=${encodeURIComponent(loc)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setLocationAuditWarning({
            exists: true,
            last_operator_name: data.last_operator_name,
            total_scans_previous: data.total_scans_previous
          });
        } else {
          await startSession(loc, false);
        }
      } else {
        toast.error('Erro ao validar localização.');
      }
    } catch (err) {
      toast.warning('Offline: Abrindo sessão localmente.');
      await startSession(loc, false);
    } finally {
      setCheckingLocation(false);
    }
  }

  // 4. Iniciar Sessão
  async function startSession(loc: string, isAudit: boolean) {
    const token = getToken();
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/sessions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            location: loc,
            is_audit: isAudit
          })
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao abrir sessão.');
      }

      const sessData = await res.json();
      setSession(sessData);
      setSessionScannedCount(0);
      setLocationAuditWarning(null);
      toast.success(`Sessão aberta na prateleira ${loc}!`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao iniciar contagem.');
    }
  }

  // Helper para gravar scan finalizado
  async function recordScan(
    isbnRaw: string,
    title: string,
    publisher: string | undefined,
    category: string | undefined,
    isUnregistered: boolean,
    qtyToApply: number,
    clientUuid: string,
    nowIso: string
  ) {
    playSuccessBeep();

    const scanRecord: PendingScanRecord = {
      client_uuid: clientUuid,
      session_id: session!.id,
      inventory_id: inventoryId,
      isbn: isbnRaw,
      location: session!.location,
      quantity: qtyToApply,
      scanned_at: nowIso,
      status: 'pending'
    };

    try {
      await savePendingScan(scanRecord);
      setPendingSyncCount(prev => prev + 1);
    } catch (err) {
      console.error('[IndexedDB] Falha ao persistir bip:', err);
    }

    setSessionScannedCount(prev => prev + qtyToApply);
    setLastScanned({
      isbn: isbnRaw,
      title,
      publisher,
      category,
      isUnregistered,
      timestamp: new Date().toLocaleTimeString('pt-BR')
    });

    if (isOnline) {
      flushPendingScans();
    }
  }

  // 5. Bipagem de Código de Barras
  async function processBarcodeScan(rawCode: string) {
    const isbnRaw = rawCode.trim();
    if (!isbnRaw || !session) return;

    setBarcodeInput('');

    const clientUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const nowIso = new Date().toISOString();

    let itemMeta: CatalogItemRecord | null = null;
    try {
      itemMeta = await findCatalogItem(inventoryId, isbnRaw);
    } catch (err) {
      console.warn('[IndexedDB] Erro na busca local:', err);
    }

    // 1. Item Não Cadastrado na Base
    if (!itemMeta) {
      playWarningBeep();
      setUnregisteredTitle('');
      setUnregisteredPublisher('');
      setUnregisteredQuantity(1);
      setUnregisteredModal({
        isOpen: true,
        isbn: isbnRaw,
        clientUuid,
        nowIso
      });
      setTimeout(() => {
        unregTitleInputRef.current?.focus();
      }, 120);
      return;
    }

    // 2. Se modo for "Digitar Quantidade", abre o modal com o cursor focado na quantidade
    if (quantityMode === 'custom') {
      playWarningBeep();
      setPromptQuantity(1);
      setQtyPromptModal({
        isOpen: true,
        isbn: isbnRaw,
        title: itemMeta.title,
        publisher: itemMeta.publisher,
        category: itemMeta.category,
        clientUuid,
        nowIso
      });
      return;
    }

    // 3. Modo "unit" (Bipou = Contou +1)
    await recordScan(isbnRaw, itemMeta.title, itemMeta.publisher, itemMeta.category, false, 1, clientUuid, nowIso);
  }

  // Confirmar quantidade no modal de bipagem personalizada
  async function handleConfirmQtyPrompt(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!qtyPromptModal || !session) return;

    const qtyToApply = Math.max(1, Number(promptQuantity) || 1);

    await recordScan(
      qtyPromptModal.isbn,
      qtyPromptModal.title,
      qtyPromptModal.publisher,
      qtyPromptModal.category,
      false,
      qtyToApply,
      qtyPromptModal.clientUuid,
      qtyPromptModal.nowIso
    );

    toast.success(`${qtyToApply} un contabilizada(s) para "${qtyPromptModal.title}"!`);
    setQtyPromptModal(null);

    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  }

  async function handleUndoLastScan() {
    if (!session || undoingLastScan) return;
    setUndoingLastScan(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      if (isOnline) {
        const res = await fetch(`${baseUrl}/companies/${companyId}/inventory/${inventoryId}/sessions/${session.id}/scans/last`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSessionScannedCount(data.session_total_scans);
          toast.success(data.message || 'Último bip cancelado!');
          setLastScanned(null);
          await deleteLastPendingScan(session.id);
          setUndoingLastScan(false);
          return;
        }
      }

      // Offline fallback
      const removedLocal = await deleteLastPendingScan(session.id);
      if (removedLocal) {
        setSessionScannedCount(prev => Math.max(0, prev - removedLocal.quantity));
        setPendingSyncCount(prev => Math.max(0, prev - 1));
        toast.success(`Bip do ISBN ${removedLocal.isbn} (${removedLocal.quantity} un) desfeito localmente!`);
        setLastScanned(null);
      } else {
        toast.info('Nenhum bip recente para desfazer.');
      }
    } catch (err) {
      toast.error('Erro ao desfazer bip.');
    } finally {
      setUndoingLastScan(false);
    }
  }

  async function loadSessionItemsSummary() {
    if (!session) return;
    setLoadingSessionItems(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(
        `${baseUrl}/companies/${companyId}/inventory/${inventoryId}/sessions/${session.id}/items`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSessionItems(data);
      }
    } catch (err) {
      console.warn('Erro ao carregar resumo de itens da sessão:', err);
    } finally {
      setLoadingSessionItems(false);
    }
  }

  async function handleVerifySupervisorPin(pin: string): Promise<boolean> {
    const token = getToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const res = await fetch(
      `${baseUrl}/companies/${companyId}/inventory/${inventoryId}/verify-pin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin })
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Senha do Supervisor incorreta.');
    }
    setAuthorizedPin(pin);
    return true;
  }

  async function handleExecuteMaintenance(pinToUse: string, action: 'edit' | 'delete', targetIsbn: string, newQty: number) {
    if (!session) return;
    const token = getToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    if (action === 'delete' || newQty <= 0) {
      const res = await fetch(
        `${baseUrl}/companies/${companyId}/inventory/${inventoryId}/sessions/${session.id}/items/${targetIsbn}?pin=${encodeURIComponent(pinToUse)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao remover item.');
      }
      const data = await res.json();
      await clearPendingScansForIsbn(session.id, targetIsbn);
      setSessionScannedCount(data.new_total_scans);
      toast.success(`Item ${targetIsbn} removido da contagem.`);
    } else {
      const res = await fetch(
        `${baseUrl}/companies/${companyId}/inventory/${inventoryId}/sessions/${session.id}/items/${targetIsbn}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: pinToUse, new_quantity: newQty })
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao atualizar quantidade.');
      }
      const data = await res.json();
      await clearPendingScansForIsbn(session.id, targetIsbn);
      setSessionScannedCount(data.new_total_scans);
      toast.success(`Quantidade do ISBN ${targetIsbn} atualizada para ${newQty} un!`);
    }

    loadSessionItemsSummary();
    setPinModal(null);
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    processBarcodeScan(barcodeInput);
  }

  async function handleConfirmUnregisteredItem(e: React.FormEvent) {
    e.preventDefault();
    if (!unregisteredModal || !session) return;

    const titleClean = unregisteredTitle.trim();
    const pubClean = unregisteredPublisher.trim();
    const qtyToApply = Math.max(1, Number(unregisteredQuantity) || 1);

    if (!titleClean) {
      toast.error('Informe o nome / título do item.');
      unregTitleInputRef.current?.focus();
      return;
    }

    if (!pubClean) {
      toast.error('Informe a editora do item.');
      return;
    }

    setSavingUnregistered(true);
    try {
      await upsertCatalogItem({
        inventory_id: inventoryId,
        isbn: unregisteredModal.isbn,
        title: titleClean,
        publisher: pubClean,
        category: 'Item Fora da Base',
        default_location: session.location
      });

      await recordScan(
        unregisteredModal.isbn,
        titleClean,
        pubClean,
        'Item Fora da Base',
        true,
        qtyToApply,
        unregisteredModal.clientUuid,
        unregisteredModal.nowIso
      );

      toast.success(`Item "${titleClean}" cadastrado (${qtyToApply} un)!`);

      setUnregisteredModal(null);
      setUnregisteredTitle('');
      setUnregisteredPublisher('');
      setUnregisteredQuantity(1);

      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    } catch (err) {
      toast.error('Erro ao registrar item avulso.');
    } finally {
      setSavingUnregistered(false);
    }
  }

  function handleCancelUnregistered() {
    setUnregisteredModal(null);
    setUnregisteredTitle('');
    setUnregisteredPublisher('');
    setUnregisteredQuantity(1);
    toast.info('Item não contabilizado.');
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  }

  // 6. Fechamento Obrigatório da Sessão
  async function handleCloseSession() {
    if (!session) return;
    setClosingSession(true);

    try {
      await flushPendingScans();

      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${inventoryId}/sessions/${session.id}/close`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao fechar sessão.');
      }

      toast.success(`Contagem da prateleira ${session.location} finalizada!`);
      setSession(null);
      setLocationInput('');
      setLastScanned(null);
      setSessionScannedCount(0);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao concluir sessão.');
    } finally {
      setClosingSession(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between text-slate-900 dark:text-slate-100">
      {/* ─── Top Bar Mobile ──────────────────────────────────────────────── */}
      <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm flex items-center justify-between gap-3">
        <Link
          href={`/inventory/${inventoryId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Sair da Bipagem</span>
        </Link>

        {session && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {session.location}
            </span>
            {session.session_type === 'RECONTAGEM_AUDITORIA' && (
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-1 rounded-lg">
                Auditoria #{session.round_number}
              </span>
            )}
          </div>
        )}

        {/* Status de Conexão e Fila Offline */}
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <Wifi className="h-3 w-3" />
              <span className="hidden sm:inline">Online</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full animate-pulse">
              <WifiOff className="h-3 w-3" />
              <span>Offline</span>
            </span>
          )}

          {pendingSyncCount > 0 && (
            <button
              onClick={flushPendingScans}
              disabled={syncing || !isOnline}
              title="Clique para sincronizar agora"
              className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded-lg flex items-center gap-1"
            >
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {pendingSyncCount} pendente{pendingSyncCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* ─── Corpo da Tela ───────────────────────────────────────────────── */}
      <div className="flex-1 p-4 sm:p-6 max-w-lg mx-auto w-full flex flex-col justify-center">
        {!session ? (
          /* ─── TELA 1: Abertura de Sessão (Definição da Prateleira) ─── */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <MapPin className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Onde você vai contar agora?
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informe a prateleira, corredor ou endereço físico da contagem.
              </p>
            </div>

            <form onSubmit={handleCheckLocation} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Localização / Prateleira
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="Ex: Prateleira A-01, Rua 3..."
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  className="w-full text-base font-bold uppercase tracking-wide px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={checkingLocation}
                className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {checkingLocation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verificando prateleira...
                  </>
                ) : (
                  'Iniciar Contagem nesta Prateleira'
                )}
              </button>
            </form>
          </motion.div>
        ) : (
          /* ─── TELA 2: Modo Bipagem Ativa ─── */
          <div className="space-y-4 flex-1 flex flex-col justify-between py-2">
            <div className="space-y-4">
              {/* Placar Gigante de Peças Bipadas */}
              <div className="rounded-3xl border border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/20 p-5 text-center shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  Total Bipado nesta Prateleira
                </span>
                <div className="text-5xl font-black text-teal-900 dark:text-teal-100 mt-1 font-mono">
                  {sessionScannedCount}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Local: <strong>{session.location}</strong>
                </p>
              </div>

              {/* Navegação de Abas da Sessão */}
              <div className="flex items-center justify-around border-b border-slate-200 dark:border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setSessionTab('scan')}
                  className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-bold rounded-lg transition-colors ${
                    sessionTab === 'scan'
                      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <ScanBarcode className="h-4 w-4" />
                  <span>Bipagem</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSessionTab('items');
                    loadSessionItemsSummary();
                  }}
                  className={`flex items-center gap-1.5 py-1.5 px-3 text-xs font-bold rounded-lg transition-colors ${
                    sessionTab === 'items'
                      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Layers className="h-4 w-4" />
                  <span>Itens Contados</span>
                </button>
              </div>

              {sessionTab === 'scan' ? (
                <>
                  {/* Seletor de Modo: Leitor Físico / Câmera do Celular */}
                  <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-inner">
                    <button
                      type="button"
                      onClick={() => {
                        setUseCamera(false);
                        setTimeout(() => barcodeInputRef.current?.focus(), 150);
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                        !useCamera
                          ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-sm border border-slate-200/80 dark:border-slate-700'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <ScanBarcode className="h-4 w-4" />
                      <span>Leitor Físico / Teclado</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUseCamera(true)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                        useCamera
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Camera className="h-4 w-4" />
                      <span>Usar Câmera do Celular</span>
                    </button>
                  </div>

                  {/* Seletor de Modo de Quantidade: Bipou Contou (+1) vs Digitar Qtd */}
                  <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => setQuantityMode('unit')}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                        quantityMode === 'unit'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      ➕ Bipou = Contou (+1)
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuantityMode('custom')}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                        quantityMode === 'custom'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      🔢 Digitar Quantidade
                    </button>
                  </div>

                  {quantityMode === 'custom' && (
                    <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-center">
                      <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">
                        Modo "Digitar Quantidade" ativo: Ao bipar o produto, a tela de quantidade abrirá com o cursor focado para confirmação.
                      </p>
                    </div>
                  )}

                  {/* Viewport da Câmera (quando ativado modo Câmera) */}
                  {useCamera && (
                    <CameraBarcodeScanner
                      isActive={useCamera}
                      onScan={(code) => processBarcodeScan(code)}
                      onClose={() => {
                        setUseCamera(false);
                        setTimeout(() => barcodeInputRef.current?.focus(), 150);
                      }}
                    />
                  )}

                  {/* Input Foco Contínuo para Leitor USB/Bluetooth/Câmera */}
                  <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                    <div className="relative">
                      <ScanBarcode className="h-5 w-5 absolute left-3.5 top-3.5 text-teal-600" />
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        inputMode="numeric"
                        placeholder={useCamera ? "Aponte a câmera ou digite aqui..." : "Bipe o código de barras ou ISBN..."}
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-teal-500 bg-white dark:bg-slate-900 text-base font-mono font-bold tracking-wider text-slate-900 dark:text-white shadow-md focus:outline-none focus:ring-4 focus:ring-teal-500/20"
                      />
                    </div>
                    <p className="text-[11px] text-center text-slate-400">
                      {useCamera ? "A câmera lê automaticamente ao enquadrar o código." : "O foco fica travado neste campo para leitores automáticos Bluetooth/USB."}
                    </p>
                  </form>

                  {/* Card com o Último Item Bipado + Botão Desfazer */}
                  <AnimatePresence mode="wait">
                    {lastScanned && (
                      <motion.div
                        key={lastScanned.isbn + lastScanned.timestamp}
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`p-4 rounded-2xl border ${
                          lastScanned.isUnregistered
                            ? 'border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/20'
                            : 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20'
                        } shadow-sm space-y-2`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded">
                            {lastScanned.isbn}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {lastScanned.timestamp}
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-2">
                          {lastScanned.title}
                        </h4>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-800 font-medium">
                          {lastScanned.publisher && (
                            <span className="text-xs text-slate-500">
                              Editora: <strong>{lastScanned.publisher}</strong>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={handleUndoLastScan}
                            disabled={undoingLastScan}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-colors ml-auto border border-rose-500/20"
                          >
                            {undoingLastScan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                            Desfazer Bip
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                /* Aba: Resumo dos Itens Contados na Sessão (com busca e manutenção PIN) */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Resumo da Prateleira
                    </h3>
                    <button
                      type="button"
                      onClick={loadSessionItemsSummary}
                      className="text-xs text-teal-600 hover:underline font-semibold"
                    >
                      Atualizar
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por ISBN ou título..."
                      value={searchItemQuery}
                      onChange={(e) => setSearchItemQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  {loadingSessionItems ? (
                    <div className="p-6 text-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1 text-teal-600" />
                      <p className="text-xs">Carregando itens...</p>
                    </div>
                  ) : sessionItems.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-medium">Nenhum produto bipado nesta prateleira ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {sessionItems
                        .filter(it => 
                          it.isbn.toLowerCase().includes(searchItemQuery.toLowerCase()) || 
                          it.title.toLowerCase().includes(searchItemQuery.toLowerCase())
                        )
                        .map((it) => (
                          <div
                            key={it.isbn}
                            className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-[10px] font-bold text-teal-600 bg-teal-500/10 px-1.5 py-0.5 rounded">
                                {it.isbn}
                              </span>
                              <h5 className="font-bold text-xs truncate mt-0.5">{it.title}</h5>
                              {it.publisher && <p className="text-[10px] text-slate-400 truncate">{it.publisher}</p>}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-black text-teal-900 dark:text-teal-100 bg-teal-500/10 px-2.5 py-1 rounded-xl">
                                {it.total_quantity} un
                              </span>

                              <button
                                type="button"
                                onClick={() => {
                                  const newQStr = window.prompt(`Informe a nova quantidade para o ISBN ${it.isbn}:`, String(it.total_quantity));
                                  if (newQStr === null) return;
                                  const newQ = parseInt(newQStr, 10);
                                  if (isNaN(newQ) || newQ < 0) {
                                    toast.error('Quantidade inválida.');
                                    return;
                                  }

                                  if (authorizedPin) {
                                    handleExecuteMaintenance(authorizedPin, 'edit', it.isbn, newQ);
                                  } else {
                                    setPinModal({
                                      isOpen: true,
                                      action: 'edit',
                                      targetIsbn: it.isbn,
                                      targetTitle: it.title,
                                      currentQty: newQ
                                    });
                                  }
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                                title="Editar quantidade (Requer PIN do Supervisor)"
                              >
                                <Pencil className="h-3.5 w-3.5 text-teal-600" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (authorizedPin) {
                                    if (window.confirm(`Remover o item ${it.title} (${it.isbn}) da contagem?`)) {
                                      handleExecuteMaintenance(authorizedPin, 'delete', it.isbn, 0);
                                    }
                                  } else {
                                    setPinModal({
                                      isOpen: true,
                                      action: 'delete',
                                      targetIsbn: it.isbn,
                                      targetTitle: it.title,
                                      currentQty: 0
                                    });
                                  }
                                }}
                                className="p-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/10 text-rose-600 transition-colors"
                                title="Excluir item (Requer PIN do Supervisor)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Botão Obrigatório de Conclusão da Prateleira ─── */}
            <div className="pt-4 sticky bottom-3">
              <button
                type="button"
                onClick={handleCloseSession}
                disabled={closingSession}
                className="w-full py-4 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {closingSession ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gravando e fechando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-teal-400 dark:text-teal-600" />
                    Finalizar Contagem desta Prateleira
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modal de Digitar Quantidade por Bip ─── */}
      {qtyPromptModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="rounded-3xl border border-teal-500/30 bg-white dark:bg-slate-900 shadow-2xl max-w-sm w-full p-6 space-y-4 text-slate-900 dark:text-white"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center gap-2">
                <Hash className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Informe a Quantidade</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQtyPromptModal(null);
                  setTimeout(() => barcodeInputRef.current?.focus(), 100);
                }}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded">
                {qtyPromptModal.isbn}
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2 mt-1">
                {qtyPromptModal.title}
              </h3>
              {qtyPromptModal.publisher && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Editora: <strong>{qtyPromptModal.publisher}</strong>
                </p>
              )}
            </div>

            <form onSubmit={handleConfirmQtyPrompt} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-center">
                  Quantidade de Peças Bipadas
                </label>
                <input
                  ref={promptQtyInputRef}
                  type="number"
                  min="1"
                  required
                  inputMode="numeric"
                  value={promptQuantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setPromptQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full text-center text-3xl font-mono font-black py-3 rounded-2xl border-2 border-teal-500 bg-teal-500/5 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-teal-500/20 shadow-inner"
                />
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-md shadow-teal-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="h-5 w-5" />
                  Confirmar Contagem (+{promptQuantity} un)
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setQtyPromptModal(null);
                    setTimeout(() => barcodeInputRef.current?.focus(), 100);
                  }}
                  className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  Cancelar Bip
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ─── Modal de Aviso de Dupla Checagem (Auditoria de Prateleira) ─── */}
      {locationAuditWarning && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-w-sm w-full p-6 space-y-4"
          >
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 w-fit">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Prateleira já Contada!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                A prateleira <strong className="text-slate-800 dark:text-slate-200 font-mono">{locationInput.toUpperCase()}</strong> já foi contada anteriormente por <strong className="text-slate-800 dark:text-slate-200">{locationAuditWarning.last_operator_name}</strong> ({locationAuditWarning.total_scans_previous} peças).
              </p>
            </div>

            <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold bg-purple-50 dark:bg-purple-950/20 p-3 rounded-xl border border-purple-200 dark:border-purple-500/30">
              Deseja abrir como <strong>Contagem de Auditoria / Recontagem</strong>? O sistema manterá os saldos isolados sem duplicar para conferência do gestor.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => startSession(locationInput.trim().toUpperCase(), true)}
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition-colors"
              >
                Sim, Abrir como Recontagem / Auditoria
              </button>
              <button
                type="button"
                onClick={() => setLocationAuditWarning(null)}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Voltar e Mudar Prateleira
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ─── Modal Item Não Cadastrado na Base ─── */}
      {unregisteredModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="rounded-3xl border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-slate-900 shadow-2xl max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Item Fora da Base</span>
              </div>
              <button
                type="button"
                onClick={handleCancelUnregistered}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Item Não Cadastrado</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Para contabilizar este item na contagem física, informe o nome e a editora:
              </p>
              <div className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                <ScanBarcode className="h-3.5 w-3.5" />
                <span>{unregisteredModal.isbn}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmUnregisteredItem} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nome / Título da Obra <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    ref={unregTitleInputRef}
                    type="text"
                    required
                    value={unregisteredTitle}
                    onChange={(e) => setUnregisteredTitle(e.target.value)}
                    placeholder="Ex: Livro ou Produto Exemplo"
                    className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Editora <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={unregisteredPublisher}
                    onChange={(e) => setUnregisteredPublisher(e.target.value)}
                    placeholder="Ex: Editora Vida / Marca"
                    className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {quantityMode === 'custom' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Quantidade de Peças <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    inputMode="numeric"
                    value={unregisteredQuantity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setUnregisteredQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2.5 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={savingUnregistered || !unregisteredTitle.trim() || !unregisteredPublisher.trim()}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingUnregistered ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando e contabilizando...
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-4 w-4" />
                      Confirmar e Contabilizar (+{unregisteredQuantity} un)
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelUnregistered}
                  className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  Cancelar (Não Contabilizar)
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ─── Modal de Senha do Supervisor para Manutenção ─── */}
      {pinModal && (
        <SupervisorPinModal
          isOpen={pinModal.isOpen}
          title={pinModal.action === 'delete' ? 'Excluir Item Contado' : 'Editar Quantidade Contada'}
          description={`Autorize com a senha do supervisor a manutenção do produto: ${pinModal.targetTitle} (${pinModal.targetIsbn}).`}
          onClose={() => setPinModal(null)}
          onConfirm={async (pin) => {
            await handleVerifySupervisorPin(pin);
            await handleExecuteMaintenance(pin, pinModal.action, pinModal.targetIsbn, pinModal.currentQty);
          }}
        />
      )}
    </div>
  );
}
