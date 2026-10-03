'use client';

import { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  X, 
  Loader2, 
  Download, 
  Search, 
  Calendar, 
  Store, 
  CreditCard,
  Barcode,
  ShoppingBag,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { POSSessionData } from './POSSessionModal';

interface POSReportItemRow {
  id: number;
  sale_id: number;
  sale_number: string;
  sold_at: string;
  sold_at_iso?: string;
  session_id?: number;
  session_name: string;
  barcode: string;
  sku: string;
  title: string;
  publisher: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: string;
  customer_name: string;
  customer_document: string;
}

interface POSReportKPIs {
  total_sales: number;
  total_items: number;
  total_amount: number;
  by_payment: Record<string, { count: number; total: number }>;
}

interface POSSalesReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: POSSessionData | null;
}

export default function POSSalesReportModal({
  isOpen,
  onClose,
  activeSession,
}: POSSalesReportModalProps) {
  const [sessions, setSessions] = useState<POSSessionData[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  
  const [loadingData, setLoadingData] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [kpis, setKpis] = useState<POSReportKPIs | null>(null);
  const [rows, setRows] = useState<POSReportItemRow[]>([]);

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  useEffect(() => {
    if (isOpen && companyId) {
      fetchSessions();
      if (activeSession) {
        setSelectedSessionId(String(activeSession.id));
      } else {
        setSelectedSessionId('');
      }
      // Padrão: data de hoje
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
      // Carrega dados iniciais
      loadReportData({
        session_id: activeSession ? String(activeSession.id) : '',
        start_date: today,
        end_date: today,
        payment_method: '',
      });
    }
  }, [isOpen, companyId]);

  async function fetchSessions() {
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function buildQueryParams(overrideFormat?: string) {
    const params = new URLSearchParams();
    if (selectedSessionId) params.append('session_id', selectedSessionId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (paymentMethod) params.append('payment_method', paymentMethod);
    params.append('format', overrideFormat || 'json');
    return params.toString();
  }

  async function loadReportData(customFilters?: { session_id?: string; start_date?: string; end_date?: string; payment_method?: string }) {
    try {
      setLoadingData(true);
      const token = getToken();
      
      const sId = customFilters?.session_id !== undefined ? customFilters.session_id : selectedSessionId;
      const sDate = customFilters?.start_date !== undefined ? customFilters.start_date : startDate;
      const eDate = customFilters?.end_date !== undefined ? customFilters.end_date : endDate;
      const pMethod = customFilters?.payment_method !== undefined ? customFilters.payment_method : paymentMethod;

      const params = new URLSearchParams();
      if (sId) params.append('session_id', sId);
      if (sDate) params.append('start_date', sDate);
      if (eDate) params.append('end_date', eDate);
      if (pMethod) params.append('payment_method', pMethod);
      params.append('format', 'json');

      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/reports/sales?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar relatório');
      }

      const data = await res.json();
      setKpis(data.kpis);
      setRows(data.rows || []);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar dados do relatório');
    } finally {
      setLoadingData(false);
    }
  }

  async function downloadReport(exportFormat: 'excel' | 'pdf') {
    try {
      if (exportFormat === 'excel') setDownloadingExcel(true);
      if (exportFormat === 'pdf') setDownloadingPdf(true);

      const token = getToken();
      const params = buildQueryParams(exportFormat);
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/reports/sales?${params}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error(`Falha ao gerar arquivo ${exportFormat.toUpperCase()}`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      a.download = `relatorio_itens_pdv_${timestamp}.${exportFormat === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast.success(`Relatório em ${exportFormat.toUpperCase()} baixado com sucesso!`);
    } catch (err: any) {
      toast.error(err.message || `Erro ao baixar relatório em ${exportFormat}`);
    } finally {
      if (exportFormat === 'excel') setDownloadingExcel(false);
      if (exportFormat === 'pdf') setDownloadingPdf(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Relatório Analítico de Itens Vendidos (PDV)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consolidação detalhada de itens com ISBN, valor, forma de pagamento e sessão
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Exportar Excel */}
            <button
              onClick={() => downloadReport('excel')}
              disabled={downloadingExcel || loadingData}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
            >
              {downloadingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              Excel (.xlsx)
            </button>

            {/* Exportar PDF */}
            <button
              onClick={() => downloadReport('pdf')}
              disabled={downloadingPdf || loadingData}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
            >
              {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              PDF (.pdf)
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Barra de Filtros */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Sessão / Evento
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Todas as Sessões</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Todos</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="PIX">PIX</option>
                  <option value="DEBITO">Débito</option>
                  <option value="CREDITO">Crédito</option>
                  <option value="MISTO">Misto</option>
                </select>
              </div>

              <button
                onClick={() => loadReportData()}
                disabled={loadingData}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 flex items-center justify-center gap-1.5 transition self-end h-[38px]"
              >
                {loadingData ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Filtrar
              </button>
            </div>
          </div>

          {/* Cards de KPIs */}
          {kpis && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vendas Realizadas</span>
                  <p className="text-xl font-black text-slate-900 dark:text-white">
                    {kpis.total_sales}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Barcode className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Volume de Itens</span>
                  <p className="text-xl font-black text-slate-900 dark:text-white">
                    {kpis.total_items} un
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Faturamento Total</span>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    R$ {Number(kpis.total_amount || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabela de Itens Vendidos (Mobile-First com overflow-x-auto) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Itens Analíticos ({rows.length} registros)
              </h3>
            </div>

            {loadingData ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
                <p className="text-xs font-semibold">Carregando itens vendidos...</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                Nenhum item vendido encontrado para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3.5 py-3 text-center">Data/Hora</th>
                      <th className="px-3.5 py-3 text-center">Venda</th>
                      <th className="px-3.5 py-3">Sessão</th>
                      <th className="px-3.5 py-3 text-center">ISBN / Cód.</th>
                      <th className="px-3.5 py-3">Título do Produto</th>
                      <th className="px-3.5 py-3 text-center">Qtd</th>
                      <th className="px-3.5 py-3 text-right">Vlr Unit</th>
                      <th className="px-3.5 py-3 text-right">Total</th>
                      <th className="px-3.5 py-3 text-center">Pagamento</th>
                      <th className="px-3.5 py-3">Cliente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="px-3.5 py-2.5 text-center text-[11px] text-slate-500">
                          {row.sold_at}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-bold text-slate-900 dark:text-white">
                          {row.sale_number}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {row.session_name}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                          {row.barcode || '-'}
                        </td>
                        <td className="px-3.5 py-2.5 max-w-xs truncate" title={row.title}>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {row.title}
                          </span>
                          {row.publisher && (
                            <span className="block text-[10px] text-slate-400">
                              {row.publisher}
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-bold">
                          {row.quantity}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-medium">
                          R$ {row.unit_price.toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          R$ {row.total_price.toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {row.payment_method}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-[11px]">
                          <span className="font-medium text-slate-900 dark:text-white">
                            {row.customer_name}
                          </span>
                          {row.customer_document && (
                            <span className="block text-[10px] text-slate-400">
                              {row.customer_document}
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

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <p className="text-xs text-slate-500">
            Exportações formatadas com fórmulas e totalizadores automáticos.
          </p>
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
