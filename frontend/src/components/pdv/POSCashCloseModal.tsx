'use client';

import { useState, useEffect } from 'react';
import { 
  Lock, 
  X, 
  Loader2, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  CreditCard, 
  QrCode,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { POSSessionData } from './POSSessionModal';

interface POSCashCloseSummary {
  session_id: number;
  title: string;
  code: string;
  status: string;
  opened_at: string;
  closed_at?: string;
  initial_cash_amount: number;
  cash_sales_amount: number;
  expected_cash_amount: number;
  sales_count: number;
  total_sales_amount: number;
  by_payment_method: {
    DINHEIRO?: number;
    PIX?: number;
    DEBITO?: number;
    CREDITO?: number;
    MISTO?: number;
    [key: string]: number | undefined;
  };
}

interface POSCashCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: POSSessionData | null;
  onSessionClosed: () => void;
}

export default function POSCashCloseModal({
  isOpen,
  onClose,
  session,
  onSessionClosed,
}: POSCashCloseModalProps) {
  const [summary, setSummary] = useState<POSCashCloseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [countedCash, setCountedCash] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  useEffect(() => {
    if (isOpen && session && companyId) {
      fetchSummary();
      setCountedCash('');
      setNotes('');
    }
  }, [isOpen, session, companyId]);

  async function fetchSummary() {
    if (!session) return;
    try {
      setLoading(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions/${session.id}/close-summary`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        // Sugere o valor esperado no campo de contagem
        setCountedCash(Number(data.expected_cash_amount || 0).toFixed(2));
      } else {
        toast.error('Não foi possível obter o resumo financeiro da sessão.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro de conexão ao carregar conferência de caixa.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmClose() {
    if (!session) return;
    const parsedCash = parseFloat(countedCash.replace(',', '.'));
    if (isNaN(parsedCash) || parsedCash < 0) {
      toast.error('Informe um valor válido para o dinheiro contado em gaveta.');
      return;
    }

    try {
      setClosing(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions/${session.id}/close`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            closed_cash_amount: parsedCash,
            closing_notes: notes.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao fechar caixa');
      }

      toast.success(`Caixa "${session.title}" encerrado com sucesso!`);
      onSessionClosed();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao encerrar caixa');
    } finally {
      setClosing(false);
    }
  }

  if (!isOpen || !session) return null;

  const countedNum = parseFloat(countedCash.replace(',', '.') || '0');
  const expectedNum = summary?.expected_cash_amount ?? 0;
  const difference = !isNaN(countedNum) ? countedNum - expectedNum : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Fechamento de Caixa</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Conferência de gaveta e encerramento da sessão {session.code}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-xs font-semibold">Calculando balanço e totalizadores de venda...</p>
            </div>
          ) : summary ? (
            <>
              {/* Sessão info */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sessão</span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{summary.title}</h3>
                  <p className="text-[11px] text-slate-500">
                    Aberta em {new Date(summary.opened_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total de Vendas</span>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white">
                    {summary.sales_count} vendas
                  </p>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    R$ {Number(summary.total_sales_amount || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Grid de Formas de Pagamento */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Recebimentos por Forma de Pagamento
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      <DollarSign className="w-3.5 h-3.5" /> Dinheiro
                    </div>
                    <p className="text-sm font-extrabold text-emerald-900 dark:text-emerald-200 mt-1">
                      R$ {Number(summary.by_payment_method?.DINHEIRO || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl border border-sky-200 dark:border-sky-800/40 bg-sky-50/50 dark:bg-sky-950/20">
                    <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300 text-xs font-bold">
                      <QrCode className="w-3.5 h-3.5" /> PIX
                    </div>
                    <p className="text-sm font-extrabold text-sky-900 dark:text-sky-200 mt-1">
                      R$ {Number(summary.by_payment_method?.PIX || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/20">
                    <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                      <CreditCard className="w-3.5 h-3.5" /> Débito
                    </div>
                    <p className="text-sm font-extrabold text-indigo-900 dark:text-indigo-200 mt-1">
                      R$ {Number(summary.by_payment_method?.DEBITO || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-950/20">
                    <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 text-xs font-bold">
                      <CreditCard className="w-3.5 h-3.5" /> Crédito
                    </div>
                    <p className="text-sm font-extrabold text-purple-900 dark:text-purple-200 mt-1">
                      R$ {Number(summary.by_payment_method?.CREDITO || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Apuração de Dinheiro em Gaveta */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Conferência de Dinheiro Físico (Gaveta)
                </h4>

                <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
                  <span>Fundo de Troco Inicial:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    R$ {Number(summary.initial_cash_amount || 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
                  <span>(+) Vendas Realizadas em Dinheiro:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    R$ {Number(summary.cash_sales_amount || 0).toFixed(2)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Total Esperado na Gaveta:
                  </span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
                    R$ {Number(summary.expected_cash_amount || 0).toFixed(2)}
                  </span>
                </div>

                {/* Campo de Contagem Real */}
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Valor Físico Contado na Gaveta (R$) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-base font-extrabold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Badge de Divergência / Sobra / Falta */}
                {countedCash !== '' && (
                  <div className={`p-3 rounded-xl flex items-center justify-between text-xs font-bold ${
                    Math.abs(difference) < 0.01
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : difference > 0
                      ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                      : 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      {Math.abs(difference) < 0.01 ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Caixa 100% Batido! Nenhuma divergência.</span>
                        </>
                      ) : difference > 0 ? (
                        <>
                          <TrendingUp className="w-4 h-4 text-blue-600" />
                          <span>Sobra de Caixa Identificada:</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>Falta de Caixa Identificada:</span>
                        </>
                      )}
                    </div>
                    <span className="text-sm font-extrabold">
                      {difference >= 0 ? `+ R$ ${difference.toFixed(2)}` : `- R$ ${Math.abs(difference).toFixed(2)}`}
                    </span>
                  </div>
                )}

                {/* Observações */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Observações do Fechamento (opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Valor conferido e transferido ao cofre. Sangria de R$ 500 realizada."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={closing}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmClose}
            disabled={closing || loading}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 transition shadow-md disabled:opacity-50"
          >
            {closing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Encerrando...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Confirmar Fechamento
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
