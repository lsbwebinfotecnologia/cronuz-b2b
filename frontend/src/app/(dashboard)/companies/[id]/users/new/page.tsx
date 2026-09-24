'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, Loader2, Mail, User, ShieldCheck, Lock, Settings, CheckSquare, Square } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

const INITIAL_PAGE_OPTIONS = [
  { value: 'DEFAULT', label: 'Padrão (Dashboard / Catálogo)' },
  { value: '/pdv', label: 'Ponto de Venda (PDV)' },
  { value: '/product-search', label: 'Busca Preço' },
  { value: '/orders', label: 'Gestão de Pedidos' },
  { value: '/products', label: 'Catálogo de Produtos' },
  { value: '/customers', label: 'Empresas & Clientes' },
  { value: '/services', label: 'Serviços' },
  { value: '/financial', label: 'Financeiro' },
  { value: '/logistics/conference', label: 'Logística / Conferência' },
  { value: '/bookinfo/orders', label: 'Bookinfo Pedidos' },
  { value: '/orders/dropship', label: 'Dropship (Erdos)' },
  { value: '/horus-direct/pedidos', label: 'Horus Direct (SQL)' },
  { value: '/subscriptions', label: 'Assinaturas' },
  { value: '/notifications', label: 'Notificações' },
  { value: '/authors', label: 'Autores' },
  { value: '/inventory', label: 'Inventário' },
  { value: '/agents', label: 'Vendedores / Rep' },
  { value: '/commercial-policies', label: 'Políticas Comerciais' },
  { value: '/settings', label: 'Configurações da Loja' },
];

const MODULE_PERMISSIONS_LIST = [
  { id: 'pdv', label: 'Ponto de Venda (PDV)', description: 'Acesso à tela de vendas e caixa mobile/desktop' },
  { id: 'busca_preco', label: 'Busca Preço', description: 'Consulta instantânea de ISBNs, saldos e capa' },
  { id: 'products', label: 'Produtos & Catálogo', description: 'Listagem, marcas e categorias' },
  { id: 'orders', label: 'Pedidos & Vendas', description: 'Visualização e gestão de pedidos' },
  { id: 'customers', label: 'Empresas & Clientes', description: 'Cadastro e gestão de carteiras de clientes' },
  { id: 'services', label: 'Serviços', description: 'Catálogo de serviços e ordens de serviço' },
  { id: 'financial', label: 'Financeiro', description: 'Lançamentos, boletos, contas e extratos' },
  { id: 'logistics', label: 'Logística Hórus / WMS', description: 'Conferência de expedição e filiais' },
  { id: 'bookinfo', label: 'Bookinfo Hub', description: 'Automação de pedidos de venda e compra' },
  { id: 'promotions', label: 'Marketing & Promoções', description: 'Vitrines, banners e cupons de desconto' },
  { id: 'proposals', label: 'Propostas Comerciais', description: 'Geração e acompanhamento de orçamentos' },
  { id: 'dropship', label: 'Dropship (Erdos)', description: 'Pedidos Erdos, tabelas de preço e estoque' },
  { id: 'horus_sql', label: 'Horus Direct (SQL)', description: 'Pedidos diretos no SQL do Horus e financeiro Vindi' },
  { id: 'subscriptions', label: 'Assinaturas', description: 'Gestão de planos e assinantes recorrentes' },
  { id: 'notifications', label: 'Central de Notificações', description: 'Alertas e avisos do sistema' },
  { id: 'authors', label: 'Gestão de Autores', description: 'Cadastro de autores e portais' },
  { id: 'inventory', label: 'Inventário & Balanço', description: 'Contagem de estoque e ajustes' },
  { id: 'agents', label: 'Vendedores / Rep', description: 'Gestão da equipe de vendas' },
  { id: 'commercial', label: 'Políticas Comerciais', description: 'Regras de desconto e preços' },
  { id: 'settings', label: 'Configurações da Loja', description: 'Parâmetros fiscais, integrações e dados' },
];

export default function NewSellerPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    document: '',
    password: ''
  });
  const [initialPage, setInitialPage] = useState('DEFAULT');
  const [grantFullAccess, setGrantFullAccess] = useState(true);
  const [allowedModules, setAllowedModules] = useState<string[]>([]);

  const toggleModulePermission = (modId: string) => {
    if (allowedModules.includes(modId)) {
      setAllowedModules(allowedModules.filter(m => m !== modId));
    } else {
      setAllowedModules([...allowedModules, modId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          type: 'SELLER',
          company_id: parseInt(companyId),
          initial_page: initialPage === 'DEFAULT' ? null : initialPage,
          allowed_modules: grantFullAccess ? null : allowedModules
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Erro ao cadastrar usuário Vendedor');
      }

      toast.success('Novo usuário de acesso criado com sucesso!');
      router.push(`/companies/${companyId}/users`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-6 md:p-8">
      <div className="flex items-center gap-4">
        <Link 
          href={`/companies/${companyId}/users`}
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-transparent dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-500 dark:text-indigo-400" />
            Cadastrar Novo Acesso (Seller)
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Crie novos usuários, definindo redirecionamento inicial e escopo de módulos.
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              Dados do Usuário
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                    placeholder="Nome do operador ou gerente"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">E-mail de Acesso</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                    placeholder="usuario@empresa.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Documento (Opcional)</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={formData.document}
                    onChange={(e) => setFormData({...formData, document: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                    placeholder="CPF do responsável"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha Inicial</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Permissões & Direcionamento */}
          <div className="space-y-6 pt-6 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-teal-600" />
              Redirecionamento & Permissões
            </h3>

            {/* 1. Direcionamento Inicial */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                1. Tela Inicial ao Logar (Direcionamento Padrão)
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ao fazer login, este usuário será levado diretamente para esta tela.
              </p>
              <select
                value={initialPage}
                onChange={(e) => setInitialPage(e.target.value)}
                className="w-full md:w-1/2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {INITIAL_PAGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* 2. Escopo de Módulos */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                2. Escopo de Módulos Permitidos
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-teal-200 dark:border-teal-800/40 bg-teal-50/50 dark:bg-teal-950/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={grantFullAccess}
                  onChange={(e) => {
                    setGrantFullAccess(e.target.checked);
                    if (e.target.checked) setAllowedModules([]);
                  }}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-sm font-bold text-teal-900 dark:text-teal-200 block">Acesso Total (Sem Restrições)</span>
                  <span className="text-xs text-teal-700 dark:text-teal-400 block">O usuário enxergará todos os módulos ativos contratados pelo Seller.</span>
                </div>
              </label>

              {!grantFullAccess && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  {MODULE_PERMISSIONS_LIST.map(mod => {
                    const isChecked = allowedModules.includes(mod.id);
                    return (
                      <div
                        key={mod.id}
                        onClick={() => toggleModulePermission(mod.id)}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-900/30 text-teal-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isChecked ? <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" /> : <Square className="w-4 h-4 text-slate-400" />}
                        </div>
                        <div>
                          <span className="text-xs font-bold block">{mod.label}</span>
                          <span className="text-[11px] opacity-75 block leading-tight">{mod.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800/60">
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shadow-[var(--color-primary-base)]/20 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 disabled:shadow-none"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {loading ? 'Cadastrando...' : 'Finalizar e Conceder Acesso'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

