'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Receipt, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  X, 
  Search, 
  DollarSign, 
  CreditCard, 
  Banknote, 
  QrCode,
  Loader2,
  Eye,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { getAllSales, getUnsyncedSalesCount, PDVPendingSaleRecord } from '@/lib/pdvIndexedDb';

interface POSSalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSync: () => Promise<void>;
  isSyncing: boolean;
}

export default function POSSalesHistoryModal({
  isOpen,
  onClose,
  onTriggerSync,
  isSyncing
}: POSSalesHistoryModalProps) {
  const [sales, setSales] = useState<PDVPendingSaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<PDVPendingSaleRecord | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSales();
    }
  }, [isOpen]);

  async function loadSales() {
    try {
      setLoading(true);
      const list = await getAllSales();
      setSales(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const filteredSales = sales.filter((s) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.sale_number.toLowerCase().includes(q) ||
      s.customer_name.toLowerCase().includes(q) ||
      (s.customer_document && s.customer_document.toLowerCase().includes(q)) ||
      s.payment_method.toLowerCase().includes(q)
    );
  });

  // KPIs
  const totalRevenue = sales.reduce((acc, s) => acc + (s.total_amount || 0), 0);
  const pendingCount = sales.filter((s) => s.status === 'pending').length;
  const syncedCount = sales.filter((s) => s.status === 'synced').length;

  const byPayment = sales.reduce((acc: Record<string, number>, s) => {
    acc[s.payment_method] = (acc[s.payment_method] || 0) + s.total_amount;
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
                Centralização de vendas locais, status de sincronização e conciliação
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
              Faturamento Total
            </span>
            <span className="text-lg font-black text-slate-900 dark:text-white mt-0.5 block">
              R$ {totalRevenue.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400">{sales.length} vendas registradas</span>
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
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
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

                return (
                  <div
                    key={s.client_sale_uuid}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {s.sale_number}
                        </span>
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

                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Total</span>
                        <span className="text-base font-black text-slate-900 dark:text-white">
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
                    </div>
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
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Itens da Venda {selectedSale.sale_number}
                </h3>
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
                <span className="text-slate-900 dark:text-white text-base">
                  R$ {Number(selectedSale.total_amount).toFixed(2)}
                </span>
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
