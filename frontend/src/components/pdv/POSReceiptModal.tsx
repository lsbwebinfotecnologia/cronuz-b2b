'use client';

import { 
  CheckCircle2, 
  Printer, 
  ArrowRight, 
  X, 
  Store,
  DollarSign
} from 'lucide-react';
import { PDVPendingSaleRecord } from '@/lib/pdvIndexedDb';

interface POSReceiptModalProps {
  sale: PDVPendingSaleRecord | null;
  onClose: () => void;
  onNewSale: () => void;
  isCustomerPinned: boolean;
}

export default function POSReceiptModal({
  sale,
  onClose,
  onNewSale,
  isCustomerPinned
}: POSReceiptModalProps) {
  if (!sale) return null;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Visual Confirmation Header */}
        <div className="p-6 bg-emerald-500 text-white flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-2">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-black">Venda Finalizada!</h2>
          <p className="text-xs text-emerald-100 font-medium mt-0.5">
            {sale.sale_number} • {sale.payment_method}
          </p>
          {isCustomerPinned && (
            <span className="mt-2 text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full text-white">
              📌 Consumidor Fixado para o Próximo Atendimento
            </span>
          )}
        </div>

        {/* Printable Thermal Receipt Container */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs text-slate-800 dark:text-slate-200 space-y-3 print:p-0 print:text-black">
          <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
            <p className="font-bold text-sm">CRONUZ B2B — COMPROVANTE PDV</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Data: {new Date(sale.sold_at).toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cliente: {sale.customer_name} {sale.customer_document ? `(${sale.customer_document})` : ''}
            </p>
          </div>

          <div className="space-y-1.5 border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
            {sale.items.map((it, idx) => (
              <div key={idx} className="flex justify-between items-start">
                <div className="flex-1 pr-2">
                  <span className="font-semibold block truncate">{it.title}</span>
                  <span className="text-[10px] text-slate-500">
                    {it.quantity} x R$ {Number(it.unit_price).toFixed(2)}
                  </span>
                </div>
                <span className="font-bold whitespace-nowrap">
                  R$ {Number(it.total_price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-right pt-1">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal:</span>
              <span>R$ {Number(sale.subtotal).toFixed(2)}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between text-rose-500">
                <span>Desconto:</span>
                <span>- R$ {Number(sale.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-800">
              <span>TOTAL PAGO:</span>
              <span>R$ {Number(sale.total_amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Forma de Pagto:</span>
              <span>{sale.payment_method}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex gap-2">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4" />
            Imprimir Cupom
          </button>
          <button
            onClick={() => {
              onClose();
              onNewSale();
            }}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-semibold text-xs text-white flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition"
          >
            Próxima Venda
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
