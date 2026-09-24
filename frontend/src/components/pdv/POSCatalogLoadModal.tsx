'use client';

import { useState } from 'react';
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
  ShieldAlert
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
}

export default function POSCatalogLoadModal({
  isOpen,
  onClose,
  onCatalogUpdated,
  currentCatalogCount
}: POSCatalogLoadModalProps) {
  const [activeTab, setActiveTab] = useState<'consignment' | 'cronuz' | 'spreadsheet'>('consignment');
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [loadReport, setLoadReport] = useState<{
    sourceName: string;
    validCount: number;
    duplicateCount: number;
    zeroPriceCount: number;
    duplicateSample?: string[];
    zeroPriceSample?: string[];
  } | null>(null);

  // Consignment state
  const [consignmentCustomerId, setConsignmentCustomerId] = useState('');
  const [consignmentDoc, setConsignmentDoc] = useState('');
  const [consignmentCodCtr, setConsignmentCodCtr] = useState('');

  // Spreadsheet state
  const [file, setFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  function processLoadOutcome(
    sourceName: string,
    serverData: any,
    localSaveRes: { savedCount: number; duplicateCount: number; zeroPriceCount: number }
  ) {
    const totalDuplicates = (serverData.duplicate_count || 0) + (localSaveRes.duplicateCount || 0);
    const totalZeroPrice = (serverData.zero_price_count || 0) + (localSaveRes.zeroPriceCount || 0);
    const validCount = localSaveRes.savedCount;

    const report = {
      sourceName,
      validCount,
      duplicateCount: totalDuplicates,
      zeroPriceCount: totalZeroPrice,
      duplicateSample: serverData.duplicate_sample || [],
      zeroPriceSample: serverData.zero_price_sample || [],
    };

    setLoadReport(report);

    if (validCount === 0 && (totalDuplicates > 0 || totalZeroPrice > 0)) {
      toast.error(`Nenhum item válido importado de ${sourceName}. Verifique se há produtos com preço preenchido.`);
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

  async function handleLoadFromCronuz() {
    if (!companyId) return;
    try {
      setLoading(true);
      setProgressMsg('Buscando catálogo no servidor...');
      const token = getToken();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/catalog-load?source=CRONUZ_CATALOG&limit=5000`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao buscar catálogo');
      }

      const data = await res.json();
      setProgressMsg(`Salvando ${data.items.length} itens no banco offline...`);
      const saveRes = await saveCatalogItems(data.items);
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
    if (!consignmentCustomerId) {
      toast.error('Informe o ID do cliente da consignação');
      return;
    }
    try {
      setLoading(true);
      setProgressMsg('Consultando contrato de consignação no Horus...');
      const token = getToken();

      let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/catalog-load?source=CONSIGNMENT&customer_id=${consignmentCustomerId}`;
      if (consignmentCodCtr) {
        url += `&cod_ctr=${encodeURIComponent(consignmentCodCtr)}`;
      }

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao carregar itens da consignação');
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        if ((data.zero_price_count || 0) > 0 || (data.duplicate_count || 0) > 0) {
          processLoadOutcome('Consignação Horus', data, { savedCount: 0, duplicateCount: 0, zeroPriceCount: 0 });
          return;
        }
        toast.warning('Nenhum item consignado encontrado neste contrato/cliente.');
        return;
      }

      setProgressMsg(`Salvando ${data.items.length} itens consignados no PDV offline...`);
      const saveRes = await saveCatalogItems(data.items);
      const newCount = await getCatalogCount();
      onCatalogUpdated(newCount);
      processLoadOutcome('Consignação Horus', data, saveRes);
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
      setProgressMsg('Enviando e processando planilha...');
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);

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
      setProgressMsg(`Gravando ${data.items.length} produtos na memória local...`);
      const saveRes = await saveCatalogItems(data.items);
      const newCount = await getCatalogCount();
      onCatalogUpdated(newCount);
      processLoadOutcome('Planilha Excel/CSV', data, saveRes);
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
                    Ideal para eventos e feiras: busca todos os itens, saldos e preços autorizados de um contrato de consignação aberto no Horus.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      ID do Cliente no Cronuz / Horus *
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 142"
                      value={consignmentCustomerId}
                      onChange={(e) => setConsignmentCustomerId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Número do Contrato Horus (Opcional - se vazio busca o ativo)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 5042"
                      value={consignmentCodCtr}
                      onChange={(e) => setConsignmentCodCtr(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <button
                    onClick={handleLoadFromConsignment}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Carregar Itens da Consignação
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
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
                    Importe uma planilha Excel (.xlsx) ou CSV com as colunas: <strong>ISBN / Código de Barras</strong>, <strong>Título</strong>, <strong>Preço</strong> e <strong>Estoque</strong>.
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
