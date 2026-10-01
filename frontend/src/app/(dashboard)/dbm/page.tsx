'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  Package, 
  TrendingUp, 
  DatabaseZap, 
  BookOpen, 
  BarChart3, 
  Search, 
  Calendar, 
  Mail, 
  Gift, 
  FileText, 
  Globe, 
  RefreshCw, 
  Users, 
  Award, 
  Layers, 
  DollarSign, 
  PieChart, 
  Sliders, 
  ShieldCheck, 
  Clock, 
  ChevronRight, 
  Sparkles,
  ArrowUpRight,
  Command,
  Filter
} from 'lucide-react';
import { getUser } from '@/lib/auth';

interface ModuleAction {
  id: string;
  name: string;
  href?: string;
  shortcut?: string;
  badge?: string;
  isAvailable?: boolean;
  onClick?: () => void;
}

interface ModuleSection {
  title: string;
  icon: any;
  color: string;
  borderColor: string;
  badgeColor: string;
  actions: ModuleAction[];
}

export default function DbmDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [horusDays, setHorusDays] = useState('90');
  const [horusDate, setHorusDate] = useState('2026-06-30');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    setCurrentUser(user);
  }, []);

  // Atalho de teclado para abrir tela de empresas direto pelo número 1
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se estiver digitando em um input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        router.push('/dbm/companies');
      } else if (e.key === '2') {
        e.preventDefault();
        router.push('/dbm/products');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  const handleActionClick = (action: ModuleAction) => {
    if (action.href) {
      router.push(action.href);
    } else {
      setNoticeMessage(`A rotina "${action.name}" está em fase final de homologação no formato DBM.`);
      setTimeout(() => setNoticeMessage(null), 3500);
    }
  };

  const sections: ModuleSection[] = [
    {
      title: 'Comercial',
      icon: Building2,
      color: 'from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400',
      borderColor: 'border-blue-200 dark:border-blue-900/40 hover:border-blue-400',
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
      actions: [
        { id: 'com-1', name: 'Empresas', href: '/dbm/companies', shortcut: '1', badge: 'Principal', isAvailable: true },
        { id: 'com-2', name: 'Agenda', shortcut: '2', isAvailable: false },
        { id: 'com-3', name: 'Relatório de Doação', shortcut: '3', isAvailable: false },
        { id: 'com-4', name: 'Mala Direta', shortcut: '4', isAvailable: false },
      ]
    },
    {
      title: 'Produtos & Estoque',
      icon: Package,
      color: 'from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-200 dark:border-amber-900/40 hover:border-amber-400',
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      actions: [
        { id: 'prod-1', name: 'Pesquisa de Produtos', href: '/dbm/products', shortcut: '2', badge: 'Excel Grid', isAvailable: true },
        { id: 'prod-2', name: 'Autores', href: '/authors', isAvailable: true },
        { id: 'prod-3', name: 'Conciliação Estoque', isAvailable: false },
      ]
    },
    {
      title: 'Gestão de Vendas',
      icon: TrendingUp,
      color: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400',
      borderColor: 'border-emerald-200 dark:border-emerald-900/40 hover:border-emerald-400',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      actions: [
        { id: 'vendas-1', name: 'Orçamentos & Propostas', href: '/proposals', isAvailable: true },
        { id: 'vendas-2', name: 'Pedidos Internet', href: '/orders', isAvailable: true },
      ]
    },
    {
      title: 'Horus ERP & Sincronismo',
      icon: DatabaseZap,
      color: 'from-purple-500/10 to-violet-500/10 text-purple-600 dark:text-purple-400',
      borderColor: 'border-purple-200 dark:border-purple-900/40 hover:border-purple-400',
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
      actions: [
        { id: 'horus-1', name: 'Atualizar Produtos', isAvailable: false },
        { id: 'horus-2', name: 'Atualizar Estoque', isAvailable: false },
        { id: 'horus-3', name: 'Associar Empresas', href: '/dbm/companies', isAvailable: true },
        { id: 'horus-4', name: 'Atualizar Faturas', href: '/horus-direct/pedidos', isAvailable: true },
        { id: 'horus-5', name: 'Atualizar Histórico', isAvailable: false },
      ]
    },
    {
      title: 'Royalties',
      icon: Award,
      color: 'from-rose-500/10 to-pink-500/10 text-rose-600 dark:text-rose-400',
      borderColor: 'border-rose-200 dark:border-rose-900/40 hover:border-rose-400',
      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
      actions: [
        { id: 'roy-1', name: 'Fechamento Anual - Impressos', isAvailable: false },
        { id: 'roy-2', name: 'Fechamento Anual - Ebooks', isAvailable: false },
        { id: 'roy-3', name: 'Análise Mensal', isAvailable: false },
      ]
    },
    {
      title: 'Vendas & Análises',
      icon: BarChart3,
      color: 'from-cyan-500/10 to-sky-500/10 text-cyan-600 dark:text-cyan-400',
      borderColor: 'border-cyan-200 dark:border-cyan-900/40 hover:border-cyan-400',
      badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
      actions: [
        { id: 'an-1', name: 'Tops de Venda', isAvailable: false },
        { id: 'an-2', name: 'Evolução de Custo', isAvailable: false },
        { id: 'an-3', name: 'Análise de Margem', isAvailable: false },
        { id: 'an-4', name: 'Livros Sem Acerto', isAvailable: false },
        { id: 'an-5', name: 'Validade de Contratos', isAvailable: false },
        { id: 'an-6', name: 'Análise Markup Produção', isAvailable: false },
        { id: 'an-7', name: 'Qualidade do Estoque', isAvailable: false },
      ]
    }
  ];

  // Filtro de busca rápida
  const filteredSections = sections.map(section => ({
    ...section,
    actions: section.actions.filter(a => 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      section.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(section => {
    if (selectedCategory !== 'all' && section.title !== selectedCategory) return false;
    return section.actions.length > 0;
  });

  const sellerName = currentUser?.company_name || 'SELLER ATUAL';

  return (
    <div className="space-y-6 pb-16">
      {/* ── Top Header Operacional DBM ───────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/90 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                <Sparkles className="h-3.5 w-3.5" />
                DBM Operacional
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Ambiente Horus Direct
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl uppercase">
                {sellerName}
              </h1>
              <span className="text-lg font-light text-slate-400 dark:text-slate-600">/</span>
              <span className="text-lg font-medium text-slate-600 dark:text-slate-300">
                Menu Central
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
              Navegação ágil inspirada no formato clássico de folha de dados e comandos do DBM. Pressione <kbd className="px-1.5 py-0.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700">1</kbd> para abrir o cadastro de empresas.
            </p>
          </div>

          {/* Painel de Parâmetros Rápidos Horus (conforme imagem clássica) */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-950/60 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Dias:</span>
              <input 
                type="text" 
                value={horusDays} 
                onChange={(e) => setHorusDays(e.target.value)}
                className="w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-center font-mono font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              <input 
                type="date" 
                value={horusDate} 
                onChange={(e) => setHorusDate(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        {/* ── Barra de Busca Rápida / Spotlight ─────────────────────────── */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Localizar módulo ou comando rápido (ex: Empresas, Pesquisa, Horus...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-12 py-2.5 text-sm text-slate-900 shadow-inner focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-indigo-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Abas de Categoria no Mobile / Desktop */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Todos
            </button>
            {sections.map(s => (
              <button
                key={s.title}
                onClick={() => setSelectedCategory(s.title)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedCategory === s.title
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Aviso sutil de ação ────────────────────────────────────────── */}
      <AnimatePresence>
        {noticeMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 text-xs font-medium text-indigo-900 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200"
          >
            ℹ️ {noticeMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Grade Moderna de Módulos (Estilo Switchboard Elegante) ───────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSections.map((section, idx) => {
          const SectionIcon = section.icon;
          return (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200 dark:bg-slate-900/80 ${section.borderColor}`}
            >
              {/* Cabeçalho do Card */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${section.color}`}>
                    <SectionIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {section.title}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {section.actions.length} {section.actions.length === 1 ? 'rotina' : 'rotinas'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista de Ações / Rotinas */}
              <div className="mt-3 space-y-1.5">
                {section.actions.map(action => (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action)}
                    className="w-full group flex items-center justify-between p-2.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 group-hover:bg-indigo-500 transition-colors" />
                      <span className={`text-sm truncate ${action.isAvailable ? 'font-semibold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {action.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {action.shortcut && (
                        <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded border border-slate-300 dark:border-slate-700">
                          {action.shortcut}
                        </kbd>
                      )}
                      {action.badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${section.badgeColor}`}>
                          {action.badge}
                        </span>
                      )}
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredSections.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nenhuma rotina encontrada para "{searchQuery}"
          </p>
          <button 
            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
            className="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Limpar filtros e exibir todas
          </button>
        </div>
      )}
    </div>
  );
}
