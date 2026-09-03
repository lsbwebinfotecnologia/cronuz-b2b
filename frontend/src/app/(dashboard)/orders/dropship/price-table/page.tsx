'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Trash2, AlertTriangle, CheckCircle2,
  FileSpreadsheet, Search, RefreshCw, Loader2,
  CalendarClock, Tag, PackageSearch, X, BookOpen,
  ShieldAlert, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface PriceTableItem {
  id: number;
  isbn: string;
  titulo: string | null;
  desconto: number;
  data_validade: string;
  vencido: boolean;
  created_at: string | null;
  erdos_credential_id: number | null;
}

interface UploadResult {
  importados: number;
  erros: number;
  detalhes_erros: { linha: number; isbn?: string; erro: string }[];
}

interface ErdosCredential {
  id: number;
  label: string;
  horus_customer_name: string | null;
  is_primary: boolean;
  is_active: boolean;
}

export default function DropshipPriceTablePage() {
  const user = getUser();
  const companyId = user?.company_id;

  const [items, setItems] = useState<PriceTableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seletor de credencial
  const [credentials, setCredentials] = useState<ErdosCredential[]>([]);
  const [selectedCredId, setSelectedCredId] = useState<number | null>(null);

  const PAGE_SIZE = 25;

  const fetchCredentials = useCallback(async () => {
    if (!companyId) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/config/${companyId}/credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: ErdosCredential[] = await res.json();
        setCredentials(data.filter(c => c.is_active));
        // Pré-seleciona a primária
        const primary = data.find(c => c.is_primary && c.is_active);
        if (primary) setSelectedCredId(primary.id);
        else if (data.length > 0) setSelectedCredId(data[0].id);
      }
    } catch { /* silencioso */ }
  }, [companyId]);

  const fetchItems = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const credParam = selectedCredId ? `?erdos_credential_id=${selectedCredId}` : '';
      const res = await fetch(`${API_URL}/dropship/price-table/${companyId}${credParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: PriceTableItem[] = await res.json();
        setItems(data);
      }
    } catch {
      toast.error('Erro ao carregar tabela de preços.');
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedCredId]);

  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleUpload = async (file: File) => {
    if (!companyId) return;
    if (!selectedCredId) {
      toast.error('Selecione uma credencial Erdos antes de fazer o upload.');
      return;
    }
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      toast.error('Formato inválido. Use .xlsx ou .csv');
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(
        `${API_URL}/dropship/price-table/${companyId}/upload?erdos_credential_id=${selectedCredId}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      const data: UploadResult = await res.json();
      if (res.ok) {
        setUploadResult(data);
        if (data.importados > 0) {
          toast.success(`${data.importados} item(s) importado(s) com sucesso!`);
        }
        if (data.erros > 0) {
          toast.warning(`${data.erros} linha(s) com erro na importação.`);
        }
        fetchItems();
      } else {
        toast.error(`Erro no upload: ${(data as any).detail || 'Erro desconhecido'}`);
      }
    } catch {
      toast.error('Erro de conexão ao fazer upload.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (id: number) => {
    if (!companyId) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/price-table/${companyId}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        toast.success('Item removido.');
      }
    } catch {
      toast.error('Erro ao remover item.');
    }
  };

  const handleClearAll = async () => {
    if (!companyId || !confirm('Tem certeza? Isso removerá TODOS os itens da tabela de preços.')) return;
    setClearing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/price-table/${companyId}/clear/all`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.removidos} item(s) removido(s).`);
        setItems([]);
        setUploadResult(null);
      }
    } catch {
      toast.error('Erro ao limpar tabela.');
    } finally {
      setClearing(false);
    }
  };

  const filtered = items.filter(i =>
    !search ||
    i.isbn.includes(search) ||
    (i.titulo || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(currentPage, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const validCount   = items.filter(i => !i.vencido).length;
  const expiredCount = items.filter(i => i.vencido).length;

  const formatDate = (d: string) => {
    try {
      const [y, m, day] = d.split('T')[0].split('-');
      return `${day}/${m}/${y}`;
    } catch { return d; }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-gradient-to-r from-violet-600/5 to-purple-600/5 dark:from-violet-900/20 dark:to-purple-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
              <Tag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Tabela de Preços — Dropship</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Descontos por ISBN aplicados ao pedido de Venda (CFOP 6.118)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchItems}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all"
              >
                {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Limpar Tabela
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 flex-1">

        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40 rounded-2xl p-4"
        >
          <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
          <div className="text-xs text-violet-700 dark:text-violet-300 space-y-1">
            <p className="font-semibold">Como funciona</p>
            <p>
              Ao enviar um pedido ao Hórus, o sistema verifica se o ISBN do item está nesta tabela com validade futura.
              Se encontrado, aplica o desconto sobre o preço de capa (<span className="font-mono">VLR_LIQUIDO = vlr_capa × (1 − desconto%)</span>) no pedido de <strong>Venda (6.118)</strong>.
              Se não encontrado ou vencido, o <span className="font-mono">VLR_LIQUIDO</span> não é enviado.
            </p>
            <p className="text-violet-500 dark:text-violet-400">
              ⚠ Esta regra <strong>não afeta</strong> o pedido de Remessa (6.923).
            </p>
          </div>
        </motion.div>

        {/* Estatísticas rápidas */}
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-3 gap-3"
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{items.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Total de ISBNs</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{validCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ativos (dentro da validade)</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-500 dark:text-amber-400">{expiredCount}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Vencidos</p>
            </div>
          </motion.div>
        )}

        {/* Upload Zone */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Importar Planilha</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Arraste ou selecione um arquivo <span className="font-mono">.xlsx</span> ou <span className="font-mono">.csv</span>
            </p>
          </div>
          <div className="p-5 space-y-4">

            {/* Estrutura esperada */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Colunas esperadas na planilha:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { col: 'isbn', req: true, desc: 'ISBN/EAN do produto' },
                  { col: 'titulo', req: false, desc: 'Título (referência)' },
                  { col: 'desconto', req: true, desc: 'Percentual ex: 15 = 15%' },
                  { col: 'data_validade', req: true, desc: 'dd/mm/aaaa ou aaaa-mm-dd' },
                ].map(c => (
                  <div key={c.col} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">{c.col}</span>
                    {c.req && <span className="text-[9px] text-rose-500 font-bold">*</span>}
                    <span className="text-[10px] text-slate-400">{c.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Seletor de Credencial */}
            {credentials.length > 0 ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Credencial Erdos *
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Selecione o CNPJ/token ao qual esta tabela de preços pertence
                </p>
                <div className="flex flex-wrap gap-2">
                  {credentials.map(cred => (
                    <button
                      key={cred.id}
                      type="button"
                      onClick={() => setSelectedCredId(cred.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selectedCredId === cred.id
                          ? 'bg-violet-600 border-violet-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-violet-400'
                      }`}
                    >
                      {cred.label}
                      {cred.is_primary && <span className="ml-1 opacity-70">⭐</span>}
                    </button>
                  ))}
                </div>
                {!selectedCredId && (
                  <p className="text-[11px] text-rose-500 mt-1">Selecione uma credencial antes de importar.</p>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Nenhuma credencial Erdos ativa. Acesse <strong>Configurações → Dropship</strong> para criar.
                </p>
              </div>
            )}

            {/* Drag & Drop area */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-10 cursor-pointer transition-all ${
                dragOver
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-violet-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                  <p className="text-sm font-medium text-violet-600 dark:text-violet-400">Importando planilha...</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Arraste a planilha aqui
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">ou clique para selecionar o arquivo</p>
                  </div>
                  <span className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Selecionar Arquivo
                  </span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Resultado do upload */}
            <AnimatePresence>
              {uploadResult && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    uploadResult.erros === 0
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40'
                  }`}>
                    {uploadResult.erros === 0
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    }
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      <strong>{uploadResult.importados}</strong> importado(s)
                      {uploadResult.erros > 0 && <> · <strong className="text-amber-600">{uploadResult.erros}</strong> com erro</>}
                    </p>
                    <button onClick={() => setUploadResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {uploadResult.detalhes_erros.length > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/40 rounded-xl p-3 max-h-32 overflow-y-auto">
                      {uploadResult.detalhes_erros.map((e, i) => (
                        <p key={i} className="text-[10px] text-rose-700 dark:text-rose-400">
                          Linha {e.linha}{e.isbn ? ` (${e.isbn})` : ''}: {e.erro}
                        </p>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Tabela de itens */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">ISBNs Cadastrados</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {filtered.length} item(s){search ? ' encontrado(s)' : ' na tabela'}
                {filtered.length > 0 && (
                  <span className="ml-1 text-slate-400">
                    &mdash; pág. {safePage} de {totalPages}
                  </span>
                )}
              </p>
            </div>
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                placeholder="Buscar ISBN ou título..."
                className="pl-8 pr-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 w-52"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <PackageSearch className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {search ? 'Nenhum item encontrado' : 'Tabela vazia — importe uma planilha'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 px-5 py-3">ISBN</th>
                      <th className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 px-4 py-3">Título</th>
                      <th className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 px-4 py-3">Desconto</th>
                      <th className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 px-4 py-3">Validade</th>
                      <th className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400 px-4 py-3">Status</th>
                      <th className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400 px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {paginated.map(item => (
                      <tr key={item.id} className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${item.vencido ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{item.isbn}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-[220px] truncate">{item.titulo || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs font-bold rounded-lg border border-violet-200 dark:border-violet-800/40">
                            {item.desconto}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="flex items-center justify-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                            <CalendarClock className="w-3 h-3" />
                            {formatDate(item.data_validade)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.vencido ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-semibold rounded-lg border border-amber-200 dark:border-amber-800/40">
                              <ShieldAlert className="w-3 h-3" />
                              Vencido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                              <CheckCircle2 className="w-3 h-3" />
                              Ativo
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                            title="Remover item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Controles de Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                  {/* Info */}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exibindo{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}
                    </span>
                    {' '}de{' '}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{filtered.length}</span>
                    {' '}itens
                  </p>

                  {/* Botões */}
                  <div className="flex items-center gap-1">
                    {/* Anterior */}
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* Números de página */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                      .reduce<(number | '...')[]>((acc, p, i, arr) => {
                        if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === '...' ? (
                          <span key={`ellipsis-${i}`} className="px-1.5 text-xs text-slate-400">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p as number)}
                            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition-all ${
                              safePage === p
                                ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )
                    }

                    {/* Próximo */}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
