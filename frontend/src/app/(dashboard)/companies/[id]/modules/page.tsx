'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Loader2, Globe, Box, Boxes, Users, Megaphone, MonitorSmartphone, Layers,
  ShieldAlert, ArrowRightLeft, DollarSign, Tags, ShoppingBag, Database,
  FileText, ClipboardList, Smartphone, ScanBarcode, BarChart3, ListOrdered,
  BookOpen, GraduationCap, UserCircle, Bell, DatabaseZap, Zap, AlertTriangle,
  CreditCard, Feather, LayoutGrid, Coffee, Package, ChevronDown, ChevronRight,
  Search, ArrowRight, CheckCircle2
} from 'lucide-react';

import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany, Company } from '../context';
import HorusApiBridgeMasterPanel from '@/components/horus/HorusApiBridgeMasterPanel';

interface MobileModules {
  app_enabled: boolean;
  pdv: boolean;
  conferencia: boolean;
  vendas: boolean;
  pedidos: boolean;
  catalogo: boolean;
  clientes: boolean;
  cafeteria: boolean;
}

const DEFAULT_MOBILE_MODULES: MobileModules = {
  app_enabled: false,
  pdv: false,
  conferencia: false,
  vendas: false,
  pedidos: false,
  catalogo: false,
  clientes: false,
  cafeteria: false,
};

interface ModuleDef {
  key: keyof Company;
  title: string;
  desc: string;
  icon: any;
  colorClass: string;
  badge?: string;
  configHref?: string;
  disabledReason?: (c: Company) => string | null;
}

export default function CompanyModulesPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company, refreshCompany } = useCompany();

  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    core: true,
    sales: true,
    horus: false,
    verticals: false,
    crm_finance: false,
    mobile: false,
  });

  // ─── Mobile Modules State ──────────────────────────────────────────
  const [mobileModules, setMobileModules] = useState<MobileModules>(DEFAULT_MOBILE_MODULES);
  const [loadingMobile, setLoadingMobile] = useState(true);
  const [togglingMobile, setTogglingMobile] = useState<string | null>(null);

  // ─── Horus SQL Direct — Features State ────────────────────────────
  interface HorusSQLFeatures {
    vindi_baixa: boolean;
    pedidos: boolean;
    dbm?: boolean;
  }
  const [horusSQLData, setHorusSQLData] = useState<{
    sql_configured: boolean;
    module_horus_sql: boolean;
    features: HorusSQLFeatures;
  } | null>(null);
  const [loadingHorusSQL, setLoadingHorusSQL] = useState(true);
  const [togglingHorusFeature, setTogglingHorusFeature] = useState<string | null>(null);

  // ─── Licença Horus PDV Desktop (.EXE) & Sync por Range ─────────────
  const [pdvLicense, setPdvLicense] = useState<{
    enabled: boolean;
    range_sync_enabled: boolean;
    horus_sync_enabled: boolean;
    expires_at: string;
    expires_at_br?: string | null;
    days_remaining?: number | null;
    is_valid?: boolean;
    status_label?: string;
    license_key?: string | null;
  }>({
    enabled: false,
    range_sync_enabled: false,
    horus_sync_enabled: true,
    expires_at: '',
  });
  const [savingPdvLicense, setSavingPdvLicense] = useState(false);

  useEffect(() => {
    async function fetchPdvDesktopLicense() {
      const token = getToken();
      if (!token || !companyId) return;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/desktop-license`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setPdvLicense({
            enabled: !!data.enabled,
            range_sync_enabled: !!data.range_sync_enabled,
            horus_sync_enabled: data.horus_sync_enabled ?? true,
            expires_at: data.expires_at || '',
            expires_at_br: data.expires_at_br,
            days_remaining: data.days_remaining,
            is_valid: data.is_valid,
            status_label: data.status_label,
            license_key: data.license_key,
          });
        }
      } catch {
        // silencioso
      }
    }
    fetchPdvDesktopLicense();
  }, [companyId]);

  async function handleSavePdvDesktopLicense(override?: Partial<typeof pdvLicense>) {
    setSavingPdvLicense(true);
    const token = getToken();
    const nextState = { ...pdvLicense, ...override };
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/desktop-license`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            enabled: nextState.enabled,
            expires_at: nextState.expires_at || null,
            range_sync_enabled: nextState.range_sync_enabled,
            horus_sync_enabled: nextState.horus_sync_enabled,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.detail || 'Erro ao atualizar licença do Horus PDV Desktop.');
        return;
      }
      const data = await res.json();
      setPdvLicense({
        enabled: !!data.enabled,
        range_sync_enabled: !!data.range_sync_enabled,
        horus_sync_enabled: data.horus_sync_enabled ?? true,
        expires_at: data.expires_at || '',
        expires_at_br: data.expires_at_br,
        days_remaining: data.days_remaining,
        is_valid: data.is_valid,
        status_label: data.status_label,
        license_key: data.license_key,
      });
      toast.success('Configurações do PDV atualizadas com sucesso!');

    } catch (e: any) {
      toast.error(`Erro de rede: ${e?.message || e}`);
    } finally {
      setSavingPdvLicense(false);
    }
  }

  function addDaysToLicenseDate(days: number) {
    const start = new Date();
    start.setDate(start.getDate() + days);
    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    setPdvLicense((prev) => ({ ...prev, enabled: true, expires_at: iso }));
  }

  useEffect(() => {
    async function fetchMobileModules() {
      const token = getToken();
      if (!token) {
        setLoadingMobile(false);
        return;
      }
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/seller/mobile/modules/${companyId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setMobileModules(data.modules ?? DEFAULT_MOBILE_MODULES);
        }
      } catch {
        // silencioso
      } finally {
        setLoadingMobile(false);
      }
    }
    fetchMobileModules();
  }, [companyId]);

  useEffect(() => {
    async function fetchHorusSQLFeatures() {
      const token = getToken();
      if (!token || !companyId) {
        setLoadingHorusSQL(false);
        return;
      }
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/horus-sql/features`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) setHorusSQLData(await res.json());
      } catch {
        // silencioso
      } finally {
        setLoadingHorusSQL(false);
      }
    }
    fetchHorusSQLFeatures();
  }, [companyId]);

  async function handleToggleHorusSQLFeature(feature: keyof HorusSQLFeatures) {
    if (!horusSQLData) return;
    setTogglingHorusFeature(feature);
    const newValue = !horusSQLData.features[feature];
    const token = getToken();
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/horus-sql/features`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ [`horus_sql_feature_${feature}`]: newValue }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.detail || 'Erro ao salvar feature Horus SQL.');
        return;
      }
      setHorusSQLData((prev) =>
        prev ? { ...prev, features: { ...prev.features, [feature]: newValue } } : prev
      );
      toast.success(`Feature ${newValue ? 'ativada ✓' : 'desativada'} com sucesso!`);
    } catch (err: any) {
      toast.error(`Erro de rede: ${err?.message || err}`);
    } finally {
      setTogglingHorusFeature(null);
    }
  }

  async function handleToggleMobileModule(key: keyof MobileModules) {
    setTogglingMobile(key);
    const newValue = !mobileModules[key];
    const updated = { ...mobileModules, [key]: newValue };
    const token = getToken();
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/seller/mobile/modules/${companyId}`;

    try {
      if (!token) {
        toast.error('Sem token — faça login novamente.');
        return;
      }
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: newValue }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Erro ${res.status}: ${body?.detail || 'Falha ao salvar'}`);
        return;
      }
      setMobileModules(updated);
      toast.success(`Módulo ${key} ${newValue ? 'ativado ✓' : 'desativado'} no App!`);
    } catch (err: any) {
      toast.error(`Erro de rede: ${err?.message || err}`);
    } finally {
      setTogglingMobile(null);
    }
  }

  async function handleToggleModule(moduleName: string, currentValue: boolean) {
    if (!company) return;
    setTogglingModule(moduleName);

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
      module_mercadolivre: company.module_mercadolivre ?? false,
      [moduleName]: !currentValue,
    };

    if (moduleName === 'module_horus_erp' && !currentValue === true) {
      updates.module_b2b_native = false;
      updates.module_products = false;
      toast.info('Módulo Produtos local desativado para priorizar o catálogo do Horus ERP.');
    } else if (moduleName === 'module_b2b_native' && !currentValue === true) {
      updates.module_horus_erp = false;
      updates.module_products = true;
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
      toast.success('Módulo atualizado com sucesso!');
      refreshCompany();
    } catch {
      toast.error('Erro ao mudar status do módulo.');
    } finally {
      setTogglingModule(null);
    }
  }

  if (!company) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  const Switch = ({
    active,
    onClick,
    disabled,
    colorClass = 'bg-[var(--color-primary-base)]',
  }: {
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
    colorClass?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        active ? colorClass : 'bg-slate-200 dark:bg-slate-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          active ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  // Definição estruturada das Categorias de Módulos
  const moduleCategories: Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: any;
    accent: string;
    items: ModuleDef[];
  }> = [
    {
      id: 'sales',
      title: '2. Canais de Venda, Lojas & PDV',
      subtitle: 'B2C, Pedidos B2B, Mesa Comercial (Intake), Propostas, PDV e Assinaturas.',
      icon: ShoppingBag,
      accent: 'text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/10',
      items: [
        {
          key: 'module_b2c_storefront',
          title: 'B2C (Loja Virtual Aberta)',
          desc: 'Loja virtual B2C integrada ao Horus, cupons/vale-livro, subdomínio automático e checkout.',
          icon: Globe,
          colorClass: 'bg-fuchsia-600',
          badge: 'B2C',
          configHref: `/companies/${companyId}/tray`,
        },
        {
          key: 'module_mercadolivre',
          title: 'Mercado Livre (Hub Integrador)',
          desc: 'Criação de anúncios em 1 clique, pré-configuração de categorias (MLB1196), sync Delta de estoque Horus/Cronuz e recepção de pedidos.',
          icon: ShoppingBag,
          colorClass: 'bg-amber-500',
          badge: 'Meli Hub',
        },
        {
          key: 'module_orders',
          title: 'Pedidos B2B',
          desc: 'Fluxo de captação de pedidos B2B (Carrinho / Orçamentos).',
          icon: ShoppingBag,
          colorClass: 'bg-orange-500',
        },
        {
          key: 'module_order_intake',
          title: 'Mesa de Pedidos (Análise & Intake B2B)',
          desc: 'Validação de pedidos via Planilha Excel, E-mail ou Manual, políticas de consignação e envio ao Horus.',
          icon: ListOrdered,
          colorClass: 'bg-indigo-600',
          badge: 'Intake',
        },
        {
          key: 'module_proposals',
          title: 'Gestão de Propostas & Orçamentos',
          desc: 'Propostas e orçamentos comerciais com conversão em Pedido e OS.',
          icon: FileText,
          colorClass: 'bg-emerald-600',
          configHref: `/companies/${companyId}/proposals`,
        },
        {
          key: 'module_pdv',
          title: 'Ponto de Venda (PDV) & HorusPDV.exe',
          desc: 'Frente de caixa web e licenciamento do aplicativo Windows (Online/Offline).',
          icon: MonitorSmartphone,
          colorClass: 'bg-slate-900 dark:bg-indigo-600',
        },
        {
          key: 'module_subscriptions',
          title: 'Assinaturas (Recorrência)',
          desc: 'Clubes de assinatura e planos recorrentes.',
          icon: Layers,
          colorClass: 'bg-rose-500',
        },
        {
          key: 'module_encomendas',
          title: 'Módulo de Encomendas',
          desc: 'Gestão de encomendas de livros no balcão e Busca Preço com aviso via WhatsApp.',
          icon: Package,
          colorClass: 'bg-teal-600',
        },
      ],
    },
    {
      id: 'horus',
      title: '3. Ecossistema Horus, Logística & Estoque',
      subtitle: 'Horus SQL Direct, Agente Bridge (.EXE), Dropship Erdos, Logística, Consignação e Inventário.',
      icon: Database,
      accent: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
      items: [
        {
          key: 'module_dropship',
          title: 'Dropshipping (Hub-Erdos)',
          desc: 'Credenciais Multi-Token por CNPJ, remessa (6.923), venda (6.118) e sync de estoque.',
          icon: Database,
          colorClass: 'bg-amber-500',
          configHref: `/companies/${companyId}/dropship`,
        },
        {
          key: 'module_logistica_horus',
          title: 'Logística Horus (Conferência & Volumes)',
          desc: 'Conferência de pedidos por volumes/caixas, etiquetas e sincronização com o ERP.',
          icon: ClipboardList,
          colorClass: 'bg-indigo-500',
        },
        {
          key: 'module_consignment',
          title: 'Consignação Horus',
          desc: 'Acertos e devoluções de consignação integrados com a API Horus.',
          icon: Database,
          colorClass: 'bg-orange-500',
        },
        {
          key: 'module_busca_preco',
          title: 'Busca Preço',
          desc: 'Consulta de produto e visualização de estoque por filial em tempo real via API Horus.',
          icon: ScanBarcode,
          colorClass: 'bg-teal-600',
        },
        {
          key: 'has_inventory_module',
          title: 'Módulo de Inventário',
          desc: 'Contagem física de estoque, bipagem mobile/offline e conciliação.',
          icon: Boxes,
          colorClass: 'bg-teal-500',
        },
      ],
    },
    {
      id: 'verticals',
      title: '4. Verticais Especializadas (Escolas, Editorial, Autores & Cafeteria)',
      subtitle: 'Módulos dedicados por segmento de negócio.',
      icon: GraduationCap,
      accent: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
      items: [
        {
          key: 'module_schools',
          title: 'Escolas, Passeios e Eventos',
          desc: 'Gestão de escolas parceiras, turmas, feiras, listas e vouchers/amigo secreto.',
          icon: GraduationCap,
          colorClass: 'bg-indigo-600',
        },
        {
          key: 'modulo_autores_ativo',
          title: 'Portal do Autor',
          desc: 'Subdomínio exclusivo autores.[seller].cronuzb2b.com.br e painel de direitos autorais.',
          icon: Feather,
          colorClass: 'bg-amber-500',
        },
        {
          key: 'module_editorial',
          title: 'Produção Editorial',
          desc: 'Esteiras/etapas de livros (diagramação, revisão, capa, aprovação) e integração Horus.',
          icon: BookOpen,
          colorClass: 'bg-emerald-600',
        },
        {
          key: 'module_cafeteria',
          title: 'Cafeteria & Bistrô Omnichannel',
          desc: 'Salão e mesas, comandas, fila de barista (KDS) e integração ao caixa PDV.',
          icon: Coffee,
          colorClass: 'bg-amber-600',
        },
      ],
    },
    {
      id: 'crm_finance',
      title: '5. CRM, Comercial, Financeiro & Alertas',
      subtitle: 'Carteira de clientes, políticas comerciais, representantes, financeiro e notificações.',
      icon: DollarSign,
      accent: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
      items: [
        {
          key: 'module_products',
          title: 'Catálogo de Produtos (Local)',
          desc: 'Gestão nativa de produtos, marcas e categorias na base do Cronuz.',
          icon: Box,
          colorClass: 'bg-indigo-600',
          disabledReason: (c) => (c.module_horus_erp ? 'Gerido pelo Horus ERP' : null),
        },
        {
          key: 'module_customers',
          title: 'Gestão de Clientes',
          desc: 'Cadastro e listagem da carteira de clientes.',
          icon: Users,
          colorClass: 'bg-sky-500',
        },
        {
          key: 'module_crm',
          title: 'CRM 360º',
          desc: 'Relacionamento, tarefas, pipeline comercial e follow-ups.',
          icon: Users,
          colorClass: 'bg-purple-500',
        },
        {
          key: 'module_commercial',
          title: 'Políticas de Preço',
          desc: 'Tabelas de preço e descontos segmentados.',
          icon: Tags,
          colorClass: 'bg-indigo-500',
        },
        {
          key: 'module_agents',
          title: 'Vendedores & Representantes',
          desc: 'Gestão de equipe comercial externa e comissionamento.',
          icon: ShieldAlert,
          colorClass: 'bg-teal-500',
        },
        {
          key: 'module_financial',
          title: 'Gestão Financeira',
          desc: 'Contas a pagar/receber, conciliação e DRE.',
          icon: DollarSign,
          colorClass: 'bg-amber-500',
          configHref: `/companies/${companyId}/payments`,
        },
        {
          key: 'module_services',
          title: 'Gestão de Serviços (OS)',
          desc: 'Ordens de serviço e faturamento de contratos.',
          icon: Globe,
          colorClass: 'bg-blue-500',
        },
        {
          key: 'module_marketing',
          title: 'Marketing & Vitrines',
          desc: 'Criação de vitrines digitais e campanhas promocionais.',
          icon: Megaphone,
          colorClass: 'bg-fuchsia-500',
        },
        {
          key: 'module_notifications',
          title: 'Notificações & Alertas',
          desc: 'Alertas programáveis exibidos no storefront e painel.',
          icon: Bell,
          colorClass: 'bg-teal-500',
          configHref: `/companies/${companyId}/alerts`,
        },
      ],
    },
  ];

  const allFlatItems = moduleCategories.flatMap((c) => c.items);
  const totalActiveCount =
    allFlatItems.filter((i) => Boolean(company[i.key])).length +
    (company.module_horus_erp ? 1 : 0) +
    (company.module_b2b_native ? 1 : 0) +
    (company.module_horus_sql ? 1 : 0);

  const toggleAllCategories = (expand: boolean) => {
    setOpenCategories({
      core: expand,
      sales: expand,
      horus: expand,
      verticals: expand,
      crm_finance: expand,
      mobile: expand,
    });
  };

  const filterMatches = (item: ModuleDef) => {
    const isAct = Boolean(company[item.key]);
    if (statusFilter === 'ACTIVE' && !isAct) return false;
    if (statusFilter === 'INACTIVE' && isAct) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q)
      );
    }
    return true;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-12"
    >
      {/* Cabeçalho com Busca, Contador e Filtro de Status */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md sticky top-0 z-10 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Central de Módulos &amp; Licenças
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> {totalActiveCount} módulos ativos
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Clique em uma categoria abaixo para abrir seus módulos, ativar/desativar ou ir direto para a configuração.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleAllCategories(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Expandir Tudo
            </button>
            <button
              type="button"
              onClick={() => toggleAllCategories(false)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Recolher Tudo
            </button>
          </div>
        </div>

        {/* Barra de Pesquisa e Filtro Ativos/Inativos */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar módulo por nome (ex: B2C, PDV, Horus SQL, Dropship, Escolas)..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Apenas Ativos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                statusFilter === 'INACTIVE'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Inativos
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* CATEGORIA 1: MOTOR PRINCIPAL DE CATÁLOGO & ERP (SISTEMA CORE) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setOpenCategories((p) => ({ ...p, core: !p.core }))}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                <ArrowRightLeft className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  1. Motor Principal de Catálogo &amp; ERP (Sistema Core)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Define se a empresa opera integrada ao Horus ERP ou com catálogo 100% local Cronuz.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {company.module_horus_erp ? 'Horus ERP Ativo' : 'B2B Nativo Ativo'}
              </span>
              {openCategories.core ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </button>

          {openCategories.core && (
            <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                    B2B Horus ERP (Catálogo &amp; Saldo em Tempo Real)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lê o acervo, preços e saldos diretamente da API REST TServerB2B do Horus ERP.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/companies/${companyId}/horus`}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                  >
                    Configurar Horus <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Switch
                    active={company.module_horus_erp}
                    onClick={() => handleToggleModule('module_horus_erp', company.module_horus_erp)}
                    disabled={togglingModule !== null}
                    colorClass="bg-orange-500"
                  />
                </div>
              </div>

              <div className="theme-horus:hidden p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    B2B Nativo (Catálogo Local Cronuz)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Operação 100% local sem ERP externo. Habilita o módulo de Produtos automaticamente.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    active={company.module_b2b_native}
                    onClick={() => handleToggleModule('module_b2b_native', company.module_b2b_native)}
                    disabled={togglingModule !== null}
                    colorClass="bg-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CATEGORIAS 2, 3, 4 E 5 */}
        {moduleCategories.map((cat) => {
          const CatIcon = cat.icon;
          const filteredItems = cat.items.filter(filterMatches);
          const activeInCat = cat.items.filter((i) => Boolean(company[i.key])).length;
          const isOpen =
            Boolean(searchTerm.trim()) ||
            statusFilter !== 'ALL' ||
            Boolean(openCategories[cat.id]);

          if (filteredItems.length === 0 && cat.id !== 'horus') return null;

          return (
            <div
              key={cat.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => setOpenCategories((p) => ({ ...p, [cat.id]: !p[cat.id] }))}
                className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2.5 rounded-xl shrink-0 ${cat.accent}`}>
                    <CatIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      {cat.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {cat.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      activeInCat > 0
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {activeInCat} de {cat.items.length} ativos
                  </span>
                  {isOpen ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredItems.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = Boolean(company[item.key]);
                    const disabledMsg = item.disabledReason ? item.disabledReason(company) : null;

                    return (
                      <div key={String(item.key)} className="space-y-3">
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                            <div
                              className={`p-2 rounded-xl border shrink-0 ${
                                isActive
                                  ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                                  : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                              }`}
                            >
                              <ItemIcon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                  {item.title}
                                </p>
                                {item.badge && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-800 rounded dark:bg-indigo-900/40 dark:text-indigo-300">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {item.desc}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-3 shrink-0">
                            {disabledMsg && (
                              <span className="text-xs font-semibold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-lg dark:bg-rose-500/10">
                                {disabledMsg}
                              </span>
                            )}
                            {item.configHref && (
                              <Link
                                href={item.configHref}
                                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                              >
                                Configurar <ArrowRight className="w-3.5 h-3.5" />
                              </Link>
                            )}
                            <Switch
                              active={isActive}
                              onClick={() => handleToggleModule(String(item.key), isActive)}
                              disabled={togglingModule !== null || Boolean(disabledMsg)}
                              colorClass={item.colorClass}
                            />
                          </div>
                        </div>

                        {/* Sub-painel do PDV Desktop (.EXE) quando module_pdv está ativo */}
                        {item.key === 'module_pdv' && company.module_pdv && (
                          <div className="mx-4 sm:mx-5 mb-4 p-4 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div>
                                <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                                  🔐 Licença Horus PDV Desktop (.EXE) &amp; Sincronização por Sequência Horus
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                  Controle a validade da chave do aplicativo Windows (Online/Offline) e libere a sincronização em lote por COD_ITEM_INI / COD_ITEM_FIM.
                                </p>
                              </div>
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                                  pdvLicense.is_valid
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                }`}
                              >
                                {pdvLicense.status_label || 'Não configurada'}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    Liberar Uso do HorusPDV.exe
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    Permite abrir e realizar vendas no PDV Windows até a data limite.
                                  </p>
                                </div>
                                <Switch
                                  active={pdvLicense.enabled}
                                  onClick={() => {
                                    const nextEnabled = !pdvLicense.enabled;
                                    setPdvLicense((prev) => ({ ...prev, enabled: nextEnabled }));
                                    handleSavePdvDesktopLicense({ enabled: nextEnabled });
                                  }}
                                  disabled={savingPdvLicense}
                                  colorClass="bg-indigo-600"
                                />
                              </div>

                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    Liberar Sync Catálogo por Range (COD_ITEM_INI/FIM)
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    Habilita o download sequencial de produtos direto da API do Horus.
                                  </p>
                                </div>
                                <Switch
                                  active={pdvLicense.range_sync_enabled}
                                  onClick={() => {
                                    const nextRange = !pdvLicense.range_sync_enabled;
                                    setPdvLicense((prev) => ({ ...prev, range_sync_enabled: nextRange }));
                                    handleSavePdvDesktopLicense({ range_sync_enabled: nextRange });
                                  }}
                                  disabled={savingPdvLicense}
                                  colorClass="bg-emerald-600"
                                />
                              </div>

                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    Liberar Sincronizar com Horus (Envio de Vendas)
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    Exibe a tela &quot;Sincronizar com Horus&quot; no menu lateral do PDV do Seller.
                                  </p>
                                </div>
                                <Switch
                                  active={pdvLicense.horus_sync_enabled}
                                  onClick={() => {
                                    const nextSync = !pdvLicense.horus_sync_enabled;
                                    setPdvLicense((prev) => ({ ...prev, horus_sync_enabled: nextSync }));
                                    handleSavePdvDesktopLicense({ horus_sync_enabled: nextSync });
                                  }}
                                  disabled={savingPdvLicense}
                                  colorClass="bg-teal-600"
                                />
                              </div>
                            </div>


                            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3 pt-1">
                              <div className="flex flex-col sm:flex-row sm:items-end gap-2 flex-1">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Data de Validade da Licença
                                    {pdvLicense.expires_at && (
                                      <span className="ml-2 text-indigo-600 dark:text-indigo-400">
                                        ({pdvLicense.expires_at.split('-').reverse().join('/')})
                                      </span>
                                    )}
                                  </label>
                                  <input
                                    type="date"
                                    value={pdvLicense.expires_at}
                                    onChange={(e) =>
                                      setPdvLicense((prev) => ({ ...prev, expires_at: e.target.value }))
                                    }
                                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => addDaysToLicenseDate(-1)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                                  >
                                    Ontem (Expirar)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => addDaysToLicenseDate(30)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                                  >
                                    +30 Dias
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => addDaysToLicenseDate(90)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                                  >
                                    +90 Dias
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => addDaysToLicenseDate(365)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                                  >
                                    +1 Ano
                                  </button>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={savingPdvLicense}
                                onClick={() => handleSavePdvDesktopLicense()}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                              >
                                {savingPdvLicense
                                  ? 'Gerando Chave...'
                                  : '🔑 Salvar Validade & Liberar Chave'}
                              </button>
                            </div>

                            {pdvLicense.license_key && (
                              <div className="p-2.5 rounded-xl bg-slate-900 text-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="truncate text-[11px] font-mono">
                                  <span className="text-indigo-400 font-bold mr-2">CHAVE ATIVA:</span>
                                  {pdvLicense.license_key}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(pdvLicense.license_key || '');
                                    toast.success('Chave de licença copiada!');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shrink-0"
                                >
                                  📋 Copiar Chave
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Na categoria Horus, inclui também Horus SQL Direct e Agente Bridge (.EXE) */}
                  {cat.id === 'horus' && (
                    <div className="p-4 sm:p-5 space-y-5 bg-slate-50/40 dark:bg-slate-950/30">
                      {/* Horus SQL Direct */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                            <DatabaseZap className="h-4 w-4" /> Horus SQL Direct &amp; Sub-funcionalidades
                          </h4>
                          <Link
                            href={`/companies/${companyId}/horus-sql`}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                          >
                            Configurar Conexão SQL <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>

                        {loadingHorusSQL ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações SQL...
                          </div>
                        ) : !horusSQLData?.sql_configured ? (
                          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-800/40 dark:bg-amber-950/20">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div>
                              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                                Credenciais SQL ainda não configuradas
                              </p>
                              <p className="text-xs text-amber-700 dark:text-amber-400">
                                Configure o acesso ao SQL Server na aba <strong>Horus SQL Direct</strong> antes de habilitar este módulo.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-violet-200 bg-white overflow-hidden shadow-xs dark:border-violet-500/20 dark:bg-slate-900">
                            <div className="px-4 py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                              <div>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                  Habilitar Horus SQL Direct
                                </p>
                                <p className="text-xs text-slate-500">
                                  Libera as rotinas SQL diretas abaixo para o seller.
                                </p>
                              </div>
                              <Switch
                                active={horusSQLData?.module_horus_sql ?? false}
                                onClick={() =>
                                  handleToggleModule(
                                    'module_horus_sql',
                                    horusSQLData?.module_horus_sql ?? false
                                  )
                                }
                                disabled={togglingModule !== null}
                                colorClass="bg-violet-600"
                              />
                            </div>

                            {horusSQLData?.module_horus_sql && (
                              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                <div className="p-4 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                      Baixa Financeira com Vindi
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      Importa extrato da Vindi e gera borderô de baixa no Horus ERP.
                                    </p>
                                  </div>
                                  <Switch
                                    active={horusSQLData?.features.vindi_baixa ?? false}
                                    onClick={() => handleToggleHorusSQLFeature('vindi_baixa')}
                                    disabled={togglingHorusFeature !== null}
                                    colorClass="bg-emerald-500"
                                  />
                                </div>

                                <div className="p-4 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                      Pedidos (Horus SQL)
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      Listagem e acompanhamento de pedidos direto no SQL do Horus.
                                    </p>
                                  </div>
                                  <Switch
                                    active={horusSQLData?.features.pedidos ?? false}
                                    onClick={() => handleToggleHorusSQLFeature('pedidos')}
                                    disabled={togglingHorusFeature !== null}
                                    colorClass="bg-violet-600"
                                  />
                                </div>

                                <div className="p-4 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                      Horus Direct DBM (Painel Operacional &amp; CRM)
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      Módulos de comercial, pesquisa de empresas, produtos e tiragens DBM.
                                    </p>
                                  </div>
                                  <Switch
                                    active={horusSQLData?.features.dbm ?? false}
                                    onClick={() => handleToggleHorusSQLFeature('dbm')}
                                    disabled={togglingHorusFeature !== null}
                                    colorClass="bg-indigo-600"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* API Horus Complementar & Agente Bridge (.EXE) */}
                      <HorusApiBridgeMasterPanel
                        companyId={companyId}
                        onCompanyRefresh={refreshCompany}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* CATEGORIA 6: APLICATIVO MOBILE (ANDROID & iOS) */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setOpenCategories((p) => ({ ...p, mobile: !p.mobile }))}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  6. Aplicativo Mobile (Android &amp; iOS)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Controle de acesso ao App Mobile e liberação de telas (PDV, Conferência, Vendas, Cafeteria).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  mobileModules.app_enabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {mobileModules.app_enabled ? 'App Liberado' : 'App Desativado'}
              </span>
              {openCategories.mobile ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </button>

          {openCategories.mobile && (
            <div className="border-t border-slate-100 dark:border-slate-800">
              <div className="p-4 sm:p-5 flex items-center justify-between bg-violet-50/40 dark:bg-violet-950/20 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Habilitar Login no App Mobile
                  </p>
                  <p className="text-xs text-slate-500">
                    Permite que os usuários desta empresa entrem no aplicativo móvel.
                  </p>
                </div>
                <Switch
                  active={mobileModules.app_enabled}
                  onClick={() => handleToggleMobileModule('app_enabled')}
                  disabled={loadingMobile || togglingMobile !== null}
                  colorClass="bg-violet-600"
                />
              </div>

              <div
                className={`divide-y divide-slate-100 dark:divide-slate-800 ${
                  mobileModules.app_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
                }`}
              >
                {(
                  [
                    {
                      key: 'pdv',
                      label: 'PDV — Ponto de Venda Mobile',
                      desc: 'Realiza vendas e emite pedidos pelo celular.',
                      icon: MonitorSmartphone,
                    },
                    {
                      key: 'conferencia',
                      label: 'Conferência de Pedidos',
                      desc: 'Leitura de código de barras integrada ao Horus.',
                      icon: ScanBarcode,
                    },
                    {
                      key: 'vendas',
                      label: 'Resultado de Vendas',
                      desc: 'Dashboard com indicadores de performance.',
                      icon: BarChart3,
                    },
                    {
                      key: 'pedidos',
                      label: 'Consulta de Pedidos',
                      desc: 'Acompanhamento de pedidos em tempo real.',
                      icon: ListOrdered,
                    },
                    {
                      key: 'catalogo',
                      label: 'Catálogo de Produtos',
                      desc: 'Consulta de preços e estoque disponível.',
                      icon: BookOpen,
                    },
                    {
                      key: 'clientes',
                      label: 'Ficha de Clientes',
                      desc: 'Carteira de clientes e histórico.',
                      icon: UserCircle,
                    },
                    {
                      key: 'cafeteria',
                      label: 'Cafeteria & Comandas',
                      desc: 'Atendimento de mesas e KDS no celular.',
                      icon: Coffee,
                    },
                  ] as Array<{ key: keyof MobileModules; label: string; desc: string; icon: any }>
                ).map((mod) => {
                  const ModIcon = mod.icon;
                  const active = mobileModules[mod.key];
                  return (
                    <div
                      key={mod.key}
                      className="p-4 sm:p-5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          <ModIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            {mod.label}
                          </p>
                          <p className="text-xs text-slate-500">{mod.desc}</p>
                        </div>
                      </div>
                      <Switch
                        active={active}
                        onClick={() => handleToggleMobileModule(mod.key)}
                        disabled={loadingMobile || togglingMobile !== null}
                        colorClass="bg-violet-600"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
