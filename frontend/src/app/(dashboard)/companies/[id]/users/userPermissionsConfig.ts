import {
  ShoppingBag,
  Database,
  Users,
  Sparkles,
  Landmark,
  MonitorSmartphone,
  ScanBarcode,
  Package,
  Coffee,
  Layers,
  FileText,
  Briefcase,
  Truck,
  BookOpen,
  Megaphone,
  PackageCheck,
  DatabaseZap,
  LayoutGrid,
  Repeat,
  Bell,
  Feather,
  Boxes,
  UserCheck,
  Shield,
  GraduationCap,
  Archive,
  FileCode2,
  Globe,
  Settings,
  Store,
  Send
} from 'lucide-react';

export interface InitialPageOption {
  value: string;
  label: string;
  group: string;
}

export const INITIAL_PAGE_OPTIONS: InitialPageOption[] = [
  { value: 'DEFAULT', label: 'Padrão (Dashboard / Catálogo)', group: 'Visão Geral' },
  { value: '/b2c-storefront', label: 'B2C (Loja Aberta & Cupons)', group: 'Canais de Venda & Balcão' },
  { value: '/pdv', label: 'PDV — Frente de Caixa', group: 'Canais de Venda & Balcão' },
  { value: '/pdv/horus-sync', label: 'PDV — Sincronizar com Horus', group: 'Canais de Venda & Balcão' },
  { value: '/product-search', label: 'Busca Preço & Endereçamento', group: 'Canais de Venda & Balcão' },

  { value: '/encomendas', label: 'Encomendas de Clientes', group: 'Canais de Venda & Balcão' },
  { value: '/orders', label: 'Gestão de Pedidos', group: 'Canais de Venda & Balcão' },
  { value: '/orders/intake', label: 'Mesa de Pedidos (Intake B2B)', group: 'Canais de Venda & Balcão' },
  { value: '/proposals', label: 'Propostas Comerciais', group: 'Canais de Venda & Balcão' },
  { value: '/subscriptions', label: 'Assinaturas & Recorrência', group: 'Canais de Venda & Balcão' },
  { value: '/cafeteria/tables', label: 'Cafeteria (Mesas & Comandas)', group: 'Cafeteria & Food Service' },
  { value: '/cafeteria/kds', label: 'Cafeteria (KDS Barista / Cozinha)', group: 'Cafeteria & Food Service' },
  { value: '/cafeteria/menu', label: 'Cafeteria (Cardápio Digital)', group: 'Cafeteria & Food Service' },
  { value: '/logistics/conference', label: 'Logística / Conferência Horus', group: 'Horus, Logística & Estoque' },
  { value: '/inventory', label: 'Inventário & Balanço', group: 'Horus, Logística & Estoque' },
  { value: '/bookinfo/orders', label: 'Bookinfo (Pedidos)', group: 'Horus, Logística & Estoque' },
  { value: '/orders/dropship', label: 'Dropship (Erdos)', group: 'Horus, Logística & Estoque' },
  { value: '/horus-direct/pedidos', label: 'Horus Direct (SQL)', group: 'Horus, Logística & Estoque' },
  { value: '/dbm', label: 'DBM (Catálogo & Metadados)', group: 'Horus, Logística & Estoque' },
  { value: '/products', label: 'Catálogo de Produtos', group: 'CRM, Catálogo & Comercial' },
  { value: '/customers', label: 'Empresas & Clientes', group: 'CRM, Catálogo & Comercial' },
  { value: '/agents', label: 'Vendedores / Representantes', group: 'CRM, Catálogo & Comercial' },
  { value: '/commercial-policies', label: 'Políticas Comerciais', group: 'CRM, Catálogo & Comercial' },
  { value: '/notifications', label: 'Central de Notificações', group: 'CRM, Catálogo & Comercial' },
  { value: '/schools', label: 'Escolas & Eventos', group: 'Verticais Especializadas' },
  { value: '/editorial', label: 'Editorial & Projetos', group: 'Verticais Especializadas' },
  { value: '/authors', label: 'Gestão de Autores', group: 'Verticais Especializadas' },
  { value: '/hosted-sites', label: 'Sites Institucionais', group: 'Verticais Especializadas' },
  { value: '/financial', label: 'Financeiro & Contas', group: 'Financeiro, Fiscal & Admin' },
  { value: '/services', label: 'Serviços & OS', group: 'Financeiro, Fiscal & Admin' },
  { value: '/settings/sefaz-download', label: 'Download SEFAZ (XML)', group: 'Financeiro, Fiscal & Admin' },
  { value: '/settings', label: 'Configurações da Loja', group: 'Financeiro, Fiscal & Admin' },
];

export interface ModulePermissionItem {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: any;
  companyCheck?: (company: any) => boolean;
}

export interface ModulePermissionCategory {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  badgeColor: string;
}

export const MODULE_PERMISSION_CATEGORIES: ModulePermissionCategory[] = [
  {
    id: 'sales_channels',
    title: '1. Canais de Venda, B2C & Balcão',
    subtitle: 'Loja B2C, PDV, Busca Preço, Encomendas, Pedidos, Mesa B2B e Propostas.',
    icon: ShoppingBag,
    badgeColor: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20',
  },
  {
    id: 'horus_logistics',
    title: '2. Ecossistema Horus, Logística & Estoque',
    subtitle: 'Conferência WMS, Inventário, Consignação, Dropship Erdos, Bookinfo, Horus SQL e DBM.',
    icon: Database,
    badgeColor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20',
  },
  {
    id: 'crm_commercial',
    title: '3. CRM, Catálogo & Equipe Comercial',
    subtitle: 'Produtos, Clientes, Vendedores/Rep, Políticas de Preço, Marketing e Notificações.',
    icon: Users,
    badgeColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
  },
  {
    id: 'verticals',
    title: '4. Verticais Especializadas & Portais',
    subtitle: 'Cafeteria & Food, Escolas & Eventos, Editorial, Autores e Sites Institucionais.',
    icon: Sparkles,
    badgeColor: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
  },
  {
    id: 'financial_admin',
    title: '5. Financeiro, Fiscal & Administração',
    subtitle: 'Financeiro/Boletos, Ordem de Serviço (NFS-e), Download SEFAZ e Configurações.',
    icon: Landmark,
    badgeColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
  },
];

export const MODULE_PERMISSIONS_LIST: ModulePermissionItem[] = [
  // 1. Canais de Venda, B2C & Balcão
  {
    id: 'b2c',
    label: 'B2C (Loja Aberta & Cupons)',
    description: 'Gestão de vitrines B2C, pedidos, clientes e cupons CPF',
    category: 'sales_channels',
    icon: Store,
    companyCheck: (c) => Boolean(c?.module_b2c_storefront),
  },
  {
    id: 'pdv',
    label: 'PDV — Frente de Caixa',
    description: 'Frente de caixa rápido, leitor de barras e vale-livro',
    category: 'sales_channels',
    icon: MonitorSmartphone,
    companyCheck: (c) => Boolean(c?.module_pdv),
  },
  {
    id: 'pdv_horus_sync',
    label: 'PDV — Sincronizar com Horus',
    description: 'Sintetização de vendas do PDV e envio de pedidos em lote para o Horus ERP',
    category: 'sales_channels',
    icon: Send,
    companyCheck: (c) => Boolean(c?.module_pdv),
  },

  {
    id: 'busca_preco',
    label: 'Busca Preço & Endereçamento',
    description: 'Consulta instantânea de ISBNs, saldos, capas e prateleiras',
    category: 'sales_channels',
    icon: ScanBarcode,
    companyCheck: (c) => Boolean(c?.module_busca_preco),
  },
  {
    id: 'encomendas',
    label: 'Módulo Encomendas',
    description: 'Central de encomendas de clientes, reservas e acompanhamento',
    category: 'sales_channels',
    icon: Package,
    companyCheck: (c) => Boolean(c?.module_encomendas),
  },
  {
    id: 'orders',
    label: 'Pedidos & Vendas',
    description: 'Visualização e acompanhamento de pedidos B2B/B2C',
    category: 'sales_channels',
    icon: ShoppingBag,
    companyCheck: (c) => Boolean(c?.module_orders ?? true),
  },
  {
    id: 'order_intake',
    label: 'Mesa de Pedidos B2B',
    description: 'Validação na mesa, importação via planilha e políticas comerciais',
    category: 'sales_channels',
    icon: Layers,
    companyCheck: (c) => Boolean(c?.module_order_intake),
  },
  {
    id: 'proposals',
    label: 'Propostas Comerciais',
    description: 'Geração e acompanhamento de orçamentos e propostas',
    category: 'sales_channels',
    icon: FileText,
    companyCheck: (c) => Boolean(c?.module_proposals),
  },
  {
    id: 'subscriptions',
    label: 'Assinaturas & Clubes',
    description: 'Gestão de planos e assinantes recorrentes',
    category: 'sales_channels',
    icon: Repeat,
    companyCheck: (c) => Boolean(c?.module_subscriptions),
  },

  // 2. Ecossistema Horus, Logística & Estoque
  {
    id: 'logistics',
    label: 'Logística Hórus / WMS',
    description: 'Conferência cega de expedição, volumes e filiais',
    category: 'horus_logistics',
    icon: Truck,
    companyCheck: (c) => Boolean(c?.module_logistica_horus),
  },
  {
    id: 'inventory',
    label: 'Inventário & Balanço',
    description: 'Contagem de estoque multi-operador e divergências',
    category: 'horus_logistics',
    icon: Boxes,
    companyCheck: (c) => Boolean(c?.has_inventory_module),
  },
  {
    id: 'consignment',
    label: 'Acervo Consignado',
    description: 'Gestão de remessas consignadas e acertos de contas',
    category: 'horus_logistics',
    icon: Archive,
    companyCheck: (c) => Boolean(c?.module_consignment),
  },
  {
    id: 'bookinfo',
    label: 'Bookinfo Hub',
    description: 'Automação de pedidos de venda e compra Bookinfo',
    category: 'horus_logistics',
    icon: BookOpen,
    companyCheck: (c) => Boolean(c?.uses_bookinfo || c?.bookinfo_sync_enabled || c?.bookinfo_supplier_enabled),
  },
  {
    id: 'dropship',
    label: 'Dropship (Erdos)',
    description: 'Pedidos Erdos, tabelas de preço e logs de estoque',
    category: 'horus_logistics',
    icon: PackageCheck,
    companyCheck: (c) => Boolean(c?.module_dropship),
  },
  {
    id: 'horus_sql',
    label: 'Horus Direct (SQL)',
    description: 'Pedidos diretos no SQL do Horus e conciliação Vindi',
    category: 'horus_logistics',
    icon: DatabaseZap,
    companyCheck: (c) => Boolean(c?.module_horus_sql),
  },
  {
    id: 'dbm',
    label: 'DBM (Catálogo & Metadados)',
    description: 'Consulta de catálogo nacional, tiragens e enriquecimento DBM',
    category: 'horus_logistics',
    icon: LayoutGrid,
    companyCheck: (c) => Boolean(c?.module_horus_sql && c?.horus_sql_feature_dbm),
  },
  {
    id: 'distributors',
    label: 'Distribuidoras Parceiras',
    description: 'Gestão de catálogos e repasse com distribuidoras',
    category: 'horus_logistics',
    icon: Truck,
    companyCheck: (c) => Boolean(c?.module_dropship || c?.uses_horus),
  },

  // 3. CRM, Catálogo & Equipe Comercial
  {
    id: 'products',
    label: 'Produtos & Catálogo',
    description: 'Listagem de produtos, marcas, categorias e capas',
    category: 'crm_commercial',
    icon: Package,
    companyCheck: (c) => Boolean(c?.module_products ?? true),
  },
  {
    id: 'customers',
    label: 'Empresas & Clientes',
    description: 'Cadastro e gestão de carteiras de clientes B2B/B2C',
    category: 'crm_commercial',
    icon: Users,
    companyCheck: (c) => Boolean(c?.module_customers ?? true),
  },
  {
    id: 'agents',
    label: 'Vendedores / Representantes',
    description: 'Gestão da equipe comercial e comissionamento',
    category: 'crm_commercial',
    icon: UserCheck,
    companyCheck: (c) => Boolean(c?.module_agents),
  },
  {
    id: 'commercial',
    label: 'Políticas Comerciais',
    description: 'Regras de desconto, alçadas e tabelas de preços',
    category: 'crm_commercial',
    icon: Shield,
    companyCheck: (c) => Boolean(c?.module_commercial),
  },
  {
    id: 'promotions',
    label: 'Marketing & Vitrines',
    description: 'Vitrines da loja, campanhas e promoções',
    category: 'crm_commercial',
    icon: Megaphone,
    companyCheck: (c) => Boolean(c?.module_marketing),
  },
  {
    id: 'notifications',
    label: 'Central de Notificações',
    description: 'Alertas operacionais e comunicados do sistema',
    category: 'crm_commercial',
    icon: Bell,
    companyCheck: (c) => Boolean(c?.module_notifications),
  },

  // 4. Verticais Especializadas & Portais
  {
    id: 'cafeteria',
    label: 'Cafeteria & Restaurante',
    description: 'Mesas, comandas, KDS barista/cozinha e cardápio digital',
    category: 'verticals',
    icon: Coffee,
    companyCheck: (c) => Boolean(c?.module_cafeteria),
  },
  {
    id: 'schools',
    label: 'Escolas & Eventos',
    description: 'Gestão de escolas parceiras, listas, passeios e vouchers',
    category: 'verticals',
    icon: GraduationCap,
    companyCheck: (c) => Boolean(c?.module_schools),
  },
  {
    id: 'editorial',
    label: 'Editorial & Produção',
    description: 'Projetos editoriais, pipeline Kanban e contratos',
    category: 'verticals',
    icon: BookOpen,
    companyCheck: (c) => Boolean(c?.module_editorial),
  },
  {
    id: 'authors',
    label: 'Gestão de Autores',
    description: 'Cadastro de autores, royalties e relatórios de obras',
    category: 'verticals',
    icon: Feather,
    companyCheck: (c) => Boolean(c?.modulo_autores_ativo),
  },
  {
    id: 'portal_autor',
    label: 'Portal do Autor',
    description: 'Acesso externo e acompanhamento de vendas por autores',
    category: 'verticals',
    icon: Feather,
    companyCheck: (c) => Boolean(c?.modulo_autores_ativo),
  },
  {
    id: 'hosted_sites',
    label: 'Sites Institucionais',
    description: 'Criação e gestão de sites institucionais hospedados',
    category: 'verticals',
    icon: Globe,
    companyCheck: () => true,
  },

  // 5. Financeiro, Fiscal & Administração
  {
    id: 'financial',
    label: 'Financeiro & Boletos',
    description: 'Lançamentos, boletos Cora/Inter, contas e DRE',
    category: 'financial_admin',
    icon: Landmark,
    companyCheck: (c) => Boolean(c?.module_financial || (Array.isArray(c?.payment_providers_enabled) && c.payment_providers_enabled.includes('CORA'))),
  },
  {
    id: 'services',
    label: 'Serviços & NFS-e',
    description: 'Catálogo de serviços, Ordens de Serviço e emissão NFS-e',
    category: 'financial_admin',
    icon: Briefcase,
    companyCheck: (c) => Boolean(c?.module_services),
  },
  {
    id: 'sefaz_download',
    label: 'Download SEFAZ (XML)',
    description: 'Consulta e manifesto de notas fiscais de entrada na SEFAZ',
    category: 'financial_admin',
    icon: FileCode2,
    companyCheck: () => true,
  },
  {
    id: 'settings',
    label: 'Configurações da Loja',
    description: 'Parâmetros gerais, integrações, gateways e certificados',
    category: 'financial_admin',
    icon: Settings,
    companyCheck: () => true,
  },
];

export interface RolePreset {
  id: string;
  label: string;
  description: string;
  initialPage: string;
  fullAccess: boolean;
  modules: string[];
}

export const USER_ROLE_PRESETS: RolePreset[] = [
  {
    id: 'admin_full',
    label: 'Administrador / Acesso Total',
    description: 'Acesso irrestrito a todos os módulos contratados pela empresa.',
    initialPage: 'DEFAULT',
    fullAccess: true,
    modules: [],
  },
  {
    id: 'pdv_balcao',
    label: 'Operador de Caixa / Balcão (PDV)',
    description: 'Focado em atendimento rápido de loja: PDV, Busca Preço, Encomendas e Clientes.',
    initialPage: '/pdv',
    fullAccess: false,
    modules: ['pdv', 'busca_preco', 'encomendas', 'customers', 'products'],
  },
  {
    id: 'comercial_b2b',
    label: 'Comercial & Mesa B2B',
    description: 'Focado em vendas, cotações, clientes, propostas e mesa de pedidos.',
    initialPage: '/orders',
    fullAccess: false,
    modules: ['orders', 'order_intake', 'proposals', 'customers', 'products', 'busca_preco', 'encomendas', 'commercial'],
  },
  {
    id: 'logistica_estoque',
    label: 'Logística, Conferência & Estoque',
    description: 'Focado em expedição, conferência de pedidos, inventário e busca de produtos.',
    initialPage: '/logistics/conference',
    fullAccess: false,
    modules: ['logistics', 'inventory', 'busca_preco', 'orders', 'products', 'dropship', 'bookinfo'],
  },
  {
    id: 'financeiro_fiscal',
    label: 'Financeiro & Faturamento',
    description: 'Focado em contas a pagar/receber, boletos, serviços/NFS-e e XML SEFAZ.',
    initialPage: '/financial',
    fullAccess: false,
    modules: ['financial', 'services', 'sefaz_download', 'orders', 'customers'],
  },
];
