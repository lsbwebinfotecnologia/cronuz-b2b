'use client';

import { useState, useEffect } from 'react';
import { 
  Database, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Loader2, 
  Trash2, 
  RefreshCw,
  X,
  FileCheck,
  ArrowRight,
  ShieldAlert,
  Download,
  Search
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { 
  saveCatalogItems, 
  clearCatalog, 
  getCatalogCount, 
  PDVCatalogItem 
} from '@/lib/pdvIndexedDb';

interface POSCatalogLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCatalogUpdated: (count: number) => void;
  currentCatalogCount: number;
  activeSessionId?: number;
  activeSessionTitle?: string;
}

export default function POSCatalogLoadModal({
  isOpen,
  onClose,
  onCatalogUpdated,
  currentCatalogCount,
  activeSessionId,
  activeSessionTitle
}: POSCatalogLoadModalProps) {
  const [activeTab, setActiveTab] = useState<'consignment' | 'cronuz' | 'spreadsheet'>('consignment');
  const [loading, setLoading] = useState(false);
  const [validatingContract, setValidatingContract] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [loadReport, setLoadReport] = useState<{
    sourceName: string;
    validCount: number;
    duplicateCount: number;
    zeroPriceCount: number;
    zeroStockCount?: number;
    duplicateSample?: string[];
    zeroPriceSample?: string[];
  } | null>(null);

  // Consignment state
  const [consignmentCustomerId, setConsignmentCustomerId] = useState('');
  const [consignmentDoc, setConsignmentDoc] = useState('');
  const [consignmentCodCtr, setConsignmentCodCtr] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [validatedContracts, setValidatedContracts] = useState<{
    valid: boolean;
    message: string;
    customer_name?: string;
    customer_document?: string;
    contracts: {
      cod_ctr: string;
      dat_emissao?: string;
      sta_contrato?: string;
      saldo_itens?: number;
      vlr_total_liquido?: number;
      nom_cli?: string;
    }[];
  } | null>(null);

  // Spreadsheet state
  const [file, setFile] = useState<File | null>(null);

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  useEffect(() => {
    if (!isOpen || !customerSearchTerm || customerSearchTerm.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearchingCustomers(true);
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers?search=${encodeURIComponent(customerSearchTerm.trim())}&limit=8`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.items || []);
          setCustomerResults(list);
        }
      } catch {
        // Silencioso
      } finally {
        setSearchingCustomers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchTerm, isOpen]);

  if (!isOpen) return null;

  function processLoadOutcome(
    sourceName: string,
    serverData: any,
    localSaveRes: { savedCount: number; duplicateCount: number; zeroPriceCount: number }
  ) {
    const totalDuplicates = (serverData.duplicate_count || 0) + (localSaveRes.duplicateCount || 0);
    const totalZeroPrice = (serverData.zero_price_count || 0) + (localSaveRes.zeroPriceCount || 0);
    const totalZeroStock = serverData.zero_stock_count || 0;
    const validCount = localSaveRes.savedCount;

    const report = {
      sourceName,
      validCount,
      duplicateCount: totalDuplicates,
      zeroPriceCount: totalZeroPrice,
      zeroStockCount: totalZeroStock,
      duplicateSample: serverData.duplicate_sample || [],
      zeroPriceSample: serverData.zero_price_sample || [],
    };

    setLoadReport(report);

    if (validCount === 0 && (totalDuplicates > 0 || totalZeroPrice > 0 || totalZeroStock > 0)) {
      toast.error(`Nenhum item válido importado de ${sourceName}. Verifique se há produtos com saldo e preço preenchido.`);
      return;
    }

    if (totalDuplicates > 0 && totalZeroPrice > 0) {
      toast.warning(
        `Importados ${validCount} produtos únicos. ${totalDuplicates} duplicados ignorados e ${totalZeroPrice} com preço zerado descartados.`
      );
    } else if (totalDuplicates > 0) {
      toast.warning(
        `Importados ${validCount} produtos únicos. ${totalDuplicates} com ISBN duplicado foram ignorados.`
      );
    } else if (totalZeroPrice > 0) {
      toast.warning(
        `Importados ${validCount} produtos. ${totalZeroPrice} com preço zerado foram ignorados.`
      );
    } else {
      toast.success(`${validCount} produtos carregados com sucesso no PDV offline!`);
    }
  }

  async function handleValidateConsignment() {
    if (!companyId) return;
    if (!consignmentCustomerId.trim() && !consignmentDoc.trim()) {
      toast.error('Informe o ID/Código do cliente ou o CPF/CNPJ para validar os contratos no Horus.');
      return;
    }
    try {
      setValidatingContract(true);
      setValidatedContracts(null);
      const token = getToken();
      const params = new URLSearchParams();
      if (consignmentCustomerId.trim()) params.set('customer_id', consignmentCustomerId.trim());
      if (consignmentDoc.trim()) params.set('customer_doc', consignmentDoc.trim());
      if (consignmentCodCtr.trim()) params.set('cod_ctr', consignmentCodCtr.trim());
      if (activeSessionId) params.set('session_id', String(activeSessionId));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/consignment-validate?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível validar o contrato no Horus.');
      }
      setValidatedContracts(data);
      if (data.customer_document && !consignmentDoc) {
        setConsignmentDoc(data.customer_document);
      }
      if (data.valid && data.contracts?.length > 0) {
        if (!consignmentCodCtr && data.contracts.length === 1 && data.contracts[0].cod_ctr) {
          setConsignmentCodCtr(String(data.contracts[0].cod_ctr));
        }
        toast.success(data.message || 'Contrato validado com sucesso no Horus!');
      } else {
        toast.warning(data.message || 'Nenhum contrato ativo encontrado para este cliente no Horus.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao validar contrato no Horus');
    } finally {
      setValidatingContract(false);
    }
  }

  async function handleDownloadTemplate() {
    if (!companyId) return;
    try {
      setDownloadingTemplate(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/spreadsheet-template`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        throw new Error('Falha ao baixar planilha modelo');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo_carga_pdv.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Planilha modelo (com coluna Editora) baixada com sucesso!');
    } catch {
      // Fallback local em CSV caso esteja sem conexão com o backend
      const csvContent = '\uFEFFISBN;Título;Editora;Preço;Estoque\n9788535914849;1984;Companhia das Letras;59,90;25\n9788595081512;Sapiens: Uma Breve História da Humanidade;HarperCollins;69,90;15\n';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo_carga_pdv.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Planilha modelo (.csv) baixada!');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleLoadFromCronuz() {
    if (!companyId) return;
    try {
      setLoading(true);
      setProgressMsg('Buscando catálogo no servidor...');
      const token = getToken();

      let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/catalog-load?source=CRONUZ_CATALOG&limit=5000`;
      if (activeSessionId) {
        url += `&session_id=${activeSessionId}`;
      }

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao buscar catálogo');
      }

      const data = await res.json();
      await clearCatalog();
      setProgressMsg(`Salvando ${data.items.length} itens no banco offline...`);
      const saveRes = await saveCatalogItems(data.items, {
        company_id: Number(companyId),
        session_id: activeSessionId,
      });
      const newCount = await getCatalogCount();
      onCatalogUpdated(newCount);
      processLoadOutcome('Catálogo Geral', data, saveRes);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar catálogo');
    } finally {
      setLoading(false);
      setProgressMsg('');
    }
  }

  async function handleLoadFromConsignment() {
    if (!companyId) return;
    if (!consignmentCustomerId.trim() && !consignmentDoc.trim()) {
      toast.error('Informe o ID/Código do cliente ou o CPF/CNPJ para buscar os itens do contrato no Horus');
      return;
    }
    try {
      setLoading(true);
      setProgressMsg('Validando e consultando itens do contrato de consignação no Horus...');
      const token = getToken();

      const params = new URLSearchParams({ source: 'CONSIGNMENT' });
      if (consignmentCustomerId.trim()) {
        params.set('customer_id', consignmentCustomerId.trim());
      }
      if (consignmentDoc.trim()) {
        params.set('customer_doc', consignmentDoc.trim());
      }
      if (consignmentCodCtr.trim()) {
        params.set('cod_ctr', consignmentCodCtr.trim());
      }
      if (activeSessionId) {
        params.set('session_id', String(activeSessionId));
      }

      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/catalog-load?${params.toString()}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao carregar itens da consignação');
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        if ((data.zero_price_count || 0) > 0 || (data.duplicate_count || 0) > 0 || (data.zero_stock_count || 0) > 0) {
          processLoadOutcome('Consignação Horus', data, { savedCount: 0, duplicateCount: 0, zeroPriceCount: 0 });
          return;
        }
        toast.warning('Nenhum item consignado com saldo disponível encontrado neste contrato/cliente.');
        return;
      }

      await clearCatalog();
      setProgressMsg(`Salvando ${data.items.length} itens consignados no PDV offline...`);
      const saveRes = await saveCatalogItems(data.items, {
        company_id: Number(companyId),
        session_id: activeSessionId,
      });
      const newCount = await getCatalogCount();
      onCatalogUpdated(newCount);
      processLoadOutcome(`Consignação Horus${data.cod_ctr ? ` (#${data.cod_ctr})` : ''}`, data, saveRes);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar consignação');
    } finally {
      setLoading(false);
      setProgressMsg('');
    }
  }

  async function handleUploadSpreadsheet() {
    if (!companyId) return;
    if (!file) {
      toast.error('Selecione uma planilha .xlsx ou .csv');
      return;
    }

    try {
      setLoading(true);
      setProgressMsg('Enviando e processando planilha no servidor...');
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);
      if (activeSessionId) {
        formData.append('session_id', String(activeSessionId));
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/upload-spreadsheet`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao processar planilha');
      }

      const data = await res.json();
      const totalCount = data.total_count || data.count || 0;

      if (totalCount === 0) {
        processLoadOutcome('Planilha Excel/CSV', data, { savedCount: 0, duplicateCount: 0, zeroPriceCount: 0 });
        return;
      }

      // Esvaziar catálogo local antigo para dar lugar à nova carga
      await clearCatalog();

      let totalSaved = 0;
      let totalDuplicates = data.duplicate_count || 0;
      let totalZeroPrice = data.zero_price_count || 0;

      // 1. Caso planilha pequena (<= 5.000 produtos já retornados inline no POST)
      if (data.items && data.items.length > 0) {
        setProgressMsg(`Gravando ${data.items.length.toLocaleString('pt-BR')} produtos na memória local...`);
        const saveRes = await saveCatalogItems(data.items, {
          company_id: Number(companyId),
          session_id: activeSessionId,
        });
        totalSaved = saveRes.savedCount;
        totalDuplicates += saveRes.duplicateCount;
        totalZeroPrice += saveRes.zeroPriceCount;
      } else if (data.upload_id) {
        // 2. Caso planilha grande (ex: 250 mil produtos): Baixa em lotes de 10.000 itens
        const chunkSize = 10000;
        for (let offset = 0; offset < totalCount; offset += chunkSize) {
          const currentEnd = Math.min(offset + chunkSize, totalCount);
          const percent = Math.round((currentEnd / totalCount) * 100);
          setProgressMsg(`Importando produtos para o PDV offline... (${currentEnd.toLocaleString('pt-BR')} / ${totalCount.toLocaleString('pt-BR')} - ${percent}%)`);

          const chunkRes = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/upload-spreadsheet/${data.upload_id}/chunk?offset=${offset}&limit=${chunkSize}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (!chunkRes.ok) {
            const errChunk = await chunkRes.json();
            throw new Error(errChunk.detail || 'Falha ao baixar lote de produtos da planilha');
          }

          const chunkData = await chunkRes.json();
          const saveRes = await saveCatalogItems(chunkData.items || [], {
            company_id: Number(companyId),
            session_id: activeSessionId,
          });
          totalSaved += saveRes.savedCount;
          totalDuplicates += saveRes.duplicateCount;
          totalZeroPrice += saveRes.zeroPriceCount;
        }
      }

      const newCount = await getCatalogCount();
      onCatalogUpdated(newCount);
      processLoadOutcome('Planilha Excel/CSV', data, {
        savedCount: totalSaved,
        duplicateCount: totalDuplicates - (data.duplicate_count || 0),
        zeroPriceCount: totalZeroPrice - (data.zero_price_count || 0)
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload da planilha');
    } finally {
      setLoading(false);
      setProgressMsg('');
    }
  }

  async function handleClearLocalCatalog() {
    if (confirm('Deseja realmente limpar todos os produtos salvos no cache local do PDV?')) {
      await clearCatalog();
      onCatalogUpdated(0);
      toast.info('Catálogo local esvaziado.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Carga de Produtos (PDV Offline)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alimente a memória local do PDV para vendas rápidas sem internet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-6 py-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300">
          <span>Itens atualmente na memória local:</span>
          <span className="font-bold bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full">
            {currentCatalogCount} produtos
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-3 gap-2 bg-slate-50/50 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('consignment')}
            className={`pb-3 text-xs md:text-sm font-semibold border-b-2 px-2 transition ${
              activeTab === 'consignment'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Contrato Consignação
          </button>
          <button
            onClick={() => setActiveTab('cronuz')}
            className={`pb-3 text-xs md:text-sm font-semibold border-b-2 px-2 transition ${
              activeTab === 'cronuz'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Catálogo Geral Cronuz
          </button>
          <button
            onClick={() => setActiveTab('spreadsheet')}
            className={`pb-3 text-xs md:text-sm font-semibold border-b-2 px-2 transition ${
              activeTab === 'spreadsheet'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Planilha Excel / CSV
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loadReport ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Resultado da Carga: {loadReport.sourceName}
                </h3>
              </div>

              {/* Sucesso */}
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    {loadReport.validCount} produtos únicos carregados no PDV offline
                  </h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Estes itens estão salvos no banco local e prontos para busca instantânea e venda sem internet.
                  </p>
                </div>
              </div>

              {/* Alerta de Duplicados */}
              {loadReport.duplicateCount > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      {loadReport.duplicateCount} item(ns) com ISBN repetido ignorado(s)
                    </h4>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Para evitar duplicidade de estoque e produtos repetidos no PDV, o sistema manteve apenas o 1º registro de cada ISBN e desconsiderou as repetições.
                    </p>
                    {loadReport.duplicateSample && loadReport.duplicateSample.length > 0 && (
                      <p className="text-[10px] text-amber-800 dark:text-amber-300 mt-1 font-mono break-all">
                        Exemplos: {loadReport.duplicateSample.join(', ')}
                        {loadReport.duplicateCount > loadReport.duplicateSample.length ? '...' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Alerta de Preço Zerado */}
              {loadReport.zeroPriceCount > 0 && (
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                      {loadReport.zeroPriceCount} item(ns) com preço zerado (R$ 0,00) descartado(s)
                    </h4>
                    <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                      Itens sem preço ou com valor R$ 0,00 foram bloqueados para evitar divergência de caixa e vendas incorretas no PDV.
                    </p>
                    {loadReport.zeroPriceSample && loadReport.zeroPriceSample.length > 0 && (
                      <p className="text-[10px] text-rose-800 dark:text-rose-300 mt-1 font-mono break-all">
                        Exemplos: {loadReport.zeroPriceSample.join(', ')}
                        {loadReport.zeroPriceCount > loadReport.zeroPriceSample.length ? '...' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Alerta de Saldo Zerado */}
              {(loadReport.zeroStockCount || 0) > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    <strong>{loadReport.zeroStockCount}</strong> item(ns) do contrato estavam com saldo totalmente faturado/devolvido (saldo 0) e não foram incluídos.
                  </p>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 transition"
                >
                  <span>Concluir e Voltar ao PDV</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLoadReport(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition"
                >
                  Carregar Outro Lote
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'consignment' && (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                    Ideal para eventos e feiras: valida e busca todos os itens, editoras, saldos e preços autorizados de um contrato de consignação aberto no Horus.
                  </div>

                  {/* Busca rápida de cliente cadastrado */}
                  <div className="relative">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Pesquisar Cliente por Nome ou CNPJ/CPF
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Digite o nome da escola, parceiro ou CNPJ..."
                        value={customerSearchTerm}
                        onChange={(e) => setCustomerSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      {searchingCustomers && (
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500 absolute right-3 top-2.5" />
                      )}
                    </div>
                    {customerResults.length > 0 && (
                      <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg divide-y divide-slate-100 dark:divide-slate-700/60">
                        {customerResults.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setConsignmentCustomerId(String(c.id));
                              setConsignmentDoc(c.document || '');
                              setCustomerSearchTerm(c.name || c.corporate_name || '');
                              setCustomerResults([]);
                              setValidatedContracts(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition flex items-center justify-between text-xs"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {c.name || c.corporate_name}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 ml-2 shrink-0">
                              {c.document || `ID #${c.id}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        CPF / CNPJ do Cliente no Horus
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 12.345.678/0001-99"
                        value={consignmentDoc}
                        onChange={(e) => {
                          setConsignmentDoc(e.target.value);
                          setValidatedContracts(null);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Ou ID / Cód. Cliente (Cronuz / Horus)
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 142"
                        value={consignmentCustomerId}
                        onChange={(e) => {
                          setConsignmentCustomerId(e.target.value);
                          setValidatedContracts(null);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nº do Contrato Horus (Opcional - se vazio busca o ativo)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 5042"
                        value={consignmentCodCtr}
                        onChange={(e) => setConsignmentCodCtr(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleValidateConsignment}
                      disabled={validatingContract || loading}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 h-[38px]"
                    >
                      {validatingContract ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                      Validar Contrato
                    </button>
                  </div>

                  {/* Resultado da validação de contratos no Horus */}
                  {validatedContracts && (
                    <div
                      className={`p-3 rounded-xl border text-xs space-y-2 ${
                        validatedContracts.valid
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                          : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>
                          {validatedContracts.customer_name
                            ? `${validatedContracts.customer_name} (${validatedContracts.customer_document})`
                            : validatedContracts.message}
                        </span>
                        <span>{validatedContracts.contracts.length} contrato(s)</span>
                      </div>
                      {validatedContracts.contracts.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {validatedContracts.contracts.map((ctr) => (
                            <button
                              key={ctr.cod_ctr}
                              type="button"
                              onClick={() => setConsignmentCodCtr(String(ctr.cod_ctr))}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg border flex items-center justify-between transition ${
                                consignmentCodCtr === String(ctr.cod_ctr)
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-indigo-400'
                              }`}
                            >
                              <span className="font-mono font-bold">Contrato #{ctr.cod_ctr}</span>
                              <span className="text-[11px]">
                                Saldo: <strong>{ctr.saldo_itens ?? 0} un.</strong> • R${' '}
                                {Number(ctr.vlr_total_liquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleLoadFromConsignment}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Sincronizar Itens do Contrato
                  </button>
                </div>
              )}

              {activeTab === 'cronuz' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl text-xs text-blue-800 dark:text-blue-300">
                    Carrega todos os produtos ativos cadastrados no sistema Cronuz B2B da sua empresa para consulta e venda rápida.
                  </div>

                  <button
                    onClick={handleLoadFromCronuz}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Sincronizar Catálogo Geral para o PDV
                  </button>
                </div>
              )}

              {activeTab === 'spreadsheet' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      Importe uma planilha Excel (.xlsx) ou CSV com as colunas:{' '}
                      <strong>ISBN / Código de Barras</strong>, <strong>Título</strong>, <strong>Editora</strong>,{' '}
                      <strong>Preço</strong> e <strong>Estoque</strong>.
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      disabled={downloadingTemplate}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1.5 shadow-sm transition"
                    >
                      {downloadingTemplate ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Baixar Planilha Modelo (.xlsx)
                    </button>
                  </div>

                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-indigo-500 transition bg-slate-50 dark:bg-slate-800/50">
                    <input
                      type="file"
                      accept=".xlsx,.csv"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="spreadsheet-upload-input"
                    />
                    <label
                      htmlFor="spreadsheet-upload-input"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <FileSpreadsheet className="w-10 h-10 text-indigo-500" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {file ? file.name : 'Clique para selecionar a planilha'}
                      </span>
                      <span className="text-xs text-slate-400">Arquivos .xlsx ou .csv</span>
                    </label>
                  </div>

                  <button
                    onClick={handleUploadSpreadsheet}
                    disabled={loading || !file}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Importar Planilha no PDV
                  </button>
                </div>
              )}
            </>
          )}

          {progressMsg && (
            <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>{progressMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <button
            onClick={handleClearLocalCatalog}
            disabled={loading || currentCatalogCount === 0}
            className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar Catálogo Local
          </button>
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
