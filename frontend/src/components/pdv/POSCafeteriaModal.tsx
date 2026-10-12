'use client';

import React, { useState, useEffect } from 'react';
import { Coffee, X, Loader2, ArrowRight, User, RefreshCw, AlertCircle } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface CafeteriaTabItem {
  id: number;
  product_id?: number;
  barcode?: string;
  sku?: string;
  title: string;
  quantity: number;
  unit_price: number;
  modifiers_price: number;
  total_price: number;
  notes?: string;
  modifiers_json?: any[];
}

export interface CafeteriaTab {
  id: number;
  tab_number: string;
  table_id?: number;
  table_number?: string;
  customer_name?: string;
  customer_document?: string;
  status: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  items: CafeteriaTabItem[];
}

interface POSCafeteriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  onImportTab: (tab: CafeteriaTab) => void;
}

export default function POSCafeteriaModal({
  isOpen,
  onClose,
  companyId,
  onImportTab
}: POSCafeteriaModalProps) {
  const [tabs, setTabs] = useState<CafeteriaTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);

  const fetchTabs = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/tabs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setTabs(await res.json());
      }
    } catch {
      toast.error('Erro ao buscar comandas da cafeteria');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTabs();
    }
  }, [isOpen, companyId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <Coffee className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Comandas da Cafeteria
              </h3>
              <p className="text-xs text-slate-500">
                Puxar comanda aberta ou fechamento de mesa direto para o Caixa PDV
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchTabs}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Recarregar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Lista de Comandas */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-amber-500" />
              <p className="text-xs font-semibold">Carregando comandas ativas...</p>
            </div>
          ) : tabs.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Coffee className="h-10 w-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Nenhuma comanda aberta</p>
              <p className="text-xs text-slate-500 mt-1">Não há contas de mesas ou balcão pendentes de pagamento no momento.</p>
            </div>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-500 transition-all flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      Comanda #{tab.tab_number}
                    </span>
                    {tab.table_number ? (
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        • Mesa {tab.table_number}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">• Balcão</span>
                    )}
                    {tab.status === 'BILL_REQUESTED' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 animate-pulse">
                        Conta Solicitada
                      </span>
                    )}
                  </div>

                  {tab.customer_name && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <User className="h-3 w-3" /> {tab.customer_name}
                    </p>
                  )}

                  <p className="text-[11px] text-slate-400 mt-1">
                    {tab.items?.length || 0} itens consumidos
                  </p>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  <span className="text-base font-black text-slate-900 dark:text-white">
                    R$ {Number(tab.total_amount).toFixed(2)}
                  </span>
                  <button
                    onClick={() => {
                      setImportingId(tab.id);
                      onImportTab(tab);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm flex items-center gap-1 transition-all"
                  >
                    Importar no PDV
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
