'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  Search, 
  Plus, 
  ArrowLeft, 
  RefreshCw, 
  Edit3, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Save, 
  Database, 
  Award, 
  Link2, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  UploadCloud,
  Download,
  X,
  FileText,
  Check,
  AlertTriangle
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';

interface DbmCompanyItem {
  id: number;
  name: string; // Apelido / Nome Fantasia
  razao_social?: string; // Razão Social
  document: string; // CNPJ / CPF
  city?: string;
  state?: string;
  group_name?: string;
  segment?: string;
  notes_message?: string;
  customer_account?: string;
  royalties_data?: string;
  is_cliente: boolean;
  is_fornecedor: boolean;
  horus_cod_cli?: number | null;
  horus_cod_fornecedor?: number | null;
  created_at?: string;
}

export default function DbmCompaniesSearchPage() {
  const router = useRouter();

  // Seller Context (Empresa logada)
  const [companyId, setCompanyId] = useState<number>(() => {
    const user = getUser();
    return user?.company_id || 4;
  });

  useEffect(() => {
    const freshUser = getUser();
    if (freshUser?.company_id) {
      setCompanyId(freshUser.company_id);
    }
  }, []);

  // Abas Principais (Menu | Localiza Empresas | Cadastro de Empresas)
  const [mainTab, setMainTab] = useState<'search' | 'form'>('search');

  // Filtros da aba Localiza Empresas
  const [searchTerm, setSearchTerm] = useState('');
  const [ufFilter, setUfFilter] = useState('');
  
  // Estado dos Dados na grade
  const [companies, setCompanies] = useState<DbmCompanyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Formulário de Cadastro / Edição da Empresa
  const emptyCompany: DbmCompanyItem = {
    id: 0,
    name: '',
    razao_social: '',
    document: '',
    city: '',
    state: 'SP',
    group_name: '',
    segment: 'Editoras',
    notes_message: '',
    customer_account: '',
    royalties_data: '',
    is_cliente: true,
    is_fornecedor: false,
    horus_cod_cli: null,
    horus_cod_fornecedor: null,
  };

  const [formData, setFormData] = useState<DbmCompanyItem>(emptyCompany);
  const [savingForm, setSavingForm] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Estados de consulta no Horus
  const [horusChecking, setHorusChecking] = useState(false);
  const [horusCheckMsg, setHorusCheckMsg] = useState<string | null>(null);

  // Estados de Importação Inteligente de Planilha Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'processing' | 'done'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsingLoading, setParsingLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [detectedCols, setDetectedCols] = useState<string[]>([]);

  // Progresso em tempo real do processamento
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [createdCount, setCreatedCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [importLogs, setImportLogs] = useState<string[]>([]);

  const ufList = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  // Máscara dinâmica CPF / CNPJ
  const formatDocument = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (clean.length <= 11) {
      return clean
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return clean
      .substring(0, 14)
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  // Busca de empresas no backend Cronuz
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setHasSearched(true);
    setSelectedIndex(-1);

    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.append('limit', '100');
      params.append('skip', '0');
      if (companyId) params.append('company_id', String(companyId));
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (ufFilter) params.append('uf', ufFilter);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dbm/companies?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const items: DbmCompanyItem[] = data.items || [];
        setCompanies(items);
        setTotalCount(data.total || items.length);
        if (items.length > 0) setSelectedIndex(0);
      } else {
        setCompanies([]);
        setTotalCount(0);
      }
    } catch (err) {
      console.error('Erro ao buscar empresas DBM:', err);
      setCompanies([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch();
  }, [companyId]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setUfFilter('');
    setCompanies([]);
    setHasSearched(false);
    setSelectedIndex(-1);
    handleSearch();
  };

  // Abrir tela de cadastro com os dados da empresa selecionada
  const handleOpenCompanyForm = (company: DbmCompanyItem) => {
    setFormData({
      ...company,
      razao_social: company.razao_social || company.name || '',
      city: company.city || '',
      state: company.state || 'SP',
      group_name: company.group_name || '',
      segment: company.segment || 'Editoras',
      notes_message: company.notes_message || '',
      customer_account: company.customer_account || '',
      royalties_data: company.royalties_data || '',
      is_cliente: company.is_cliente ?? true,
      is_fornecedor: company.is_fornecedor ?? false,
      horus_cod_cli: company.horus_cod_cli ?? null,
      horus_cod_fornecedor: company.horus_cod_fornecedor ?? null
    });
    setHorusCheckMsg(null);
    setSaveErrorMsg(null);
    setMainTab('form');
  };

  // Iniciar novo cadastro de empresa
  const handleNewCompany = () => {
    setFormData({ ...emptyCompany });
    setHorusCheckMsg(null);
    setSaveErrorMsg(null);
    setMainTab('form');
  };

  // Consulta e amarração inteligente com Horus ERP (CLIENTES e FORNECEDORES)
  const handleCheckHorusByDocument = async () => {
    if (!formData.document || !formData.document.trim()) {
      setHorusCheckMsg('Informe o CNPJ / CPF da empresa antes de consultar no Horus.');
      return;
    }
    setHorusChecking(true);
    setHorusCheckMsg(null);

    try {
      const token = getToken();
      const cleanDoc = formData.document.replace(/\D/g, '');
      const params = new URLSearchParams();
      if (companyId) params.append('company_id', String(companyId));
      params.append('document', cleanDoc);
      // Sempre busca em ambas as tabelas (clientes e fornecedores)
      params.append('check_cliente', 'true');
      params.append('check_fornecedor', 'true');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dbm/companies/horus-lookup?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const details: string[] = [];

        setFormData(prev => {
          const next = { ...prev };

          // Autopreenchimento de Cliente (Tabela CLIENTES)
          if (data.cliente?.found) {
            next.is_cliente = true;
            next.horus_cod_cli = data.cliente.cod_cli; // número puro sem 'H'
            if (data.cliente.nome_cli && (!next.razao_social || next.razao_social.trim() === '')) {
              next.razao_social = data.cliente.nome_cli;
            }
            // NÃO mudar o apelido quando sincronizar com o Horus se já preenchido
            if (!next.name || next.name.trim() === '') {
              next.name = data.cliente.nome_reduzido || data.cliente.nome_cli || '';
            }
            if (data.cliente.cidade && (!next.city || next.city.trim() === '')) {
              next.city = data.cliente.cidade;
            }
            if (data.cliente.uf && (!next.state || next.state.trim() === '' || next.state === 'SP')) {
              next.state = data.cliente.uf;
            }
            details.push(`Cliente COD_CLI #${data.cliente.cod_cli}`);
          }

          // Autopreenchimento de Fornecedor (Tabela FORNECEDORES com COD_FILIAL da API)
          if (data.fornecedor?.found) {
            next.is_fornecedor = true;
            next.horus_cod_fornecedor = data.fornecedor.cod_fornecedor; // número puro sem 'H'
            if (data.fornecedor.nom_fornecedor && (!next.razao_social || next.razao_social.trim() === '')) {
              next.razao_social = data.fornecedor.nom_fornecedor;
            }
            // NÃO mudar o apelido quando sincronizar com o Horus se já preenchido
            if (!next.name || next.name.trim() === '') {
              next.name = data.fornecedor.nom_fantasia || data.fornecedor.nom_fornecedor || '';
            }
            if (data.fornecedor.cidade && (!next.city || next.city.trim() === '')) {
              next.city = data.fornecedor.cidade;
            }
            if (data.fornecedor.uf && (!next.state || next.state.trim() === '' || next.state === 'SP')) {
              next.state = data.fornecedor.uf;
            }
            const filialInfo = data.filial_used ? ` (Filial ${data.filial_used})` : '';
            details.push(`Fornecedor COD_FORNECEDOR #${data.fornecedor.cod_fornecedor}${filialInfo}`);
          }

          return next;
        });

        if (details.length > 0) {
          setHorusCheckMsg(`✓ Vinculado no Horus com sucesso: ${details.join(' | ')}`);
        } else {
          setHorusCheckMsg('Nenhum registro encontrado no Horus para este CNPJ/CPF.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setHorusCheckMsg(err.detail || 'Falha ao pesquisar no banco do Horus.');
      }
    } catch {
      setHorusCheckMsg('Erro de conexão ao pesquisar no banco do Horus.');
    } finally {
      setHorusChecking(false);
    }
  };

  // Salvar Empresa no Cronuz (Valida se já existe, se não existir cadastra)
  const handleSaveCompany = async () => {
    if (!formData.name.trim()) {
      alert('Por favor, informe a Fantasia (apelido).');
      return;
    }
    if (!formData.document.trim()) {
      alert('Por favor, informe o CNPJ / CPF.');
      return;
    }

    setSavingForm(true);
    setSaveErrorMsg(null);

    try {
      const token = getToken();
      const cleanDoc = formData.document.replace(/\D/g, '');

      const payload = {
        id: formData.id > 0 ? formData.id : null,
        seller_company_id: companyId || 4,
        document: cleanDoc,
        name: formData.name.trim(),
        razao_social: formData.razao_social?.trim() || formData.name.trim(),
        city: formData.city?.trim() || null,
        state: formData.state?.trim().toUpperCase() || null,
        group_name: formData.group_name?.trim() || null,
        segment: formData.segment?.trim() || null,
        notes_message: formData.notes_message?.trim() || null,
        customer_account: formData.customer_account?.trim() || null,
        royalties_data: formData.royalties_data?.trim() || null,
        is_cliente: formData.is_cliente,
        is_fornecedor: formData.is_fornecedor,
        horus_cod_cli: formData.horus_cod_cli ? Number(formData.horus_cod_cli) : null,
        horus_cod_fornecedor: formData.horus_cod_fornecedor ? Number(formData.horus_cod_fornecedor) : null
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dbm/companies`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        }
      );

      if (res.ok) {
        const result = await res.json();
        const saved = result.company;
        setFormData(prev => ({
          ...prev,
          id: saved.id,
          name: saved.name,
          razao_social: saved.razao_social,
          document: saved.document,
          city: saved.city || '',
          state: saved.state || 'SP',
          group_name: saved.group_name || '',
          segment: saved.segment || 'Editoras',
          notes_message: saved.notes_message || '',
          customer_account: saved.customer_account || '',
          royalties_data: saved.royalties_data || '',
          is_cliente: saved.is_cliente ?? true,
          is_fornecedor: saved.is_fornecedor ?? false,
          horus_cod_cli: saved.horus_cod_cli ?? null,
          horus_cod_fornecedor: saved.horus_cod_fornecedor ?? null
        }));

        setSaveSuccessMsg(true);
        setTimeout(() => setSaveSuccessMsg(false), 3500);

        // Atualiza a lista na grade
        handleSearch();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveErrorMsg(err.detail || 'Erro ao gravar empresa.');
      }
    } catch (err: any) {
      setSaveErrorMsg('Erro de conexão ao gravar os dados.');
    } finally {
      setSavingForm(false);
    }
  };

  // ── Handlers de Importação Inteligente de Planilha ─────────────────────────
  const handleOpenImportModal = () => {
    setIsImportModalOpen(true);
    setImportStep('upload');
    setSelectedFile(null);
    setParseError(null);
    setParsedRows([]);
    setPreviewRows([]);
    setDetectedCols([]);
    setImportLogs([]);
    setProcessingProgress(0);
    setProcessedCount(0);
    setCreatedCount(0);
    setUpdatedCount(0);
    setWarningCount(0);
  };

  const handleDownloadTemplate = () => {
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dbm/companies/import/template`;
    window.open(url, '_blank');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setParseError('O arquivo excede o limite máximo permitido de 10 MB.');
      setSelectedFile(null);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'csv', 'ods'].includes(ext || '')) {
      setParseError('Formato inválido. Selecione um arquivo Excel (.xlsx) ou CSV.');
      setSelectedFile(null);
      return;
    }

    setParseError(null);
    setSelectedFile(file);
  };

  const handleParseSheet = async () => {
    if (!selectedFile) {
      setParseError('Selecione uma planilha para continuar.');
      return;
    }

    setParsingLoading(true);
    setParseError(null);

    try {
      const token = getToken();
      const fd = new FormData();
      fd.append('file', selectedFile);
      if (companyId) fd.append('company_id', String(companyId));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dbm/companies/import/parse`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: fd
        }
      );

      if (res.ok) {
        const data = await res.json();
        setParsedRows(data.rows || []);
        setPreviewRows(data.preview || []);
        setDetectedCols(data.columns_detected || []);
        setImportStep('preview');
      } else {
        const err = await res.json().catch(() => ({}));
        setParseError(err.detail || 'Falha ao analisar a planilha. Verifique os cabeçalhos.');
      }
    } catch (err: any) {
      console.error('Erro ao fazer parse da planilha:', err);
      setParseError('Erro de conexão com o servidor ao processar arquivo.');
    } finally {
      setParsingLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!parsedRows || parsedRows.length === 0) return;

    setImportStep('processing');
    setProcessingProgress(0);
    setProcessedCount(0);
    setCreatedCount(0);
    setUpdatedCount(0);
    setWarningCount(0);
    setImportLogs([]);

    const token = getToken();
    const chunkSize = 10;
    const totalItems = parsedRows.length;
    let localProcessed = 0;
    let localCreated = 0;
    let localUpdated = 0;
    let localWarning = 0;

    for (let i = 0; i < totalItems; i += chunkSize) {
      const chunk = parsedRows.slice(i, i + chunkSize);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dbm/companies/import/process-batch`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              company_id: companyId || 4,
              seller_company_id: companyId || 4,
              items: chunk
            })
          }
        );

        if (res.ok) {
          const data = await res.json();
          const batchResults = data.results || [];

          for (const r of batchResults) {
            localProcessed += 1;
            if (r.action === 'CREATED') localCreated += 1;
            else if (r.action === 'UPDATED') localUpdated += 1;
            else localWarning += 1;

            const icon = r.status === 'SUCCESS' ? '✓' : r.status === 'WARNING' ? '⚠' : '✗';
            setImportLogs(prev => [
              `${icon} [Linha ${r.row_index}] ${r.message}`,
              ...prev.slice(0, 150)
            ]);
          }
        } else {
          localProcessed += chunk.length;
          localWarning += chunk.length;
          setImportLogs(prev => [
            `✗ Erro HTTP ${res.status} ao processar lote ${i + 1} a ${i + chunk.length}`,
            ...prev
          ]);
        }
      } catch (err: any) {
        localProcessed += chunk.length;
        localWarning += chunk.length;
        setImportLogs(prev => [
          `✗ Falha de conexão ao processar lote ${i + 1} a ${i + chunk.length}`,
          ...prev
        ]);
      }

      setProcessedCount(localProcessed);
      setCreatedCount(localCreated);
      setUpdatedCount(localUpdated);
      setWarningCount(localWarning);
      setProcessingProgress(Math.min(100, Math.round((localProcessed / totalItems) * 100)));
    }

    setImportStep('done');
  };

  const handleCloseModal = () => {
    setIsImportModalOpen(false);
    if (importStep === 'done') {
      handleSearch();
    }
  };

  // Navegação entre registros no formulário (|< < [ ] > >|)
  const handleNavigateRecord = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (companies.length === 0) return;
    let newIndex = selectedIndex;
    if (direction === 'first') newIndex = 0;
    if (direction === 'prev') newIndex = Math.max(0, selectedIndex - 1);
    if (direction === 'next') newIndex = Math.min(companies.length - 1, selectedIndex + 1);
    if (direction === 'last') newIndex = companies.length - 1;

    setSelectedIndex(newIndex);
    if (companies[newIndex]) {
      handleOpenCompanyForm(companies[newIndex]);
    }
  };

  return (
    <div className="space-y-4 pb-16">
      {/* ── Abas de Navegação Superiores (Estilo Access: Menu | Localiza Empresas | Cadastro de Empresas) ─ */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 p-1.5 rounded-2xl backdrop-blur-sm overflow-x-auto scrollbar-none">
        <button
          onClick={() => router.push('/dbm')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Menu
        </button>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <button
          onClick={() => setMainTab('search')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            mainTab === 'search'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          Localiza Empresas
        </button>

        <span className="text-slate-300 dark:text-slate-700">|</span>

        <button
          onClick={() => setMainTab('form')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
            mainTab === 'form'
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          Cadastro de Empresas {formData.id ? `(#${formData.id})` : '(Novo)'}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ABA 1: LOCALIZA EMPRESAS (FOLHA DE DADOS / GRID COM FILTROS)       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === 'search' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Localiza Empresas
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                  Folha de Dados
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenImportModal}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-100 hover:border-emerald-400 transition-colors dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Importar Planilha
                </button>
                <button
                  onClick={handleNewCompany}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nova Empresa
                </button>
              </div>
            </div>

            <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div className="lg:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Fantasia (apelido) / Razão Social / CNPJ / Cód. Horus
                </label>
                <input 
                  type="text"
                  placeholder="Pesquise por fantasia (apelido), razão social, CNPJ ou código Horus..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Estado (UF)
                </label>
                <select
                  value={ufFilter}
                  onChange={(e) => setUfFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Todos (*)</option>
                  {ufList.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Consultar
                </button>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 p-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  title="Limpar Filtros"
                >
                  Limpar
                </button>
              </div>
            </form>
          </div>

          {/* Tabela de Empresas */}
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800/90 dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/75 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3 w-16 text-center">Cód. Cronuz</th>
                    <th className="py-2.5 px-3 w-40">CNPJ / CPF</th>
                    <th className="py-2.5 px-3">Fantasia (apelido)</th>
                    <th className="py-2.5 px-3">Razão Social</th>
                    <th className="py-2.5 px-3 w-36">Cidade / UF</th>
                    <th className="py-2.5 px-3 w-36 text-center">Cód. Horus</th>
                    <th className="py-2.5 px-3 w-24 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Carregando empresas da base Cronuz...
                      </td>
                    </tr>
                  ) : companies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhuma empresa localizada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    companies.map((c, idx) => {
                      const isSelected = selectedIndex === idx;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedIndex(idx)}
                          onDoubleClick={() => handleOpenCompanyForm(c)}
                          className={`cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold' 
                              : idx % 2 === 0 
                                ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40' 
                                : 'bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="py-2 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                            #{c.id}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                            {formatDocument(c.document)}
                          </td>
                          <td className="py-2 px-3 font-sans font-bold text-slate-900 dark:text-white">
                            {c.name}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300 truncate max-w-xs">
                            {c.razao_social || '—'}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                            {c.city ? `${c.city} - ${c.state || ''}` : c.state || '—'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {c.horus_cod_cli && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold" title="Código Cliente Horus">
                                  CLI: {c.horus_cod_cli}
                                </span>
                              )}
                              {c.horus_cod_fornecedor && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold" title="Código Fornecedor Horus">
                                  FORN: {c.horus_cod_fornecedor}
                                </span>
                              )}
                              {!c.horus_cod_cli && !c.horus_cod_fornecedor && (
                                <span className="text-slate-400 text-[10px]">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCompanyForm(c);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-100/60 dark:text-indigo-400 dark:hover:bg-indigo-950/60 transition-colors"
                            >
                              <Edit3 className="h-3 w-3" />
                              Abrir
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé da Grade (Navegação Access) */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400 font-semibold mr-1">
                  Registro:
                </span>
                <button 
                  onClick={() => handleNavigateRecord('first')}
                  disabled={companies.length === 0 || selectedIndex <= 0}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleNavigateRecord('prev')}
                  disabled={companies.length === 0 || selectedIndex <= 0}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1 px-1.5">
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {selectedIndex >= 0 ? selectedIndex + 1 : 0}
                  </span>
                  <span className="text-slate-400">de</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {companies.length}
                  </span>
                </div>
                <button 
                  onClick={() => handleNavigateRecord('next')}
                  disabled={companies.length === 0 || selectedIndex >= companies.length - 1}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleNavigateRecord('last')}
                  disabled={companies.length === 0 || selectedIndex >= companies.length - 1}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${hasSearched ? 'bg-indigo-500' : 'bg-slate-300'}`} />
                  Total: {totalCount} empresa(s)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ABA 2: CADASTRO DE EMPRESAS (FORMATO DBM OPERACIONAL LIMPO)        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {mainTab === 'form' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900 space-y-4">
            
            {/* Header: Título e Botões de Ação */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div>
                <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Cadastro de Empresas
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Formulário DBM operacional sincronizado com a base do Cronuz e Horus ERP.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleNewCompany}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-500" />
                  Nova Empresa
                </button>
                <button
                  type="button"
                  onClick={handleSaveCompany}
                  disabled={savingForm}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingForm ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saveSuccessMsg ? 'Atualizado com Sucesso ✓' : 'Gravar / Salvar Empresa'}
                </button>
              </div>
            </div>

            {/* Alertas de Retorno */}
            <AnimatePresence>
              {saveSuccessMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Empresa gravada com sucesso na base Cronuz! Código Cronuz: #{formData.id}</span>
                </motion.div>
              )}
              {saveErrorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900 dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-200 flex items-center gap-2"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{saveErrorMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── CARD CAMPO LÓGICO PARA CONEXÃO COM O HORUS ─────────────────── */}
            <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-2 border-b border-indigo-100 dark:border-indigo-900/40">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wide">
                    Conexão com o Horus ERP
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    (Códigos numéricos puros para consultas diretas no banco Horus)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckHorusByDocument}
                  disabled={horusChecking}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
                  title="Consultar no banco SQL do Horus pelo CNPJ/CPF"
                >
                  {horusChecking ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Buscar no Horus
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                {/* Flag 1: Cliente Horus */}
                <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-3 bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={formData.is_cliente}
                      onChange={(e) => setFormData({ ...formData, is_cliente: e.target.checked })}
                      className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Cliente Horus (COD_CLI)
                    </span>
                  </label>
                  <div className="flex-1">
                    <input
                      type="number"
                      placeholder="Cód. Cliente (ex: 2)"
                      value={formData.horus_cod_cli !== null && formData.horus_cod_cli !== undefined ? formData.horus_cod_cli : ''}
                      onChange={(e) => setFormData({ ...formData, horus_cod_cli: e.target.value ? parseInt(e.target.value) : null })}
                      disabled={!formData.is_cliente}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 font-bold focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* Flag 2: Fornecedor Horus */}
                <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-3 bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={formData.is_fornecedor}
                      onChange={(e) => setFormData({ ...formData, is_fornecedor: e.target.checked })}
                      className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Fornecedor Horus (COD_FORNECEDOR)
                    </span>
                  </label>
                  <div className="flex-1">
                    <input
                      type="number"
                      placeholder="Cód. Fornecedor (ex: 667)"
                      value={formData.horus_cod_fornecedor !== null && formData.horus_cod_fornecedor !== undefined ? formData.horus_cod_fornecedor : ''}
                      onChange={(e) => setFormData({ ...formData, horus_cod_fornecedor: e.target.value ? parseInt(e.target.value) : null })}
                      disabled={!formData.is_fornecedor}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 font-bold focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {horusCheckMsg && (
                <div className="mt-2.5 text-xs font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                  <span>{horusCheckMsg}</span>
                </div>
              )}
            </div>

            {/* ── CAMPOS PRINCIPAIS MANTIDOS ──────────────────────────────────── */}
            <div className="space-y-3 pt-1 text-xs">
              
              {/* Linha 1: Código Cronuz, CNPJ / CPF, Apelido, Razão Social */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Código Cronuz:
                  </label>
                  <input
                    type="text"
                    disabled
                    value={formData.id && formData.id > 0 ? `#${formData.id}` : 'Novo'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-center font-mono font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    CNPJ / CPF: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={formatDocument(formData.document || '')}
                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono font-bold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Fantasia<span className="text-rose-500">*</span> (apelido):
                  </label>
                  <input
                    type="text"
                    placeholder="Fantasia (apelido)"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="lg:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Razão Social:
                  </label>
                  <input
                    type="text"
                    placeholder="Razão Social completa"
                    value={formData.razao_social || ''}
                    onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Linha 2: Cidade, UF, Grupo, Segmento, Custummer Accou: */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Cidade:
                  </label>
                  <input
                    type="text"
                    placeholder="Nome da cidade"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="lg:col-span-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    UF:
                  </label>
                  <select
                    value={formData.state || 'SP'}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {ufList.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Grupo:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Grupo Leitura, Livrarias..."
                    value={formData.group_name || ''}
                    onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Segmento:
                  </label>
                  <select
                    value={formData.segment || 'Editoras'}
                    onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-slate-900 font-medium focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="Editoras">Editoras</option>
                    <option value="Livrarias">Livrarias</option>
                    <option value="Distribuidores">Distribuidores</option>
                    <option value="Gráficas">Gráficas</option>
                    <option value="Escolas">Escolas</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Custummer Accou:
                  </label>
                  <input
                    type="text"
                    placeholder="Código da conta do cliente"
                    value={formData.customer_account || ''}
                    onChange={(e) => setFormData({ ...formData, customer_account: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Linha 3: Mensagem (Observações da Empresa) */}
              <div className="pt-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mensagem (Observações da Empresa):
                </label>
                <textarea
                  rows={3}
                  placeholder="Instruções de faturamento, recados, restrições ou histórico da empresa..."
                  value={formData.notes_message || ''}
                  onChange={(e) => setFormData({ ...formData, notes_message: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* ── SEÇÃO ROYALTIES (Única aba mantida conforme solicitado) ────── */}
              <div className="pt-2">
                <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/30 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                  <label className="block font-bold text-indigo-950 dark:text-indigo-300 mb-1 flex items-center gap-1.5 text-xs">
                    <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    Dados para fechamento Royalties:
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                    Informações bancárias internacionais, conta de repasse, ABA Number, SWIFT Code e moeda para liquidação de royalties.
                  </p>
                  <textarea
                    rows={5}
                    placeholder={`Santander Bank, N.A.\nQuarto Publishing Group USA Inc.\nAccount Number: 8943124589\nABA Number: 231372691\nSWIFT Code: SVRNUS33\nCurrency: USD`}
                    value={formData.royalties_data || ''}
                    onChange={(e) => setFormData({ ...formData, royalties_data: e.target.value })}
                    className="w-full rounded-xl border border-indigo-200 bg-white p-3 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-indigo-800 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: IMPORTAÇÃO INTELIGENTE DE PLANILHA (HORUS ERP)                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              {/* Header do Modal */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Importação Inteligente de Empresas
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sincronização com Horus ERP via Código de Cliente
                    </p>
                  </div>
                </div>
                {importStep !== 'processing' && (
                  <button
                    onClick={handleCloseModal}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Corpo do Modal de acordo com o passo */}
              <div className="p-5 overflow-y-auto space-y-4">
                {/* ── PASSO 1: UPLOAD ────────────────────────────────────────── */}
                {importStep === 'upload' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-950 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-300 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-400">
                        <Database className="h-4 w-4" />
                        Como funciona o enriquecimento automático:
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        A partir da coluna <strong>codigo_horus</strong>, o sistema consulta a base do Horus (Razão Social, CNPJ, Cidade, UF e amarração de fornecedor na filial da API). As colunas da planilha (<strong>apelido, grupo, segmento, obs da empresa, royalties e account</strong>) são preservadas integralmente.
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Planilha modelo:
                      </span>
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar Modelo (.xlsx)
                      </button>
                    </div>

                    {/* Dropzone / Upload area */}
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors bg-slate-50/50 dark:bg-slate-800/20">
                      <input
                        type="file"
                        accept=".xlsx, .csv, .ods"
                        onChange={handleFileChange}
                        id="sheet-upload"
                        className="hidden"
                      />
                      <label htmlFor="sheet-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        <UploadCloud className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {selectedFile ? selectedFile.name : 'Clique para selecionar a planilha (.xlsx ou .csv)'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedFile 
                            ? `Tamanho: ${(selectedFile.size / 1024).toFixed(1)} KB`
                            : 'Suporta arquivos Excel (.xlsx) e CSV de até 10 MB'}
                        </span>
                      </label>
                    </div>

                    {parseError && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{parseError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleParseSheet}
                        disabled={!selectedFile || parsingLoading}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {parsingLoading ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Analisando planilha...
                          </>
                        ) : (
                          <>
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Avançar para Pré-visualização
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASSO 2: PREVIEW ───────────────────────────────────────── */}
                {importStep === 'preview' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Linhas Identificadas</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white">{parsedRows.length}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Colunas Mapeadas</div>
                        <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{detectedCols.length}</div>
                      </div>
                      <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Lotes de Envio</div>
                        <div className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                          {Math.ceil(parsedRows.length / 10)} (10 por vez)
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        Colunas reconhecidas na planilha:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {detectedCols.map((col, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-300"
                          >
                            <Check className="h-3 w-3" />
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Tabela de Preview (Primeiras linhas) */}
                    <div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Amostra das Primeiras Linhas:</span>
                        <span className="text-[10px] text-slate-400">Exibindo {previewRows.length} de {parsedRows.length}</span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] uppercase text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="px-3 py-2">Linha</th>
                              <th className="px-3 py-2">Cód. Horus</th>
                              <th className="px-3 py-2">Fantasia (Apelido)</th>
                              <th className="px-3 py-2">Grupo</th>
                              <th className="px-3 py-2">Segmento</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {previewRows.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-400">#{r.row_index}</td>
                                <td className="px-3 py-2 font-bold text-indigo-600 dark:text-indigo-400">{r.codigo_horus || '-'}</td>
                                <td className="px-3 py-2 text-slate-900 dark:text-white font-medium">{r.apelido || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.grupo || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.segmento || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setImportStep('upload')}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={handleStartImport}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-500 transition-colors shadow-sm"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Iniciar Importação e Sincronização
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASSO 3 & 4: PROCESSING / DONE ─────────────────────────── */}
                {(importStep === 'processing' || importStep === 'done') && (
                  <div className="space-y-4">
                    {/* Barra de Progresso */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-700 dark:text-slate-300">
                          {importStep === 'processing' ? 'Processando registros...' : 'Importação Finalizada!'}
                        </span>
                        <span className="font-mono text-indigo-600 dark:text-indigo-400">
                          {processingProgress}% ({processedCount} de {parsedRows.length})
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                          style={{ width: `${processingProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Cards de Métricas */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center">
                        <div className="text-[10px] font-bold uppercase text-slate-500">Lidas</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white">{processedCount}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
                        <div className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Criadas</div>
                        <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{createdCount}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-center">
                        <div className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">Atualizadas</div>
                        <div className="text-lg font-black text-blue-600 dark:text-blue-400">{updatedCount}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-center">
                        <div className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">Alertas</div>
                        <div className="text-lg font-black text-amber-600 dark:text-amber-400">{warningCount}</div>
                      </div>
                    </div>

                    {/* Console de Logs em Tempo Real */}
                    <div>
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                        <span>Registro de Operações:</span>
                        <span className="text-[10px] text-slate-400">Mais recentes primeiro</span>
                      </div>
                      <div className="h-48 overflow-y-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-300 border border-slate-800 space-y-1">
                        {importLogs.length === 0 ? (
                          <div className="text-slate-600 italic">Aguardando início do processamento...</div>
                        ) : (
                          importLogs.map((log, idx) => (
                            <div
                              key={idx}
                              className={`leading-relaxed ${
                                log.startsWith('✓')
                                  ? 'text-emerald-400'
                                  : log.startsWith('⚠')
                                  ? 'text-amber-400'
                                  : log.startsWith('✗')
                                  ? 'text-rose-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {log}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Botão de Fechar / Concluir */}
                    {importStep === 'done' && (
                      <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={handleCloseModal}
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 transition-colors shadow-sm"
                        >
                          <Check className="h-4 w-4" />
                          Concluir e Ver Empresas Atualizadas
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
