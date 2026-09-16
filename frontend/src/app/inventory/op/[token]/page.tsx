'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ScanBarcode, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  RotateCcw, 
  MapPin, 
  User, 
  Boxes, 
  ArrowRight,
  Sparkles,
  Edit3
} from 'lucide-react';
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

interface PublicInventory {
  id: number;
  company_id: number;
  company_name: string;
  code: string;
  name: string;
  description?: string;
  status: string;
  total_expected_skus: number;
}

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

export default function PublicOperatorPage() {
  const params = useParams();
  const token = params.token as string;

  const [inventory, setInventory] = useState<PublicInventory | null>(null);
  const [loadingInv, setLoadingInv] = useState(true);

  // Operador
  const [operatorName, setOperatorName] = useState<string>('');
  const [nameInput, setNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  // Sessão e Prateleira
  const [session, setSession] = useState<SessionState | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [locationAuditWarning, setLocationAuditWarning] = useState<{
    exists: boolean;
    last_operator_name?: string;
    total_scans_previous?: number;
  } | null>(null);

  // Bipagem
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScanned, setLastScanned] = useState<LastScanned | null>(null);
  const [sessionScannedCount, setSessionScannedCount] = useState(0);

  // Offline / Rede
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [closingSession, setClosingSession] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // 1. Carregar Dados do Inventário via Token e recuperar nome salvo
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida! Sincronizando...');
      flushPendingScans();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Modo Offline ativado. Continue bipando normalmente.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Recuperar nome do operador salvo anteriormente
    const savedName = localStorage.getItem('cronuz_inventory_op_name');
    if (savedName) {
      setOperatorName(savedName);
      setNameInput(savedName);
    }

    async function loadPublicInventory() {
      if (!token) return;
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${baseUrl}/inventory/public/${token}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Link de inventário inválido.');
        }
        const data = await res.json();
        setInventory(data);

        // Baixar catálogo leve para o IndexedDB
        try {
          const cacheRes = await fetch(`${baseUrl}/inventory/public/${token}/catalog-cache`);
          if (cacheRes.ok) {
            const items = await cacheRes.json();
            await saveCatalogItems(data.id, items);
            console.log(`[IndexedDB Public] ${items.length} itens em cache offline.`);
          }
        } catch (e) {
          console.warn('[IndexedDB Public] Falha no cache:', e);
        }
      } catch (err: any) {
        toast.error(err.message || 'Erro ao carregar inventário.');
      } finally {
        setLoadingInv(false);
      }
    }

    loadPublicInventory();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token]);

  // Foco contínuo no campo de bipagem
  useEffect(() => {
    if (session && session.status === 'ABERTA') {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);

      const handleGlobalClick = (e: MouseEvent) => {
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
  }, [session]);

  // Sincronização periódica em background
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      flushPendingScans();
    }, 3000);
    return () => clearInterval(interval);
  }, [session]);

  async function flushPendingScans() {
    if (!session || syncing || !isOnline || !inventory) return;
    try {
      const pendings = await getPendingScans(session.id);
      setPendingSyncCount(pendings.length);
      if (pendings.length === 0) return;

      setSyncing(true);
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const payload = {
        scans: pendings.map(p => ({
          client_uuid: p.client_uuid,
          isbn: p.isbn,
          location: p.location,
          quantity: p.quantity,
          operator_name: operatorName,
          scanned_at: p.scanned_at
        }))
      };

      const res = await fetch(`${baseUrl}/inventory/public/${token}/sessions/${session.id}/scans/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const uuids = pendings.map(p => p.client_uuid);
        await markScansSynced(uuids);
        const remaining = await getPendingScans(session.id);
        setPendingSyncCount(remaining.length);
      }
    } catch (err) {
      // Falha silenciosa
    } finally {
      setSyncing(false);
    }
  }

  function handleSaveOperatorName(e: React.FormEvent) {
    e.preventDefault();
    const clean = nameInput.trim();
    if (!clean) {
      toast.error('Por favor, informe seu nome.');
      return;
    }
    setOperatorName(clean);
    localStorage.setItem('cronuz_inventory_op_name', clean);
    setIsEditingName(false);
    toast.success(`Olá, ${clean}!`);
  }

  async function handleCheckLocation(e: React.FormEvent) {
    e.preventDefault();
    const loc = locationInput.trim().toUpperCase();
    if (!loc) {
      toast.error('Informe a prateleira / local.');
      return;
    }

    setCheckingLocation(true);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    try {
      const res = await fetch(`${baseUrl}/inventory/public/${token}/check-location?location=${encodeURIComponent(loc)}`);
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
        await startSession(loc, false);
      }
    } catch (err) {
      toast.warning('Offline: Iniciando contagem local.');
      await startSession(loc, false);
    } finally {
      setCheckingLocation(false);
    }
  }

  async function startSession(loc: string, isAudit: boolean) {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    try {
      const res = await fetch(`${baseUrl}/inventory/public/${token}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: loc,
          operator_name: operatorName,
          is_audit: isAudit
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao abrir sessão.');
      }

      const sessData = await res.json();
      setSession(sessData);
      setSessionScannedCount(0);
      setLocationAuditWarning(null);
      toast.success(`Prateleira ${loc} iniciada!`);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao iniciar contagem.');
    }
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isbnRaw = barcodeInput.trim();
    if (!isbnRaw || !session || !inventory) return;

    setBarcodeInput('');

    const clientUuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const nowIso = new Date().toISOString();

    let itemMeta: CatalogItemRecord | null = null;
    try {
      itemMeta = await findCatalogItem(inventory.id, isbnRaw);
    } catch (err) {
      console.warn('[IndexedDB] Erro local:', err);
    }

    const isUnregistered = !itemMeta;

    if (isUnregistered) {
      playWarningBeep();
      toast.warning(`Item fora da base: ${isbnRaw}`, { duration: 1200 });
    } else {
      playSuccessBeep();
    }

    const scanRecord: PendingScanRecord = {
      client_uuid: clientUuid,
      session_id: session.id,
      inventory_id: inventory.id,
      isbn: isbnRaw,
      location: session.location,
      quantity: 1,
      scanned_at: nowIso,
      status: 'pending'
    };

    try {
      await savePendingScan(scanRecord);
      setPendingSyncCount(prev => prev + 1);
    } catch (err) {
      console.error('[IndexedDB] Erro ao gravar bip:', err);
    }

    setSessionScannedCount(prev => prev + 1);
    setLastScanned({
      isbn: isbnRaw,
      title: itemMeta ? itemMeta.title : 'Item Não Cadastrado na Base',
      publisher: itemMeta?.publisher,
      category: itemMeta?.category,
      isUnregistered,
      timestamp: new Date().toLocaleTimeString('pt-BR')
    });

    if (isOnline) {
      flushPendingScans();
    }
  }

  async function handleCloseSession() {
    if (!session || !inventory) return;
    setClosingSession(true);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    try {
      await flushPendingScans();

      const res = await fetch(`${baseUrl}/inventory/public/${token}/sessions/${session.id}/close`, {
        method: 'PUT'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao fechar contagem.');
      }

      toast.success(`Contagem de ${session.location} concluída!`);
      setSession(null);
      setLocationInput('');
      setLastScanned(null);
      setSessionScannedCount(0);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao concluir contagem.');
    } finally {
      setClosingSession(false);
    }
  }

  if (loadingInv) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm text-slate-500 font-medium">Carregando inventário...</p>
      </div>
    );
  }

  if (!inventory) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center space-y-3">
        <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Link Inválido ou Expirado</h2>
        <p className="text-sm text-slate-500 max-w-sm">
          Solicite ao gestor do inventário um novo link de acesso rápido para operadores.
        </p>
      </div>
    );
  }

  if (inventory.status === 'FINALIZADO') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 text-teal-600 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Inventário Finalizado</h2>
        <p className="text-sm text-slate-500 max-w-sm">
          O inventário <strong>{inventory.name} ({inventory.code})</strong> já foi encerrado pelo gestor. Nenhuma nova contagem é permitida.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between text-slate-900 dark:text-slate-100">
      {/* ─── Top Bar Mobile-First ─────────────────────────────────────── */}
      <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600">
            <Boxes className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <span className="font-mono text-[10px] font-bold text-teal-600 block">{inventory.code}</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{inventory.company_name}</span>
          </div>
        </div>

        {/* Identificação do Operador */}
        {operatorName && (
          <button
            onClick={() => setIsEditingName(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <User className="h-3 w-3 text-teal-600" />
            <span className="max-w-[100px] truncate">{operatorName}</span>
            <Edit3 className="h-2.5 w-2.5 text-slate-400" />
          </button>
        )}

        {/* Status de Conexão */}
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <Wifi className="h-3 w-3" />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full animate-pulse">
              <WifiOff className="h-3 w-3" />
            </span>
          )}

          {pendingSyncCount > 0 && (
            <button
              onClick={flushPendingScans}
              className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1"
            >
              {pendingSyncCount}
            </button>
          )}
        </div>
      </div>

      {/* ─── Conteúdo Principal ───────────────────────────────────────── */}
      <div className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col justify-center">
        {/* PASSO 1: Identificação do Operador (se ainda não preencheu) */}
        {!operatorName || isEditingName ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5"
          >
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-teal-500/10 text-teal-600">
                <User className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold">Quem está contando?</h2>
              <p className="text-xs text-slate-500">
                Informe seu nome ou número de identificação para registrar suas prateleiras.
              </p>
            </div>

            <form onSubmit={handleSaveOperatorName} className="space-y-4">
              <input
                type="text"
                autoFocus
                required
                placeholder="Ex: Contador 1, Carlos Silva..."
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full text-base font-bold px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:border-teal-500"
              />

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                Continuar para Prateleiras
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        ) : !session ? (
          /* PASSO 2: Seleção da Prateleira */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-teal-500/10 text-teal-600">
                <MapPin className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold">Qual prateleira vai contar?</h2>
              <p className="text-xs text-slate-500">
                Operador: <strong>{operatorName}</strong>
              </p>
            </div>

            <form onSubmit={handleCheckLocation} className="space-y-4">
              <input
                type="text"
                autoFocus
                required
                placeholder="Ex: Prateleira A-01, Rua 2..."
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                className="w-full text-base font-bold uppercase tracking-wide px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-transparent focus:outline-none focus:border-teal-500"
              />

              <button
                type="submit"
                disabled={checkingLocation}
                className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {checkingLocation ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checando prateleira...
                  </>
                ) : (
                  'Iniciar Bipagem'
                )}
              </button>
            </form>
          </motion.div>
        ) : (
          /* PASSO 3: Bipagem Ativa */
          <div className="space-y-4 flex-1 flex flex-col justify-between py-2">
            <div className="space-y-4">
              {/* Placar de Peças */}
              <div className="rounded-3xl border border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/20 p-5 text-center shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-teal-600 px-2">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {session.location}
                  </span>
                  {session.session_type === 'RECONTAGEM_AUDITORIA' && (
                    <span className="bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded">
                      Auditoria #{session.round_number}
                    </span>
                  )}
                </div>

                <div className="text-5xl font-black text-teal-900 dark:text-teal-100 my-2 font-mono">
                  {sessionScannedCount}
                </div>
                <span className="text-[11px] text-slate-400">peças bipadas nesta sessão</span>
              </div>

              {/* Input com Foco Travado */}
              <form onSubmit={handleBarcodeSubmit} className="space-y-1">
                <div className="relative">
                  <ScanBarcode className="h-5 w-5 absolute left-3.5 top-3.5 text-teal-600" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="Bipe o código de barras ou ISBN..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-2 border-teal-500 bg-white dark:bg-slate-900 text-base font-mono font-bold tracking-wider shadow-md focus:outline-none focus:ring-4 focus:ring-teal-500/20"
                  />
                </div>
                <p className="text-[10px] text-center text-slate-400">
                  Foco travado para leitor físico ou scanner.
                </p>
              </form>

              {/* Card Último Item Bipado */}
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
                    } shadow-sm space-y-1.5`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded">
                        {lastScanned.isbn}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {lastScanned.timestamp}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm line-clamp-2">
                      {lastScanned.title}
                    </h4>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/50 dark:border-slate-800">
                      <span className="text-slate-500">{lastScanned.publisher || 'Editora N/A'}</span>
                      {lastScanned.isUnregistered ? (
                        <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Fora da base (+1)
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Contado (+1)
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Botão Obrigatório Fechar Prateleira */}
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
                    Fechando prateleira...
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

      {/* Modal Aviso de Auditoria */}
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
              <h3 className="text-lg font-bold">Prateleira já Contada!</h3>
              <p className="text-xs text-slate-500 mt-1">
                A prateleira <strong className="font-mono">{locationInput.toUpperCase()}</strong> já foi contada por <strong>{locationAuditWarning.last_operator_name}</strong> ({locationAuditWarning.total_scans_previous} peças).
              </p>
            </div>

            <p className="text-xs text-purple-600 font-semibold bg-purple-50 dark:bg-purple-950/20 p-3 rounded-xl border border-purple-200 dark:border-purple-500/30">
              Deseja abrir como <strong>Recontagem de Auditoria</strong>? As contagens ficarão isoladas para conferência pelo gestor.
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
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors"
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
