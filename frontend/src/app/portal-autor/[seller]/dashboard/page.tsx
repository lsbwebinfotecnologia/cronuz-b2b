'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthorPortal } from '../layout';
import { 
  BookOpen, Feather, ShoppingCart, TrendingUp, ArrowDownLeft, 
  Gift, Calendar, LogOut, Loader2, AlertCircle, RefreshCw,
  Search, BookCheck, ShieldAlert, Sparkles, User, FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';

interface SubAuthor {
  COD_AUTOR: number;
  NOM_AUTOR: string;
  COD_TIPO?: number;
  NOM_TIPO?: string;
}

interface AuthorBook {
  COD_ITEM: number;
  COD_BARRA_ITEM?: string;
  COD_ISBN_ITEM?: string;
  NOM_ITEM: string;
  COD_EDITORA?: number;
  NOM_EDITORA?: string;
  SELO?: string;
}

interface SaleItem {
  COD_ITEM: number;
  COD_BARRAS?: string;
  NOM_ITEM: string;
  DATA_VENDA: string;
  QTD_VENDIDA: number;
  QTD_DOADA: number;
  QTD_DEVOLVIDA: number;
}

interface KPIs {
  total_vendida: number;
  total_doada: number;
  total_devolvida: number;
  saldo_liquido: number;
}

const PERIODOS = [
  { id: '5d', label: '5 Dias' },
  { id: '10d', label: '10 Dias' },
  { id: '15d', label: '15 Dias' },
  { id: '30d', label: '30 Dias' },
  { id: '6m', label: '6 Meses' },
];

export default function AuthorDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const seller = params?.seller as string;
  const { portalInfo } = useAuthorPortal();

  // Sessão do Autor
  const [authorUser, setAuthorUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'vendas' | 'direitos'>('vendas');

  // Seletores do Horus
  const [fornecedores, setFornecedores] = useState<SubAuthor[]>([]);
  const [selectedAuthorCode, setSelectedAuthorCode] = useState<number | null>(null);
  const [loadingFornecedores, setLoadingFornecedores] = useState(true);

  const [books, setBooks] = useState<AuthorBook[]>([]);
  const [selectedBookCode, setSelectedBookCode] = useState<number | null>(null);
  const [loadingBooks, setLoadingBooks] = useState(false);

  // Período Fechado
  const [selectedPeriod, setSelectedPeriod] = useState('30d');

  // Vendas
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [kpis, setKpis] = useState<KPIs>({
    total_vendida: 0,
    total_doada: 0,
    total_devolvida: 0,
    saldo_liquido: 0
  });
  const [loadingSales, setLoadingSales] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const getAuthorToken = () => {
    return localStorage.getItem(`author_token_${seller}`) || localStorage.getItem('author_token');
  };

  // 1. Carrega dados do autor logado
  useEffect(() => {
    const raw = localStorage.getItem(`author_user_${seller}`);
    const token = getAuthorToken();

    if (!token) {
      router.replace(`/portal-autor/${seller}/login`);
      return;
    }

    if (raw) {
      try {
        setAuthorUser(JSON.parse(raw));
      } catch (e) {}
    }

    // Busca dados atualizados via /portal-autor/me
    const fetchMe = async () => {
      try {
        const res = await fetch(`${API_URL}/portal-autor/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setAuthorUser(data);
          localStorage.setItem(`author_user_${seller}`, JSON.stringify(data));
        } else if (res.status === 401 || res.status === 403) {
          handleLogout();
        }
      } catch (e) {}
    };
    fetchMe();
  }, [seller]);

  // 2. Carrega Autores vinculados ao Fornecedor (Horus)
  useEffect(() => {
    const token = getAuthorToken();
    if (!token) return;

    const fetchFornecedores = async () => {
      setLoadingFornecedores(true);
      try {
        const res = await fetch(`${API_URL}/portal-autor/fornecedores`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data: SubAuthor[] = await res.json();
          setFornecedores(data || []);
          if (data && data.length > 0) {
            // Se houver apenas 1, seleciona automaticamente
            setSelectedAuthorCode(data[0].COD_AUTOR);
          }
        }
      } catch (e) {
        toast.error('Erro ao carregar relação de autores do fornecedor.');
      } finally {
        setLoadingFornecedores(false);
      }
    };

    fetchFornecedores();
  }, [seller]);

  // 3. Ao definir/mudar autor, busca livros do autor no Horus
  useEffect(() => {
    const token = getAuthorToken();
    if (!token) return;

    const fetchBooks = async () => {
      setLoadingBooks(true);
      setSelectedBookCode(null);
      try {
        const res = await fetch(`${API_URL}/portal-autor/itens`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setBooks(data || []);
        }
      } catch (e) {
        toast.error('Erro ao buscar catálogo de obras do autor.');
      } finally {
        setLoadingBooks(false);
      }
    };

    fetchBooks();
  }, [selectedAuthorCode]);

  // 4. Busca vendas no período
  const fetchSales = async () => {
    const token = getAuthorToken();
    if (!token) return;

    if (authorUser && authorUser.b2b_mostrar_vendas !== 'S') {
      return;
    }

    setLoadingSales(true);
    try {
      const params = new URLSearchParams({
        periodo: selectedPeriod
      });
      if (selectedAuthorCode) params.append('cod_autor', String(selectedAuthorCode));
      if (selectedBookCode) params.append('cod_item', String(selectedBookCode));

      const res = await fetch(`${API_URL}/portal-autor/vendas?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSales(data.itens || []);
        setKpis(data.kpis || { total_vendida: 0, total_doada: 0, total_devolvida: 0, saldo_liquido: 0 });
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao carregar dados de vendas.');
      }
    } catch (e) {
      toast.error('Falha de rede ao consultar vendas.');
    } finally {
      setLoadingSales(false);
    }
  };

  useEffect(() => {
    if (selectedAuthorCode !== null) {
      fetchSales();
    }
  }, [selectedAuthorCode, selectedBookCode, selectedPeriod]);

  const handleLogout = () => {
    localStorage.removeItem(`author_token_${seller}`);
    localStorage.removeItem(`author_user_${seller}`);
    router.push(`/portal-autor/${seller}/login`);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {portalInfo?.logo ? (
              <img
                src={portalInfo.logo}
                alt={portalInfo.name}
                className="h-9 max-w-[140px] object-contain"
              />
            ) : (
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold flex items-center gap-2">
                <Feather className="w-5 h-5" />
                <span className="text-sm font-bold hidden sm:inline">{portalInfo?.name}</span>
              </div>
            )}
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Portal do Autor
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
                {authorUser?.nome || 'Autor(a)'}
              </p>
              <p className="text-xs text-slate-400 font-mono">
                Doc: {authorUser?.id_doc || '—'}
              </p>
            </div>

            <button
              onClick={handleLogout}
              title="Sair do Portal"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('vendas')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'vendas'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Relatório de Vendas
            </button>

            <button
              onClick={() => setActiveTab('direitos')}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'direitos'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Direitos Autorais (Royalties)
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Em breve
              </span>
            </button>
          </div>

          <button
            onClick={fetchSales}
            disabled={loadingSales}
            title="Atualizar dados"
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingSales ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {activeTab === 'direitos' ? (
          /* Aba de Direitos Autorais / Royalties (Placeholder Estruturado) */
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-sm max-w-2xl mx-auto my-12">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Painel de Direitos Autorais & Fechamentos
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
              O módulo de conciliação de royalties e demonstrativos periódicos de direitos autorais está sendo preparado pela sua editora em conformidade com o Horus ERP.
            </p>
          </div>
        ) : authorUser?.b2b_mostrar_vendas !== 'S' ? (
          /* Permissão de Vendas Inativa */
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800 shadow-sm max-w-lg mx-auto my-8">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Visualização de Vendas Desabilitada
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              O seu perfil de autor está configurado para não exibir relatórios de vendas no momento. Para solicitar acesso, entre em contato com sua editora.
            </p>
          </div>
        ) : (
          <>
            {/* Barra de Filtros: Autor, Livro e Período */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Seletor de Autor/Fornecedor (se múltiplos) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-amber-500" />
                    Autor / Representante
                  </label>
                  {loadingFornecedores ? (
                    <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                  ) : (
                    <select
                      value={selectedAuthorCode ?? ''}
                      onChange={(e) => setSelectedAuthorCode(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    >
                      {fornecedores.map((fa) => (
                        <option key={fa.COD_AUTOR} value={fa.COD_AUTOR}>
                          {fa.NOM_AUTOR} ({fa.NOM_TIPO || 'Autor'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Seletor de Livro / Item */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                    Filtrar por Livro / Obra
                  </label>
                  {loadingBooks ? (
                    <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                  ) : (
                    <select
                      value={selectedBookCode ?? ''}
                      onChange={(e) => setSelectedBookCode(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium"
                    >
                      <option value="">Todos os Livros ({books.length})</option>
                      {books.map((b) => (
                        <option key={b.COD_ITEM} value={b.COD_ITEM}>
                          {b.NOM_ITEM} {b.COD_ISBN_ITEM ? `— ${b.COD_ISBN_ITEM}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Período Fixo Obrigatório */}
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    Período da Consulta
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {PERIODOS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPeriod(p.id)}
                        className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                          selectedPeriod === p.id
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Cards de KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Vendido */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Total Vendido
                  </span>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {kpis.total_vendida.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">ex.</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Exemplares faturados</p>
              </div>

              {/* Devolvidos */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Devoluções
                  </span>
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {kpis.total_devolvida.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">ex.</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Devoluções de livrarias/PDV</p>
              </div>

              {/* Saldo Líquido */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Vendas Líquidas
                  </span>
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {kpis.saldo_liquido.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">ex.</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Vendas menos devoluções</p>
              </div>

              {/* Doados / Divulgação */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Doações / Cortesia
                  </span>
                  <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Gift className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {kpis.total_doada.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">ex.</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Envios de imprensa/divulgação</p>
              </div>
            </div>

            {/* Listagem de Vendas (Desktop Table + Mobile Cards) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Histórico de Vendas no Período
                  </h4>
                  <p className="text-xs text-slate-500">
                    Dados processados diretamente pelo ERP Horus.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {sales.length} registros
                </span>
              </div>

              {loadingSales ? (
                <div className="p-12 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-amber-500" />
                  Buscando vendas no Hórus...
                </div>
              ) : sales.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  Nenhuma movimentação de venda registrada para este autor no período selecionado.
                </div>
              ) : (
                <>
                  {/* Tabela Desktop */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold">
                        <tr>
                          <th className="px-5 py-3">Data</th>
                          <th className="px-5 py-3">Título da Obra</th>
                          <th className="px-5 py-3 text-center">Código / Barras</th>
                          <th className="px-5 py-3 text-right">Qtd. Vendida</th>
                          <th className="px-5 py-3 text-right">Devolvida</th>
                          <th className="px-5 py-3 text-right">Doada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sales.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                              {formatDate(item.DATA_VENDA)}
                            </td>
                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                              {item.NOM_ITEM}
                            </td>
                            <td className="px-5 py-3.5 text-center font-mono text-xs text-slate-500">
                              {item.COD_BARRAS || item.COD_ITEM}
                            </td>
                            <td className="px-5 py-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              +{item.QTD_VENDIDA}
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold text-rose-500">
                              {item.QTD_DEVOLVIDA > 0 ? `-${item.QTD_DEVOLVIDA}` : '0'}
                            </td>
                            <td className="px-5 py-3.5 text-right font-medium text-slate-500">
                              {item.QTD_DOADA}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Lista em Cards Mobile */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {sales.map((item, idx) => (
                      <div key={idx} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-slate-900 dark:text-white text-sm leading-snug">
                            {item.NOM_ITEM}
                          </p>
                          <span className="text-[11px] font-mono text-slate-500 shrink-0">
                            {formatDate(item.DATA_VENDA)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                            <span className="text-[10px] text-slate-500 block">Vendido</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">+{item.QTD_VENDIDA}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                            <span className="text-[10px] text-slate-500 block">Devolvido</span>
                            <span className="font-bold text-rose-600 dark:text-rose-400">-{item.QTD_DEVOLVIDA}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                            <span className="text-[10px] text-slate-500 block">Doado</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{item.QTD_DOADA}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
