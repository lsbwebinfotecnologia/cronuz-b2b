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
  LogOut, 
  Search, 
  MapPin, 
  BookOpen, 
  Layers,
  Sparkles,
  Camera
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { 
  openInventoryDb, 
  saveCatalogItems, 
  findCatalogItem, 
  savePendingScan, 
  getPendingScans, 
  markScansSynced, 
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
  const [lastScanned, setLastScanned] = useState<LastScanned | null>(null);
  const [sessionScannedCount, setSessionScannedCount] = useState(0);

  // Estados de Rede & Offline
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [closingSession, setClosingSession] = useState(false);

  // Referência para focar sempre no input
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

    // Baixar catálogo leve para o IndexedDB
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

  // Manter foco permanente no input quando a sessão estiver aberta
  useEffect(() => {
    if (session && session.status === 'ABERTA') {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);

      const handleGlobalClick = (e: MouseEvent) => {
        // Se não clicou em um botão de ação, devolve foco ao input
        const target = e.target as HTMLElement;
        if (!target.closest('button') && !target.closest('a')) {
          barcodeInputRef.current?.focus();
        }
      };

      window.addEventListener('click', handleGlobalClick);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('click', handleGlobalClick);
      };
    }
  }, [session]);

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
          scanned_at: p.scanned_at
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
          // Avisa sobre contagem prévia e pergunta se deseja auditoria
          setLocationAuditWarning({
            exists: true,
            last_operator_name: data.last_operator_name,
            total_scans_previous: data.total_scans_previous
          });
        } else {
          // Abre sessão normal
          await startSession(loc, false);
        }
      } else {
        toast.error('Erro ao validar localização.');
      }
    } catch (err) {
      // Se estiver offline, permite abrir sessão localmente
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

  // 5. Bipagem de Código de Barras (Físico ou Câmera)
  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isbnRaw = barcodeInput.trim();
    if (!isbnRaw || !session) return;

    // Limpar campo imediatamente para o próximo bip
    setBarcodeInput('');

    // Gerar UUIDv4 para idempotência estrita
    const clientUuid = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const nowIso = new Date().toISOString();

    // Buscar no catálogo local do IndexedDB
    let itemMeta: CatalogItemRecord | null = null;
    try {
      itemMeta = await findCatalogItem(inventoryId, isbnRaw);
    } catch (err) {
      console.warn('[IndexedDB] Erro na busca local:', err);
    }

    const isUnregistered = !itemMeta;

    // Feedback Sonoro e Visual Imediato
    if (isUnregistered) {
      playWarningBeep();
      toast.warning(`Item fora da base: ${isbnRaw}`, { duration: 1500 });
    } else {
      playSuccessBeep();
    }

    const scanRecord: PendingScanRecord = {
      client_uuid: clientUuid,
      session_id: session.id,
      inventory_id: inventoryId,
      isbn: isbnRaw,
      location: session.location,
      quantity: 1,
      scanned_at: nowIso,
      status: 'pending'
    };

    // 1. Salva instantaneamente no IndexedDB
    try {
      await savePendingScan(scanRecord);
      setPendingSyncCount(prev => prev + 1);
    } catch (err) {
      console.error('[IndexedDB] Falha ao persistir bip:', err);
    }

    // 2. Atualiza estado da tela
    setSessionScannedCount(prev => prev + 1);
    setLastScanned({
      isbn: isbnRaw,
      title: itemMeta ? itemMeta.title : 'Item Não Cadastrado na Base',
      publisher: itemMeta?.publisher,
      category: itemMeta?.category,
      isUnregistered,
      timestamp: new Date().toLocaleTimeString('pt-BR')
    });

    // 3. Tenta sincronização rápida se estiver online
    if (isOnline) {
      flushPendingScans();
    }
  }

  // 6. Fechamento Obrigatório da Sessão
  async function handleCloseSession() {
    if (!session) return;
    setClosingSession(true);

    try {
      // Forçar envio dos últimos bips
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between">
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

              {/* Input Foco Contínuo para Leitor USB/Bluetooth/Câmera */}
              <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                <div className="relative">
                  <ScanBarcode className="h-5 w-5 absolute left-3.5 top-3.5 text-teal-600" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="Bipe o código de barras ou ISBN..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-teal-500 bg-white dark:bg-slate-900 text-base font-mono font-bold tracking-wider text-slate-900 dark:text-white shadow-md focus:outline-none focus:ring-4 focus:ring-teal-500/20"
                  />
                </div>
                <p className="text-[11px] text-center text-slate-400">
                  O foco fica travado neste campo para leitores automáticos.
                </p>
              </form>

              {/* Card com o Último Item Bipado */}
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

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/50 dark:border-slate-800">
                      <span className="text-slate-500">{lastScanned.publisher || 'Editora N/A'}</span>
                      {lastScanned.isUnregistered ? (
                        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Fora da base (+1)
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Contado (+1)
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
    </div>
  );
}
