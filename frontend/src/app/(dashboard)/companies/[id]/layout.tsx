'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import {
  Building2, Users, FileText, FileSignature, Receipt, ArrowLeft, Plug,
  Loader2, ChevronDown, ChevronRight, Database, DatabaseZap, Boxes,
  Settings, BookOpen, PackageCheck, Bell, Truck, Landmark, ShoppingBag, Filter
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { Company, CompanyContext } from './context';

interface MenuItemDef {
  name: string;
  path: string;
  icon: any;
  moduleKey?: keyof Company;
  alwaysActive?: boolean;
}

export default function CompanyProfileLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const companyId = params.id as string;
  const pathname = usePathname();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [onlyActiveMenu, setOnlyActiveMenu] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '1. Operação & Conta': true,
    '2. Frentes & Ecossistema': true,
    '3. Pagamentos & Comercial': true,
    '4. Governança & Suporte': true,
  });

  const fetchCompany = async () => {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCompany(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompany();
  }, [companyId]);

  const handleQuickToggleModule = async (
    e: React.MouseEvent,
    moduleKey: keyof Company,
    label: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!company || togglingKey) return;

    const currentVal = Boolean(company[moduleKey]);
    const nextVal = !currentVal;
    setTogglingKey(String(moduleKey));

    const updates: Record<string, boolean> = {
      module_b2b_native: company.module_b2b_native,
      module_horus_erp: company.module_horus_erp,
      module_products: company.module_products,
      module_orders: company.module_orders,
      module_customers: company.module_customers,
      module_marketing: company.module_marketing,
      module_subscriptions: company.module_subscriptions,
      module_pdv: company.module_pdv,
      module_agents: company.module_agents,
      module_financial: company.module_financial,
      module_services: company.module_services,
      module_commercial: company.module_commercial,
      module_crm: company.module_crm,
      module_consignment: company.module_consignment,
      module_proposals: company.module_proposals,
      module_logistica_horus: company.module_logistica_horus,
      module_dropship: company.module_dropship,
      module_notifications: company.module_notifications,
      module_busca_preco: company.module_busca_preco,
      module_horus_sql: company.module_horus_sql ?? false,
      modulo_autores_ativo: company.modulo_autores_ativo ?? false,
      has_inventory_module: company.has_inventory_module ?? false,
      module_editorial: company.module_editorial ?? false,
      module_schools: company.module_schools ?? false,
      module_cafeteria: company.module_cafeteria ?? false,
      module_encomendas: company.module_encomendas ?? false,
      module_order_intake: company.module_order_intake ?? false,
      module_b2c_storefront: company.module_b2c_storefront ?? false,
      [moduleKey]: nextVal,
    };

    if (moduleKey === 'module_horus_erp' && nextVal) {
      updates.module_b2b_native = false;
      updates.module_products = false;
    }

    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/modules`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(updates),
        }
      );
      if (!res.ok) throw new Error('Falha ao atualizar módulo');
      setCompany((prev) => (prev ? { ...prev, ...updates } : prev));
      toast.success(`${label}: ${nextVal ? 'Ativado ✓' : 'Desativado'}`);
    } catch {
      toast.error(`Erro ao alterar status de ${label}.`);
    } finally {
      setTogglingKey(null);
    }
  };

  const menuGroups: Array<{ group: string; items: MenuItemDef[] }> = [
    {
      group: '1. Operação & Conta',
      items: [
        { name: 'Central & Perfil', path: `/companies/${companyId}/profile`, icon: Building2, alwaysActive: true },
        { name: 'Módulos & Licenças', path: `/companies/${companyId}/modules`, icon: Boxes, alwaysActive: true },
        { name: 'Acessos e Logins', path: `/companies/${companyId}/users`, icon: Users, alwaysActive: true },
        { name: 'Configurações Gerais', path: `/companies/${companyId}/settings`, icon: Settings, alwaysActive: true },
      ],
    },
    {
      group: '2. Frentes & Ecossistema',
      items: [
        { name: 'B2C', path: `/companies/${companyId}/tray`, icon: ShoppingBag, moduleKey: 'module_b2c_storefront' },
        { name: 'Horus ERP (API)', path: `/companies/${companyId}/horus`, icon: Database, moduleKey: 'module_horus_erp' },
        { name: 'Horus SQL Direct', path: `/companies/${companyId}/horus-sql`, icon: DatabaseZap, moduleKey: 'module_horus_sql' },
        { name: 'Bookinfo', path: `/companies/${companyId}/bookinfo`, icon: BookOpen, alwaysActive: true },
        { name: 'Dropship', path: `/companies/${companyId}/dropship`, icon: PackageCheck, moduleKey: 'module_dropship' },
        { name: 'Distribuidores', path: `/companies/${companyId}/distributors`, icon: Truck, alwaysActive: true },
      ],
    },
    {
      group: '3. Pagamentos & Comercial',
      items: [
        { name: 'Pagamentos & Bancos', path: `/companies/${companyId}/payments`, icon: Landmark, alwaysActive: true },
        { name: 'Propostas', path: `/companies/${companyId}/proposals`, icon: FileSignature, moduleKey: 'module_proposals' },
        { name: 'Faturas SaaS', path: `/companies/${companyId}/invoices`, icon: Receipt, alwaysActive: true },
        { name: 'Contratos', path: `/companies/${companyId}/contracts`, icon: FileSignature, alwaysActive: true },
      ],
    },
    {
      group: '4. Governança & Suporte',
      items: [
        { name: 'Mapa de Integrações', path: `/companies/${companyId}/integrations`, icon: Plug, alwaysActive: true },
        { name: 'Alertas', path: `/companies/${companyId}/alerts`, icon: Bell, moduleKey: 'module_notifications' },
        { name: 'Notas Internas', path: `/companies/${companyId}/notes`, icon: FileText, alwaysActive: true },
      ],
    },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Empresa não encontrada.</p>
        <Link href="/companies" className="text-indigo-400 hover:underline mt-4 inline-block">
          Voltar para Lojas
        </Link>
      </div>
    );
  }

  return (
    <CompanyContext.Provider value={{ company, loading, refreshCompany: fetchCompany }}>
      <div className="flex flex-col md:flex-row gap-4 md:gap-5 w-full max-w-[1600px] mx-auto min-h-0">
        {/* Sidebar da Empresa */}
        <div className="w-full md:w-72 md:shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-sm">
          {/* Topo da Empresa */}
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-2.5">
            <Link
              href="/companies"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar para lista
            </Link>

            <div className="flex items-center justify-between w-full text-left">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                  #{company.id} {company.name}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  {company.active ? (
                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Operação Ativa
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Suspensa
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Filtro rápido do menu: Todos vs Só Ativos */}
            <div className="hidden md:flex items-center justify-between pt-1.5 border-t border-slate-200/70 dark:border-slate-800/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Exibir no Menu:
              </span>
              <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setOnlyActiveMenu(false)}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    !onlyActiveMenu
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyActiveMenu(true)}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    onlyActiveMenu
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                >
                  Só Ativos
                </button>
              </div>
            </div>
          </div>

          {/* Lista Categorizada com Accordion e Switch Rápido no Menu */}
          <div className="overflow-x-auto md:overflow-y-auto py-2 px-2 md:px-0 no-scrollbar">
            <div className="flex flex-row md:flex-col gap-1 md:gap-1.5">
              {menuGroups.map((grp) => {
                const isGroupOpen = openGroups[grp.group] !== false;
                const visibleItems = grp.items.filter((item) => {
                  if (!onlyActiveMenu) return true;
                  if (item.alwaysActive || !item.moduleKey) return true;
                  return Boolean(company[item.moduleKey]);
                });

                if (visibleItems.length === 0) return null;

                return (
                  <div key={grp.group} className="flex flex-row md:flex-col gap-1 md:gap-0.5">
                    {/* Cabeçalho Expansível da Categoria (Desktop) */}
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((prev) => ({ ...prev, [grp.group]: !isGroupOpen }))
                      }
                      className="hidden md:flex items-center justify-between w-full px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      <span>{grp.group}</span>
                      {isGroupOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Itens do Grupo */}
                    {isGroupOpen &&
                      visibleItems.map((item) => {
                        const isActiveRoute = pathname.startsWith(item.path);
                        const Icon = item.icon;
                        const hasModuleToggle = Boolean(item.moduleKey);
                        const isModuleEnabled = item.moduleKey
                          ? Boolean(company[item.moduleKey])
                          : true;
                        const isTogglingThis = togglingKey === item.moduleKey;

                        return (
                          <div
                            key={item.path}
                            className={`group flex items-center justify-between px-3 md:px-4 py-2 text-xs md:text-sm font-medium transition-colors whitespace-nowrap rounded-xl md:rounded-none md:border-l-2 ${
                              isActiveRoute
                                ? 'bg-[var(--color-primary-base)] text-white md:bg-[var(--color-primary-base)]/10 md:text-[var(--color-primary-base)] md:border-[var(--color-primary-base)] font-bold shadow-sm md:shadow-none'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-white border-transparent'
                            }`}
                          >
                            <Link
                              href={item.path}
                              className="flex items-center gap-2.5 flex-1 min-w-0 py-0.5"
                            >
                              <Icon
                                className={`w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 ${
                                  isActiveRoute
                                    ? 'text-white md:text-[var(--color-primary-base)]'
                                    : hasModuleToggle && !isModuleEnabled
                                    ? 'text-slate-300 dark:text-slate-600'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              />
                              <span
                                className={`truncate ${
                                  hasModuleToggle && !isModuleEnabled && !isActiveRoute
                                    ? 'text-slate-400 dark:text-slate-500'
                                    : ''
                                }`}
                              >
                                {item.name}
                              </span>
                            </Link>

                            {/* Mini-Switch no Menu para Ativar / Desativar o módulo diretamente */}
                            {hasModuleToggle && item.moduleKey && (
                              <button
                                type="button"
                                title={
                                  isModuleEnabled
                                    ? `${item.name} Ativo — Clique para desativar`
                                    : `${item.name} Inativo — Clique para ativar`
                                }
                                onClick={(e) =>
                                  handleQuickToggleModule(e, item.moduleKey!, item.name)
                                }
                                disabled={isTogglingThis}
                                className={`hidden md:inline-flex relative h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ml-2 ${
                                  isModuleEnabled
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-200 dark:bg-slate-700'
                                } ${isTogglingThis ? 'opacity-50' : ''}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ease-in-out mt-[1px] ${
                                    isModuleEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Child Content */}
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-w-0">
          {children}
        </div>
      </div>
    </CompanyContext.Provider>
  );
}
