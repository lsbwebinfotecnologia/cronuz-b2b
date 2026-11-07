'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  X, 
  Search, 
  Loader2,
  Eye,
  EyeOff,
  Ban,
  KeyRound,
  Store
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { POSSessionData } from './POSSessionModal';
import { 
  getAllSales, 
  getPdvSetting,
  setPdvSetting,
  markLocalSaleCancelled,
  adjustLocalCatalogStock,
  PDVPendingSaleRecord 
} from '@/lib/pdvIndexedDb';

interface POSSalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSync: () => Promise<void>;
  isSyncing: boolean;
  activeSession?: POSSessionData | null;
  onSaleCancelled?: () => Promise<void> | void;
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function POSSalesHistoryModal({
  isOpen,
  onClose,
  onTriggerSync,
  isSyncing,
  activeSession,
  onSaleCancelled
}: POSSalesHistoryModalProps) {
  const [sales, setSales] = useState<PDVPendingSaleRecord[]>([]);
  const [sessions, setSessions] = useState<POSSessionData[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [selectedSale, setSelectedSale] = useState<PDVPendingSaleRecord | null>(null);

  // Estado para cancelamento com senha do supervisor
  const [cancellingUuid, setCancellingUuid] = useState<string | null>(null);
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showSupervisorPass, setShowSupervisorPass] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initSessionId = activeSession?.id ? String(activeSession.id) : '';
      setSelectedSessionId(initSessionId);
      fetchSessionsList();
      loadSales(initSessionId);
      setCancellingUuid(null);
      setSupervisorPassword('');
      setCancelReason('');
    }
  }, [isOpen, activeSession?.id]);

  async function fetchSessionsList() {
    try {
      const token = getToken();
      const userRaw = getUser();
      const userObj = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
      const companyId = userObj?.company_id;
      if (token && companyId && navigator.onLine) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setSessions(data);
            return;
          }
        }
      }
      if (activeSession) {
        setSessions([activeSession]);
      }
    } catch {
      if (activeSession) {
        setSessions([activeSession]);
      }
    }
  }

  async function loadSales(sessionIdFilter?: string) {
    try {
      setLoading(true);
      const sFilter = sessionIdFilter !== undefined ? sessionIdFilter : selectedSessionId;
      const localList = await getAllSales();
      const mergedMap = new Map<string, PDVPendingSaleRecord>();
      for (const item of localList) {
        if (item.client_sale_uuid) {
          mergedMap.set(item.client_sale_uuid, {
            ...item,
            sale_status: item.sale_status || 'COMPLETED',
          });
        }
      }

      // Busca também as vendas já sincronizadas no servidor (incluindo vendas do HorusPDV.exe Desktop)
      try {
        const token = getToken();
        const userRaw = getUser();
        const userObj = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
        const companyId = userObj?.company_id;
        if (token && companyId && navigator.onLine) {
          const queryParams = new URLSearchParams({ limit: '250', status: 'ALL' });
          if (sFilter && sFilter !== 'NONE') {
            queryParams.append('session_id', sFilter);
          }
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sales?${queryParams.toString()}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) {
            const payload = await res.json();
            const serverSales = Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.sales)
                ? payload.sales
                : Array.isArray(payload?.items)
                  ? payload.items
                  : [];
            if (Array.isArray(serverSales)) {
              for (const srv of serverSales) {
                const uuid = srv.client_sale_uuid || `srv-${srv.id}`;
                const srvSaleStatus: 'COMPLETED' | 'CANCELLED' =
                  String(srv.status || '').toUpperCase() === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';

                if (!mergedMap.has(uuid)) {
                  const mappedItems = Array.isArray(srv.items)
                    ? srv.items.map((it: any) => ({
                        barcode: it.barcode || '',
                        sku: it.sku || '',
                        title: it.title || '',
                        publisher: it.publisher || '',
                        quantity: Number(it.quantity || 1),
                        unit_price: Number(it.unit_price || 0),
                        total_price: Number(it.total_price || 0),
                        horus_item_code: it.horus_item_code || undefined,
                        product_id: it.product_id || undefined,
                      }))
                    : [];
                  mergedMap.set(uuid, {
                    client_sale_uuid: uuid,
                    sale_number: srv.sale_number || `PDV-${srv.id}`,
                    session_id: srv.session_id,
                    customer_name: srv.customer_name || 'Consumidor Final',
                    customer_document: srv.customer_document || '',
                    payment_method: (srv.payment_method || 'DINHEIRO') as PDVPendingSaleRecord['payment_method'],
                    payment_details: srv.payment_details || undefined,
                    subtotal: Number(srv.subtotal || srv.total_amount || 0),
                    discount: Number(srv.discount || srv.discount_amount || 0),
                    total_amount: Number(srv.total_amount || 0),
                    items_count: Number(srv.items_count || mappedItems.reduce((acc: number, i: any) => acc + i.quantity, 0)),
                    sold_at: srv.sold_at || srv.created_at || new Date().toISOString(),
                    status: 'synced',
                    sale_status: srvSaleStatus,
                    origin: srv.origin || 'PDV_DESKTOP',
                    notes: srv.notes || '',
                    items: mappedItems,
                  });
                } else {
                  const existing = mergedMap.get(uuid)!;
                  // Se foi cancelada localmente offline e ainda aguarda envio, preserva status pending + CANCELLED
                  if (existing.sale_status === 'CANCELLED' && existing.status === 'pending' && srvSaleStatus !== 'CANCELLED') {
                    mergedMap.set(uuid, existing);
                  } else {
                    mergedMap.set(uuid, {
                      ...existing,
                      status: 'synced',
                      sale_status: srvSaleStatus,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (srvErr) {
        console.warn('[POSSalesHistoryModal] Offline ou falha ao buscar vendas do servidor:', srvErr);
      }

      const combined = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime()
      );
      setSales(combined);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOfflineSupervisorPassword(inputPass: string): Promise<boolean> {
    let cachedHash = await getPdvSetting<string>('supervisor_password_hash');
    if (!cachedHash && navigator.onLine) {
      try {
        const token = getToken();
        const userRaw = getUser();
        const userObj = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
        const companyId = userObj?.company_id;
        if (token && companyId) {
          const cfgRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/config`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            if (cfg.supervisor_password_hash) {
              cachedHash = cfg.supervisor_password_hash;
              await setPdvSetting('supervisor_password_hash', cachedHash);
            }
          }
        }
      } catch {
        // Ignora erro de rede
      }
    }
    if (!cachedHash) {
      throw new Error(
        'A Senha do Supervisor ainda não foi configurada ou sincronizada neste aparelho. Conecte-se à internet e acesse Configurações → Frente de Caixa (PDV).'
      );
    }
    const inputHash = await sha256Hex(inputPass.trim());
    return inputHash === cachedHash;
  }

  async function handleCancelSale(sale: PDVPendingSaleRecord) {
    if (!supervisorPassword.trim()) {
      toast.error('Informe a Senha do Supervisor para autorizar o cancelamento da venda.');
      return;
    }

    try {
      setCancelling(true);
      const userRaw = getUser();
      const userObj = typeof userRaw === 'string' ? JSON.parse(userRaw) : userRaw;
      const companyId = userObj?.company_id;
      const token = getToken();
      const reasonText = cancelReason.trim() || undefined;

      let cancelledOnServer = false;

      if (navigator.onLine && token && companyId) {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sales/${encodeURIComponent(sale.client_sale_uuid)}/cancel`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              supervisor_password: supervisorPassword.trim(),
              reason: reasonText,
            }),
          }
        );

        if (res.ok) {
          cancelledOnServer = true;
        } else if (res.status === 404) {
          // Venda ainda estava apenas no banco local (não sincronizada no servidor)
          const valid = await verifyOfflineSupervisorPassword(supervisorPassword);
          if (!valid) {
            throw new Error('Senha do supervisor incorreta. O cancelamento da venda não foi autorizado.');
          }
          cancelledOnServer = false;
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Não foi possível cancelar a venda.');
        }
      } else {
        // Modo Offline: valida hash SHA-256 salvo no IndexedDB
        const valid = await verifyOfflineSupervisorPassword(supervisorPassword);
        if (!valid) {
          throw new Error('Senha do supervisor incorreta. O cancelamento da venda não foi autorizado.');
        }
        cancelledOnServer = false;
      }

      // Atualiza registro no IndexedDB e devolve o saldo dos itens ao catálogo local
      await markLocalSaleCancelled(sale, cancelledOnServer, reasonText);
      await adjustLocalCatalogStock(sale.items || [], 1);

      setCancellingUuid(null);
      setSupervisorPassword('');
      setCancelReason('');
      setShowSupervisorPass(false);
      if (selectedSale?.client_sale_uuid === sale.client_sale_uuid) {
        setSelectedSale(null);
      }

      if (cancelledOnServer) {
        toast.success(`Venda ${sale.sale_number} cancelada! Estoque devolvido e lançamento financeiro estornado.`);
      } else {
        toast.warning(
          `Venda ${sale.sale_number} cancelada no aparelho! O estoque local foi devolvido e o estorno sincronizará com a nuvem assim que houver conexão.`
        );
        if (navigator.onLine) {
          await onTriggerSync();
        }
      }

      await loadSales();
      if (onSaleCancelled) {
        await onSaleCancelled();
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cancelar a venda');
    } finally {
      setCancelling(false);
    }
  }

  if (!isOpen) return null;

  // Filtra primeiro pela sessão selecionada
  const sessionSales = sales.filter((s) => {
    if (!selectedSessionId) return true;
    if (selectedSessionId === 'NONE') return !s.session_id;
    return String(s.session_id || '') === String(selectedSessionId);
  });

  const completedSales = sessionSales.filter((s) => s.sale_status !== 'CANCELLED');
  const cancelledSales = sessionSales.filter((s) => s.sale_status === 'CANCELLED');

  const filteredSales = sessionSales.filter((s) => {
    const sStatus = s.sale_status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';
    if (statusFilter !== 'ALL' && sStatus !== statusFilter) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.sale_number.toLowerCase().includes(q) ||
      s.customer_name.toLowerCase().includes(q) ||
      (s.customer_document && s.customer_document.toLowerCase().includes(q)) ||
      s.payment_method.toLowerCase().includes(q)
    );
  });

  // KPIs (calculados sobre vendas concretas da sessão filtrada, separando canceladas)
  const totalRevenue = completedSales.reduce((acc, s) => acc + (s.total_amount || 0), 0);
  const cancelledTotal = cancelledSales.reduce((acc, s) => acc + (s.total_amount || 0), 0);
  const pendingCount = sessionSales.filter((s) => s.status === 'pending').length;
  const syncedCount = sessionSales.filter((s) => s.status === 'synced').length;

  const byPayment = completedSales.reduce((acc: Record<string, number>, s) => {
    const method = (s.payment_method || 'DINHEIRO').toUpperCase();
    if (method === 'MISTO' && s.payment_details) {
      try {
        const parsed = typeof s.payment_details === 'string' ? JSON.parse(s.payment_details) : s.payment_details;
        if (Array.isArray(parsed?.payments) && parsed.payments.length > 0) {
          for (const p of parsed.payments) {
            const subM = String(p.method || 'OUTROS').toUpperCase();
            const subAmt = Number(p.amount || 0);
            acc[subM] = (acc[subM] || 0) + subAmt;
          }
          return acc;
        }
      } catch {
        // fallback se não for JSON válido
      }
    }
    acc[method] = (acc[method] || 0) + Number(s.total_amount || 0);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Acompanhamento de Vendas em Tempo Real</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Centralização de vendas locais, status de sincronização, conciliação e estorno
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await onTriggerSync();
                await loadSales();
              }}
              disabled={isSyncing}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {pendingCount > 0 ? `Sincronizar (${pendingCount})` : 'Sincronizar'}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPIs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Faturamento Líquido
            </span>
            <span className="text-lg font-black text-slate-900 dark:text-white mt-0.5 block">
              R$ {totalRevenue.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400 block">
              {completedSales.length} concretas
              {cancelledSales.length > 0 ? ` • ${cancelledSales.length} cancelada(s) (R$ ${cancelledTotal.toFixed(2)})` : ''}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Sincronizadas
            </span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {syncedCount} vendas
            </span>
            <span className="text-[11px] text-emerald-600/80">100% integradas</span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Pendentes de Envio
            </span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5 block">
              {pendingCount} vendas
            </span>
            <span className="text-[11px] text-amber-600/80">Gravadas offline no aparelho</span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Por Pagamento
            </span>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 mt-1">
              <div>💵 Dinheiro: R$ {(byPayment['DINHEIRO'] || 0).toFixed(2)}</div>
              <div>⚡ PIX: R$ {(byPayment['PIX'] || 0).toFixed(2)}</div>
              <div>💳 Cartão: R$ {((byPayment['DEBITO'] || 0) + (byPayment['CREDITO'] || 0)).toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2.5">
          {/* Filtro por Sessão */}
          <div className="relative sm:w-56 shrink-0">
            <Store className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none" />
            <select
              value={selectedSessionId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedSessionId(val);
                loadSales(val);
              }}
              className="w-full pl-8 pr-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Todas as Sessões</option>
              {sessions.map((sess) => (
                <option key={sess.id} value={String(sess.id)}>
                  {sess.title}
                </option>
              ))}
              <option value="NONE">Sem Sessão (Avulsas)</option>
            </select>
          </div>

          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por número do pedido, cliente ou forma de pagamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Todas ({sessionSales.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                statusFilter === 'COMPLETED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Concretas ({completedSales.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('CANCELLED')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                statusFilter === 'CANCELLED'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Canceladas ({cancelledSales.length})
            </button>
          </div>
        </div>

        {/* Sales List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="py-12 flex justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Nenhuma venda encontrada para os critérios informados.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSales.map((s) => {
                const isPending = s.status === 'pending';
                const isCancelled = s.sale_status === 'CANCELLED';
                const isCancellingThis = cancellingUuid === s.client_sale_uuid;

                return (
                  <div
                    key={s.client_sale_uuid}
                    className={`p-3.5 rounded-xl border transition flex flex-col gap-3 ${
                      isCancelled
                        ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/10'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-bold text-sm ${isCancelled ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                            {s.sale_number}
                          </span>
                          {isCancelled && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center gap-1">
                              <Ban className="w-3 h-3" />
                              Cancelada
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              isPending
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {isPending ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            {isPending ? 'Pendente de Envio' : 'Sincronizado'}
                          </span>
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full font-medium text-slate-600 dark:text-slate-300">
                            {s.payment_method}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>👤 {s.customer_name} {s.customer_document ? `(${s.customer_document})` : ''}</span>
                          <span>📦 {s.items_count} {s.items_count === 1 ? 'item' : 'itens'}</span>
                          <span>🕒 {new Date(s.sold_at).toLocaleTimeString('pt-BR')} ({new Date(s.sold_at).toLocaleDateString('pt-BR')})</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0">
                        <div className="text-right mr-1">
                          <span className="text-xs text-slate-400 block">Total</span>
                          <span className={`text-base font-black ${isCancelled ? 'line-through text-rose-500 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                            R$ {Number(s.total_amount || 0).toFixed(2)}
                          </span>
                        </div>

                        <button
                          onClick={() => setSelectedSale(s)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Itens
                        </button>

                        {!isCancelled && !isCancellingThis && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancellingUuid(s.client_sale_uuid);
                              setSupervisorPassword('');
                              setCancelReason('');
                              setShowSupervisorPass(false);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center gap-1 transition"
                            title="Cancelar venda (exige Senha do Supervisor, devolve estoque e estorna financeiro)"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Prompt de Senha do Supervisor para Cancelar Venda */}
                    {!isCancelled && isCancellingThis && (
                      <div className="pt-3 border-t border-rose-200 dark:border-rose-800/80 bg-rose-50/50 dark:bg-rose-950/30 -mx-3.5 -mb-3.5 p-3.5 rounded-b-xl space-y-2.5 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Autorização do Supervisor para Cancelar Venda ({s.sale_number})</span>
                          </div>
                          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            Devolve estoque + estorna financeiro
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="relative">
                            <input
                              type={showSupervisorPass ? 'text' : 'password'}
                              autoFocus
                              placeholder="Senha do Supervisor *"
                              value={supervisorPassword}
                              onChange={(e) => setSupervisorPassword(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleCancelSale(s);
                                } else if (e.key === 'Escape') {
                                  setCancellingUuid(null);
                                  setSupervisorPassword('');
                                }
                              }}
                              className="w-full pl-3 pr-9 py-1.5 text-xs font-medium rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSupervisorPass((prev) => !prev)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              tabIndex={-1}
                            >
                              {showSupervisorPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          <input
                            type="text"
                            placeholder="Motivo do cancelamento (opcional)"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCancelSale(s);
                              }
                            }}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCancellingUuid(null);
                              setSupervisorPassword('');
                              setCancelReason('');
                            }}
                            disabled={cancelling}
                            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                          >
                            Voltar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelSale(s)}
                            disabled={cancelling}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
                          >
                            {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                            Confirmar Cancelamento
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Sale Detail Modal */}
        {selectedSale && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm p-4 flex items-center justify-center z-10">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Itens da Venda {selectedSale.sale_number}
                  </h3>
                  {selectedSale.sale_status === 'CANCELLED' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300">
                      Cancelada
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedSale(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-2">
                {selectedSale.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {it.title}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ISBN: {it.barcode} {it.publisher ? `• ${it.publisher}` : ''}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-slate-600 dark:text-slate-300 block">
                        {it.quantity}x R$ {Number(it.unit_price).toFixed(2)}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        R$ {Number(it.total_price).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between items-center text-sm font-bold">
                <span className="text-slate-600 dark:text-slate-400">Total da Venda:</span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-900 dark:text-white text-base">
                    R$ {Number(selectedSale.total_amount).toFixed(2)}
                  </span>
                  {selectedSale.sale_status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedSale;
                        setSelectedSale(null);
                        setCancellingUuid(target.client_sale_uuid);
                        setSupervisorPassword('');
                        setCancelReason('');
                        setShowSupervisorPass(false);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 transition"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancelar Venda
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
