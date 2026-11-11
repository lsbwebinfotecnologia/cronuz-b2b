'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ticket,
  Building2,
  Users,
  Plus,
  Search,
  Download,
  Copy,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  ShoppingBag,
  Settings,
  Database,
  RefreshCw,
  Flame,
  Eye,
  Truck,
  FileText,
  CreditCard,
  Trash2,
  PackageCheck,
  Bell,
  Mail,
  Upload,
  UserPlus,
  KeyRound,
  History,
  MapPin,
  ArrowLeft,
  Globe,
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';

const B2C_ORDER_STATUS_STEPS = [
  { key: 'WAITING_PAYMENT', label: 'Aguardando Pagamento', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
  { key: 'PAID', label: 'Pago', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' },
  { key: 'SEPARATION', label: 'Em Separação', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' },
  { key: 'FINALIZED', label: 'Finalizado', badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' },
  { key: 'DELIVERED', label: 'Entregue', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300' },
  { key: 'CANCELLED', label: 'Cancelado', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' },
];

export default function SellerB2CStorefrontManagementPage({
  viewMode = 'coupons',
  initialTab,
}: {
  viewMode?: 'coupons' | 'orders' | 'customers' | 'settings';
  initialTab?: string;
} = {}) {
  // Determine effective section based on Left Sidebar route
  const router = useRouter();
  const effectiveSection: 'coupons' | 'orders' | 'customers' | 'settings' =
    initialTab === 'orders'
      ? 'orders'
      : initialTab === 'customers'
      ? 'customers'
      : initialTab === 'lgpd'
      ? 'settings'
      : viewMode;
  const [fromCustomerId, setFromCustomerId] = useState<number | null>(null);

  // Sub-filter inside the Coupons page only (Cupons Individuais vs Lotes/Campanhas vs Histórico de Uso)
  const [couponSubView, setCouponSubView] = useState<'list' | 'batches' | 'history'>('list');
  // Sub-tabs inside Settings (Domínio, Rodapé & SEO | Checkout & Pagamento | Pedidos Horus ERP | E-mails do Pedido | Frete & Entrega | Cache | LGPD)
  const [settingsSubTab, setSettingsSubTab] = useState<
    'store_domain' | 'checkout' | 'horus_orders' | 'emails' | 'freight' | 'cache' | 'lgpd'
  >('store_domain');
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [b2cOrders, setB2cOrders] = useState<any[]>([]);
  const [b2cCustomers, setB2cCustomers] = useState<any[]>([]);
  const [pendingAviseMeCount, setPendingAviseMeCount] = useState(0);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [lgpdConsents, setLgpdConsents] = useState<any[]>([]);

  // Filters
  const [couponSearch, setCouponSearch] = useState('');
  const [couponStatusFilter, setCouponStatusFilter] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [customerSearch, setCustomerSearch] = useState('');
  const [onlyStockAlerts, setOnlyStockAlerts] = useState(false);

  // Customer 360 Detail View, Manual Registration & Excel Migration States
  const [selectedCustomer360, setSelectedCustomer360] = useState<any | null>(null);
  const [loadingCustomer360, setLoadingCustomer360] = useState(false);
  const [customerDetailTab, setCustomerDetailTab] = useState<'orders' | 'coupons' | 'logins' | 'profile'>('orders');
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showImportCustomersModal, setShowImportCustomersModal] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [importingCustomers, setImportingCustomers] = useState(false);
  const [sendingResetForId, setSendingResetForId] = useState<number | null>(null);
  const [importResultSummary, setImportResultSummary] = useState<any | null>(null);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: '',
    zip_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    password: '',
  });

  // Order Detail Modal ("Olhinho")
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderEditForm, setOrderEditForm] = useState({
    status: 'WAITING_PAYMENT',
    invoice_number: '',
    invoice_key: '',
    tracking_code: '',
    carrier_name: '',
    tracking_url: '',
  });
  const [savingOrder, setSavingOrder] = useState(false);

  // Modals for Coupon Creation
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [batchForm, setBatchForm] = useState({
    name: '',
    partner_company_name: '',
    partner_document: '',
    batch_mode: 'INDIVIDUAL_CODES', // INDIVIDUAL_CODES or SHARED_CPF_LIMIT
    code_prefix: 'CUPOM',
    shared_code: '',
    quantity: 20,
    coupon_value: 100.0,
    discount_type: 'FIXED_BRL', // FIXED_BRL or PERCENTAGE
    allows_freight_discount: true,
    allow_residual_balance: true,
    min_order_value: 0.0,
    valid_from: '',
    valid_until: '',
    notes: '',
    employees_raw: '', // Optional lines: Nome;CPF;Email
  });

  const [singleForm, setSingleForm] = useState({
    code: '',
    initial_value: 100.0,
    discount_type: 'FIXED_BRL',
    max_uses: 10,
    allows_freight_discount: true,
    allow_residual_balance: true,
    min_order_value: 0.0,
    assigned_name: '',
    assigned_cpf: '',
    assigned_email: '',
    valid_until: '',
  });

  const [settingsForm, setSettingsForm] = useState({
    store_slug: '',
    b2c_custom_domain: '',
    b2c_storefront_open: true,
    allow_zero_balance_sale: false,
    b2c_checkout_mode: 'NATIVE_GATEWAY',
    b2c_default_freight_value: 15.9,
    b2c_free_shipping_min_value: 150.0,
    b2c_lgpd_terms_text: '',
    footer_info: {
      legal_name: '',
      cnpj: '',
      address_line: '',
      whatsapp: '',
      contact_phone: '',
      contact_email: '',
      business_hours: 'Segunda a Sexta, das 09h às 18h',
      about_text: '',
    },
    seo_config: {
      home_title: '{loja} | Livraria e Loja Oficial',
      home_description: 'Compre livros na loja oficial {loja} com entrega rápida para todo o Brasil.',
      product_title_template: '{nome} - ISBN {isbn} | {autor} | {loja}',
      product_description_template: 'Compre o livro {nome} (ISBN {isbn}) de {autor}, editora {editora} na {loja}.',
      category_title_template: '{categoria} - Livros em Oferta | {loja}',
      showcase_title_template: '{vitrine} | Seleção Especial {loja}',
      google_site_verification: '',
      auto_json_ld: true,
    },
    payment_gateway_active: 'EFI',
    vindi_api_key: '',
    vindi_sandbox: true,
    efi_sandbox: true,
    efi_client_id: '',
    efi_client_secret: '',
    efi_payee_code: '',
    origin_zip_code: '',
    correios_user: '',
    correios_password: '',
    freight_config: {
      default_book_weight_kg: 0.35,
      correios_enabled: true,
      carrier_table: [] as any[],
    },
    horus_order_config: {
      enabled: false,
      auto_send_on_paid: false,
      tipo_pedido: 'L',
      cod_param_fiscal_intra: '',
      cod_param_fiscal_inter: '',
      cod_metodo: '1',
      cod_endereco: '1',
      cod_transp: '',
      frete_emit_dest: '1',
      status_envio_erp: 'LEX',
      resp_cliente: '',
      cod_resp: '',
      cod_forma: '',
      send_freight_value: true,
      price_mode: 'UNIT_PRICE',
    } as Record<string, any>,
    email_notifications_config: {
      enabled: true,
      waiting_payment_enabled: true,
      waiting_payment_subject: 'Pedido #{pedido} realizado — Aguardando Pagamento | {loja}',
      waiting_payment_body:
        'Recebemos o seu pedido #{pedido} no valor de {valor}. Assim que o pagamento for confirmado, iniciaremos a separação dos seus produtos.',
      waiting_payment_message:
        'Recebemos o seu pedido #{pedido} no valor de {valor}. Assim que o pagamento for confirmado, iniciaremos a separação dos seus produtos.',
      paid_enabled: true,
      paid_subject: 'Pagamento Aprovado! Pedido #{pedido} confirmado | {loja}',
      paid_body:
        'O pagamento do seu pedido #{pedido} ({valor}) foi aprovado com sucesso! Já estamos preparando o seu pedido para envio.',
      paid_message:
        'O pagamento do seu pedido #{pedido} ({valor}) foi aprovado com sucesso! Já estamos preparando o seu pedido para envio.',
      separation_enabled: true,
      separation_subject: 'Seu pedido #{pedido} está em separação | {loja}',
      separation_body:
        'Boas notícias! O seu pedido #{pedido} já está em separação em nosso estoque e em breve será expedido.',
      separation_message:
        'Boas notícias! O seu pedido #{pedido} já está em separação em nosso estoque e em breve será expedido.',
      finalized_enabled: true,
      finalized_subject: 'Pedido #{pedido} finalizado e pronto para envio | {loja}',
      finalized_body:
        'O seu pedido #{pedido} foi finalizado/faturado e preparado para envio. Confira abaixo os dados de acompanhamento.',
      finalized_message:
        'O seu pedido #{pedido} foi finalizado/faturado e preparado para envio. Confira abaixo os dados de acompanhamento.',
      delivered_enabled: true,
      delivered_subject: 'Pedido #{pedido} entregue! | {loja}',
      delivered_body:
        'O seu pedido #{pedido} consta como entregue! Agradecemos a sua compra na {loja}.',
      delivered_message:
        'O seu pedido #{pedido} consta como entregue! Agradecemos a sua compra na {loja}.',
      canceled_enabled: true,
      canceled_subject: 'Pedido #{pedido} cancelado | {loja}',
      canceled_body:
        'Informamos que o seu pedido #{pedido} foi cancelado. Caso tenha qualquer dúvida, estamos à disposição em nossos canais de atendimento.',
      canceled_message:
        'Informamos que o seu pedido #{pedido} foi cancelado. Caso tenha qualquer dúvida, estamos à disposição em nossos canais de atendimento.',
      footer_note: 'Você pode acompanhar todos os detalhes em Minha Conta → Meus Pedidos na loja {loja}.',
    } as Record<string, any>,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Test Email & Order Email / Horus Integration States
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailStatus, setTestEmailStatus] = useState('PAID');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [notifyCustomerOnSave, setNotifyCustomerOnSave] = useState(true);
  const [manualEmailTo, setManualEmailTo] = useState('');
  const [manualEmailStatus, setManualEmailStatus] = useState('PAID');
  const [sendingOrderEmail, setSendingOrderEmail] = useState(false);
  const [sendingToHorus, setSendingToHorus] = useState<number | null>(null);

  // Storefront Cache Engine States (Managed by Seller)
  const [cacheStatus, setCacheStatus] = useState<any>({
    enabled: true,
    ttl_seconds: 900,
    cached_entries_count: 0,
    estimated_size_kb: 0,
    cache_hits: 0,
    cache_misses: 0,
    hit_rate_percent: 0,
    last_cleared_at: null,
  });
  const [clearingCache, setClearingCache] = useState(false);
  const [warmingCache, setWarmingCache] = useState(false);
  const [savingCacheConfig, setSavingCacheConfig] = useState(false);
  const [syncingVindi, setSyncingVindi] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const handleSyncVindiOrders = async (orderId?: number) => {
    setSyncingVindi(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/orders/sync-vindi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(orderId ? { order_id: orderId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao consultar a Vindi.');
      toast.success(
        data.message ||
          `Vindi consultada: ${data.checked || 0} pedido(s) verificado(s), ${data.approved_now || 0} aprovado(s).`
      );
      await loadAllData();
      if (orderId) {
        const ordRes = await fetch(`${apiBase}/b2c/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ordRes.ok) {
          const all = await ordRes.json();
          setB2cOrders(all);
          const updated = all.find((x: any) => x.id === orderId);
          if (updated) setSelectedOrder(updated);
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao sincronizar status na Vindi.');
    } finally {
      setSyncingVindi(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [sumRes, batchRes, coupRes, ordRes, custRes, redRes, lgpdRes, cacheRes] = await Promise.all([
        fetch(`${apiBase}/b2c/coupons/summary`, { headers }),
        fetch(`${apiBase}/b2c/coupons/batches`, { headers }),
        fetch(
          `${apiBase}/b2c/coupons?${new URLSearchParams({
            ...(selectedBatchFilter ? { batch_id: selectedBatchFilter } : {}),
            ...(couponStatusFilter ? { status: couponStatusFilter } : {}),
            ...(couponSearch ? { search: couponSearch } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(
          `${apiBase}/b2c/orders?${new URLSearchParams({
            ...(orderSearch ? { search: orderSearch } : {}),
            ...(orderStatusFilter && orderStatusFilter !== 'ALL' ? { status: orderStatusFilter } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(
          `${apiBase}/b2c/customers?${new URLSearchParams({
            ...(customerSearch ? { search: customerSearch } : {}),
            ...(onlyStockAlerts ? { only_stock_alerts: 'true' } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(
          `${apiBase}/b2c/coupons/redemptions?${new URLSearchParams({
            ...(selectedBatchFilter ? { batch_id: selectedBatchFilter } : {}),
            ...(redemptionSearch ? { search: redemptionSearch } : {}),
          }).toString()}`,
          { headers }
        ),
        fetch(`${apiBase}/b2c/lgpd/consents`, { headers }),
        fetch(`${apiBase}/b2c/cache/status`, { headers }),
      ]);

      if (sumRes.ok) {
        const s = await sumRes.json();
        setSummary(s);
        if (s.settings) {
          const wpMsg =
            s.settings.email_notifications_config?.waiting_payment_message ||
            s.settings.email_notifications_config?.waiting_payment_body ||
            'Recebemos o seu pedido #{pedido} no valor de {valor}. Assim que o pagamento for confirmado, iniciaremos a separação dos seus produtos.';
          const paidMsg =
            s.settings.email_notifications_config?.paid_message ||
            s.settings.email_notifications_config?.paid_body ||
            'O pagamento do seu pedido #{pedido} ({valor}) foi aprovado com sucesso! Já estamos preparando o seu pedido para envio.';
          const sepMsg =
            s.settings.email_notifications_config?.separation_message ||
            s.settings.email_notifications_config?.separation_body ||
            'Boas notícias! O seu pedido #{pedido} já está em separação em nosso estoque e em breve será expedido.';
          const finMsg =
            s.settings.email_notifications_config?.finalized_message ||
            s.settings.email_notifications_config?.finalized_body ||
            'O seu pedido #{pedido} foi finalizado/faturado e preparado para envio. Confira abaixo os dados de acompanhamento.';
          const delivMsg =
            s.settings.email_notifications_config?.delivered_message ||
            s.settings.email_notifications_config?.delivered_body ||
            'O seu pedido #{pedido} consta como entregue! Agradecemos a sua compra na {loja}.';
          const cancMsg =
            s.settings.email_notifications_config?.canceled_message ||
            s.settings.email_notifications_config?.canceled_body ||
            'Informamos que o seu pedido #{pedido} foi cancelado. Caso tenha qualquer dúvida, estamos à disposição em nossos canais de atendimento.';
          const hOrd = s.settings.horus_order_config || {};

          const fInfo = s.settings.footer_info || {};
          const seoCfg = s.settings.seo_config || {};

          setSettingsForm({
            store_slug: s.settings.store_slug || '',
            b2c_custom_domain: s.settings.b2c_custom_domain || '',
            b2c_storefront_open: Boolean(s.settings.b2c_storefront_open),
            allow_zero_balance_sale: Boolean(
              s.settings.allow_zero_balance_sale ?? s.settings.horus_sync_config?.allow_zero_balance_sale
            ),
            b2c_checkout_mode: s.settings.b2c_checkout_mode || 'NATIVE_GATEWAY',
            b2c_default_freight_value: Number(s.settings.b2c_default_freight_value || 0),
            b2c_free_shipping_min_value: Number(s.settings.b2c_free_shipping_min_value || 0),
            b2c_lgpd_terms_text: s.settings.b2c_lgpd_terms_text || '',
            footer_info: {
              legal_name: fInfo.legal_name || s.settings.company_name || '',
              cnpj: fInfo.cnpj || '',
              address_line: fInfo.address_line || '',
              whatsapp: fInfo.whatsapp || '',
              contact_phone: fInfo.contact_phone || '',
              contact_email: fInfo.contact_email || '',
              business_hours: fInfo.business_hours || 'Segunda a Sexta, das 09h às 18h',
              about_text: fInfo.about_text || '',
            },
            seo_config: {
              home_title: seoCfg.home_title || '{loja} | Livraria e Loja Oficial',
              home_description:
                seoCfg.home_description ||
                'Compre livros na loja oficial {loja} com entrega rápida para todo o Brasil.',
              product_title_template:
                seoCfg.product_title_template || '{nome} - ISBN {isbn} | {autor} | {loja}',
              product_description_template:
                seoCfg.product_description_template ||
                'Compre o livro {nome} (ISBN {isbn}) de {autor}, editora {editora} na {loja}.',
              category_title_template:
                seoCfg.category_title_template || '{categoria} - Livros em Oferta | {loja}',
              showcase_title_template:
                seoCfg.showcase_title_template || '{vitrine} | Seleção Especial {loja}',
              google_site_verification: seoCfg.google_site_verification || '',
              auto_json_ld: seoCfg.auto_json_ld !== false,
            },
            payment_gateway_active: s.settings.payment_gateway_active || 'EFI',
            vindi_api_key: s.settings.vindi_api_key || '',
            vindi_sandbox: s.settings.vindi_sandbox !== false,
            efi_sandbox: s.settings.efi_sandbox !== false,
            efi_client_id: s.settings.efi_client_id || '',
            efi_client_secret: s.settings.efi_client_secret || '',
            efi_payee_code: s.settings.efi_payee_code || '',
            origin_zip_code: s.settings.origin_zip_code || '',
            correios_user: s.settings.correios_user || '',
            correios_password: s.settings.correios_password || '',
            freight_config: {
              default_book_weight_kg: Number(s.settings.freight_config?.default_book_weight_kg || 0.35),
              correios_enabled: s.settings.freight_config?.correios_enabled !== false,
              carrier_table: Array.isArray(s.settings.freight_config?.carrier_table)
                ? s.settings.freight_config.carrier_table
                : [],
            },
            horus_order_config: {
              enabled: Boolean(hOrd.enabled),
              auto_send_on_paid: Boolean(hOrd.auto_send_on_paid),
              tipo_pedido: hOrd.tipo_pedido || 'L',
              cod_param_fiscal_intra: hOrd.cod_param_fiscal_intra || '',
              cod_param_fiscal_inter: hOrd.cod_param_fiscal_inter || '',
              cod_metodo: hOrd.cod_metodo || '1',
              cod_endereco: hOrd.cod_endereco || '1',
              cod_transp: hOrd.cod_transp || '',
              frete_emit_dest: hOrd.frete_emit_dest || '1',
              status_envio_erp: hOrd.status_envio_erp || 'LEX',
              resp_cliente: hOrd.resp_cliente || '',
              cod_resp: hOrd.cod_resp || '',
              cod_forma: hOrd.cod_forma || '',
              send_freight_value: hOrd.send_freight_value !== false,
              price_mode: hOrd.price_mode || 'UNIT_PRICE',
            },
            email_notifications_config: {
              enabled: s.settings.email_notifications_config?.enabled !== false,
              waiting_payment_enabled:
                s.settings.email_notifications_config?.waiting_payment_enabled !== false,
              waiting_payment_subject:
                s.settings.email_notifications_config?.waiting_payment_subject ||
                'Pedido #{pedido} realizado — Aguardando Pagamento | {loja}',
              waiting_payment_body: wpMsg,
              waiting_payment_message: wpMsg,
              paid_enabled: s.settings.email_notifications_config?.paid_enabled !== false,
              paid_subject:
                s.settings.email_notifications_config?.paid_subject ||
                'Pagamento Aprovado! Pedido #{pedido} confirmado | {loja}',
              paid_body: paidMsg,
              paid_message: paidMsg,
              separation_enabled: s.settings.email_notifications_config?.separation_enabled !== false,
              separation_subject:
                s.settings.email_notifications_config?.separation_subject ||
                'Seu pedido #{pedido} está em separação | {loja}',
              separation_body: sepMsg,
              separation_message: sepMsg,
              finalized_enabled: s.settings.email_notifications_config?.finalized_enabled !== false,
              finalized_subject:
                s.settings.email_notifications_config?.finalized_subject ||
                'Pedido #{pedido} finalizado e pronto para envio | {loja}',
              finalized_body: finMsg,
              finalized_message: finMsg,
              delivered_enabled: s.settings.email_notifications_config?.delivered_enabled !== false,
              delivered_subject:
                s.settings.email_notifications_config?.delivered_subject ||
                'Pedido #{pedido} entregue! | {loja}',
              delivered_body: delivMsg,
              delivered_message: delivMsg,
              canceled_enabled: s.settings.email_notifications_config?.canceled_enabled !== false,
              canceled_subject:
                s.settings.email_notifications_config?.canceled_subject ||
                'Pedido #{pedido} cancelado | {loja}',
              canceled_body: cancMsg,
              canceled_message: cancMsg,
              footer_note:
                s.settings.email_notifications_config?.footer_note ||
                'Você pode acompanhar todos os detalhes em Minha Conta → Meus Pedidos na loja {loja}.',
            },
          });
        }
      }
      if (batchRes.ok) setBatches(await batchRes.json());
      if (coupRes.ok) setCoupons(await coupRes.json());
      let loadedOrders: any[] = [];
      if (ordRes.ok) {
        loadedOrders = await ordRes.json();
        setB2cOrders(loadedOrders);
      }
      if (custRes.ok) {
        const custData = await custRes.json();
        setB2cCustomers(custData.customers || []);
        setPendingAviseMeCount(Number(custData.pending_alerts_count || 0));
      }
      if (redRes.ok) setRedemptions(await redRes.json());
      if (lgpdRes.ok) setLgpdConsents(await lgpdRes.json());
      if (cacheRes.ok) setCacheStatus(await cacheRes.json());

      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const paramOrderId = Number(urlParams.get('order_id') || 0);
        const paramFromCustId = Number(urlParams.get('from_customer_id') || 0);
        const paramCustId = Number(urlParams.get('customer_id') || 0);

        if (paramFromCustId > 0) {
          setFromCustomerId(paramFromCustId);
        }

        if (effectiveSection === 'orders' && paramOrderId > 0) {
          let foundOrder = loadedOrders.find((o: any) => Number(o.id) === paramOrderId);
          if (!foundOrder) {
            const directRes = await fetch(`${apiBase}/b2c/orders?search=${paramOrderId}`, { headers });
            if (directRes.ok) {
              const directList = await directRes.json();
              foundOrder = (directList || []).find((o: any) => Number(o.id) === paramOrderId);
            }
          }
          if (foundOrder) {
            openOrderDetailsModal(foundOrder);
          }
        } else if (effectiveSection === 'customers' && paramCustId > 0 && !selectedCustomer360) {
          openCustomer360View(paramCustId);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const navigateToOrderDetails = (orderId: number, customerId?: number | null) => {
    if (!orderId) return;
    const qs = new URLSearchParams({ order_id: String(orderId) });
    if (customerId) {
      qs.set('from_customer_id', String(customerId));
    }
    router.push(`/b2c-storefront/orders?${qs.toString()}`);
  };

  useEffect(() => {
    loadAllData();
  }, [selectedBatchFilter, couponStatusFilter, orderStatusFilter, onlyStockAlerts]);

  const handleUpdateStockNotifyStatus = async (notifyId: string, newStatus = 'NOTIFIED') => {
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/customers/stock-notify/${notifyId}?status=${newStatus}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar alerta.');
      toast.success(data.message || 'Alerta Avise-me atualizado!');
      loadAllData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openOrderDetailsModal = (order: any) => {
    setSelectedOrder(order);
    const cleanEmail =
      order.customer_email &&
      !String(order.customer_email).includes('@compraexpressa') &&
      !String(order.customer_email).includes('@checkout.vindi')
        ? order.customer_email
        : order.last_email_to || '';
    setManualEmailTo(cleanEmail);
    setManualEmailStatus(order.status || 'WAITING_PAYMENT');
    setOrderEditForm({
      status: order.status || 'WAITING_PAYMENT',
      invoice_number: order.invoice_number || '',
      invoice_key: order.invoice_key || '',
      tracking_code: order.tracking_code || '',
      carrier_name: order.carrier_name || '',
      tracking_url: order.tracking_url || '',
    });
  };

  const handleSaveOrderDetails = async (overrideStatus?: string) => {
    if (!selectedOrder) return;
    setSavingOrder(true);
    try {
      const token = getToken();
      const payload = {
        ...orderEditForm,
        ...(overrideStatus ? { status: overrideStatus } : {}),
        notify_customer: notifyCustomerOnSave,
      };
      const res = await fetch(`${apiBase}/b2c/orders/${selectedOrder.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar pedido.');
      toast.success(data.message || `Pedido #${selectedOrder.id} atualizado!`);
      setSelectedOrder((prev: any) =>
        prev
          ? {
              ...prev,
              status: data.status,
              status_label: data.status_label,
              invoice_number: data.invoice_number,
              invoice_key: data.invoice_key,
              tracking_code: data.tracking_code,
              carrier_name: data.carrier_name,
              tracking_url: data.tracking_url,
              horus_pedido_venda: data.horus_pedido_venda || prev.horus_pedido_venda,
              horus_cod_cli: data.horus_cod_cli || prev.horus_cod_cli,
              horus_sent_at: data.horus_sent_at || prev.horus_sent_at,
              horus_status_erp: data.horus_status_erp || prev.horus_status_erp,
              horus_integration_log: data.horus_integration_log || prev.horus_integration_log,
              emails_sent: data.emails_sent || prev.emails_sent,
              last_email_sent_at: data.last_email_sent_at || prev.last_email_sent_at,
              last_email_to: data.last_email_to || prev.last_email_to,
            }
          : null
      );
      setOrderEditForm((prev) => ({
        ...prev,
        status: data.status,
      }));
      setManualEmailStatus(data.status);
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao salvar pedido.');
    } finally {
      setSavingOrder(false);
    }
  };

  const handleQuickStatusChange = async (order: any, newStatus: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/orders/${order.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, notify_customer: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao alterar status.');
      toast.success(data.message || `Status do pedido #${order.id} alterado!`);
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao alterar status.');
    }
  };

  const handleSendOrderEmail = async () => {
    if (!selectedOrder) return;
    setSendingOrderEmail(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/orders/${selectedOrder.id}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          event_status: manualEmailStatus || selectedOrder.status,
          override_email: manualEmailTo.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao enviar e-mail do pedido.');
      toast.success(data.message || 'E-mail disparado com sucesso!');
      setSelectedOrder((prev: any) =>
        prev
          ? {
              ...prev,
              emails_sent: data.emails_sent || prev.emails_sent,
              last_email_sent_at: data.last_email_sent_at,
              last_email_to: data.to_email || prev.last_email_to,
            }
          : null
      );
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao enviar e-mail.');
    } finally {
      setSendingOrderEmail(false);
    }
  };

  const handleSendOrderToHorus = async (orderId: number, force = false) => {
    setSendingToHorus(orderId);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/orders/${orderId}/send-to-horus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao integrar pedido com Horus ERP.');
      toast.success(data.message || `Pedido #${orderId} integrado ao Horus!`);
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev: any) =>
          prev
            ? {
                ...prev,
                horus_pedido_venda: data.horus_pedido_venda,
                horus_cod_cli: data.horus_cod_cli,
                horus_status_erp: data.horus_status_erp,
                horus_sent_at: data.horus_sent_at,
                horus_integration_log: data.steps_log || prev.horus_integration_log,
              }
            : null
        );
      }
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar pedido para o Horus ERP.');
    } finally {
      setSendingToHorus(null);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailTo.trim() || !testEmailTo.includes('@')) {
      toast.error('Informe um endereço de e-mail válido para receber o teste.');
      return;
    }
    setSendingTestEmail(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/settings/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to_email: testEmailTo.trim(),
          event_status: testEmailStatus,
          email_notifications_config: settingsForm.email_notifications_config,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao disparar e-mail de teste.');
      toast.success(data.message || 'E-mail de teste enviado com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao enviar e-mail de teste.');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchForm.name.trim()) {
      toast.error('Informe o nome da campanha / lote.');
      return;
    }
    if (batchForm.coupon_value <= 0) {
      toast.error('Informe o valor ou percentual do cupom.');
      return;
    }

    setSubmitting(true);
    try {
      const employees: { name?: string; cpf?: string; email?: string }[] = [];
      if (batchForm.employees_raw.trim()) {
        const lines = batchForm.employees_raw
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          const parts = line.split(/[;,|\t]/).map((p) => p.trim());
          if (parts.length === 1) {
            employees.push({ cpf: parts[0] });
          } else {
            employees.push({
              name: parts[0],
              cpf: parts[1] || '',
              email: parts[2] || '',
            });
          }
        }
      }

      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/coupons/batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: batchForm.name,
          partner_company_name: batchForm.partner_company_name || null,
          partner_document: batchForm.partner_document || null,
          batch_mode: batchForm.batch_mode,
          code_prefix: batchForm.code_prefix || 'CUPOM',
          shared_code: batchForm.shared_code || null,
          quantity: Number(batchForm.quantity) || 10,
          coupon_value: Number(batchForm.coupon_value),
          discount_type: batchForm.discount_type,
          allows_freight_discount: batchForm.allows_freight_discount,
          allow_residual_balance: batchForm.allow_residual_balance,
          min_order_value: Number(batchForm.min_order_value || 0),
          valid_from: batchForm.valid_from || null,
          valid_until: batchForm.valid_until || null,
          notes: batchForm.notes || null,
          employees: employees.length > 0 ? employees : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar lote de cupons.');

      toast.success(data.message || 'Lote de cupons criado com sucesso!');
      setShowBatchModal(false);
      loadAllData();
      setCouponSubView('list');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao criar lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSingleCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (singleForm.initial_value <= 0) {
      toast.error('Informe o valor ou percentual do cupom.');
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/coupons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...singleForm,
          valid_until: singleForm.valid_until || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar cupom.');
      toast.success(data.message || 'Cupom criado com sucesso!');
      setShowSingleModal(false);
      loadAllData();
      setCouponSubView('list');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar cupom.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelCoupon = async (couponId: number, code: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/coupons/${couponId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success(`Cupom ${code} cancelado.`);
        loadAllData();
      }
    } catch (e) {
      toast.error('Erro ao cancelar cupom.');
    }
  };

  const handleSaveB2CSettings = async () => {
    setSavingSettings(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Pagamento (gateway, credenciais e modo de finalização) é salvo em Configurações → Pagamentos
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(settingsForm).filter(
              ([k]) =>
                ![
                  'payment_gateway_active',
                  'vindi_api_key',
                  'vindi_sandbox',
                  'b2c_checkout_mode',
                  'efi_sandbox',
                  'efi_client_id',
                  'efi_client_secret',
                  'efi_payee_code',
                ].includes(k)
            )
          )
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar configurações.');
      toast.success(data.message || 'Configurações atualizadas!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/cache/clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao limpar cache.');
      toast.success(data.message || 'Cache da loja B2C limpo com sucesso!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao limpar cache.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleWarmupCache = async () => {
    setWarmingCache(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/cache/warmup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao pré-aquecer cache.');
      toast.success(data.message || 'Cache da vitrine pré-aquecido com sucesso!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao pré-aquecer cache.');
    } finally {
      setWarmingCache(false);
    }
  };

  const handleUpdateCacheConfig = async (enabled: boolean, ttlSeconds: number) => {
    setSavingCacheConfig(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/cache/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled, ttl_seconds: ttlSeconds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar configuração de cache.');
      setCacheStatus((prev: any) => ({ ...prev, enabled: data.enabled, ttl_seconds: data.ttl_seconds }));
      toast.success(data.message || 'Configuração de cache atualizada!');
      loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao salvar configuração de cache.');
    } finally {
      setSavingCacheConfig(false);
    }
  };

  const exportCouponsCSV = () => {
    if (!coupons.length) {
      toast.error('Nenhum cupom na listagem para exportar.');
      return;
    }
    const headers = [
      'Codigo',
      'Campanha_Lote',
      'Parceiro',
      'Modo',
      'Tipo',
      'Valor_Inicial',
      'Valor_Usado',
      'Saldo_Atual',
      'Abate_Frete',
      'Beneficiario_Nome',
      'Beneficiario_CPF',
      'Beneficiario_Email',
      'Cupom_Residual_Gerado',
      'Status',
      'Validade',
    ];
    const rows = coupons.map((c) => [
      c.code,
      (c.batch_name || 'Avulso').replace(/;/g, ','),
      (c.partner_company_name || '-').replace(/;/g, ','),
      c.coupon_mode,
      c.discount_type,
      Number(c.initial_value || 0).toFixed(2).replace('.', ','),
      Number(c.used_amount || 0).toFixed(2).replace('.', ','),
      Number(c.current_balance || 0).toFixed(2).replace('.', ','),
      c.allows_freight_discount ? 'SIM' : 'NAO',
      (c.assigned_name || '').replace(/;/g, ','),
      c.assigned_cpf || '',
      c.assigned_email || '',
      c.generated_child_code || '',
      c.status,
      c.valid_until || 'Sem expiracao',
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cupons_desconto_b2c_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val || 0));

  const openCustomer360View = async (customerId: number | null) => {
    if (!customerId) {
      toast.info('Este registro é um visitante de alerta Avise-me sem cadastro completo.');
      return;
    }
    setLoadingCustomer360(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/customers/${customerId}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Não foi possível carregar a ficha do cliente.');
      setSelectedCustomer360(data);
      setCustomerDetailTab('orders');
      setCustomerForm({
        name: data.customer?.name || '',
        cpf: data.customer?.cpf || '',
        email: data.customer?.email || '',
        phone: data.customer?.phone || '',
        zip_code: data.customer?.address?.zip_code || '',
        street: data.customer?.address?.street || '',
        number: data.customer?.address?.number || '',
        complement: data.customer?.address?.complement || '',
        neighborhood: data.customer?.address?.neighborhood || '',
        city: data.customer?.address?.city || '',
        state: data.customer?.address?.state || '',
        password: '',
      });
    } catch (e: any) {
      toast.error(e.message || 'Erro ao abrir ficha do cliente.');
    } finally {
      setLoadingCustomer360(false);
    }
  };

  const handleSaveManualCustomer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customerForm.name.trim() || !customerForm.cpf.trim() || !customerForm.email.trim()) {
      toast.error('Nome completo, CPF e E-mail são obrigatórios.');
      return;
    }
    setSavingCustomer(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(customerForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao salvar cliente.');
      toast.success(data.message || 'Cliente salvo com sucesso!');
      setShowNewCustomerModal(false);
      await loadAllData();
      if (selectedCustomer360?.customer?.id) {
        await openCustomer360View(selectedCustomer360.customer.id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar cadastro do cliente.');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDownloadCustomerImportTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/customers/import-template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao baixar planilha modelo.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Modelo_Importacao_Clientes_B2C.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao baixar modelo Excel.');
    }
  };

  const handleUploadCustomersSpreadsheet = async (file: File | null) => {
    if (!file) return;
    const MAX_BYTES = 10 * 1024 * 1024; // Regra mandatória: 10 MB para planilhas
    if (file.size > MAX_BYTES) {
      toast.error('O arquivo excede o limite máximo permitido de 10 MB para planilhas de importação.');
      return;
    }
    setImportingCustomers(true);
    setImportResultSummary(null);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${apiBase}/b2c/customers/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha na importação da planilha.');
      setImportResultSummary(data);
      toast.success(data.message || 'Planilha de clientes importada com sucesso!');
      await loadAllData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao importar planilha de clientes.');
    } finally {
      setImportingCustomers(false);
    }
  };

  const handleSendCustomerPasswordReset = async (customerId: number) => {
    setSendingResetForId(customerId);
    try {
      const token = getToken();
      const res = await fetch(`${apiBase}/b2c/customers/${customerId}/send-password-reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Não foi possível enviar o token de senha.');
      toast.success(data.message || 'E-mail de recuperação/criação de senha enviado ao cliente!');
      if (selectedCustomer360?.customer?.id === customerId) {
        await openCustomer360View(customerId);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao disparar recuperação de senha.');
    } finally {
      setSendingResetForId(null);
    }
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isHorusTenant = currentHost.includes('horus');
  const baseTenantDomain = isHorusTenant ? 'horusb2b.com.br' : 'cronuzb2b.com.br';
  const slugifyCompanyName = (val: string) =>
    (val || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const rawSlugCandidate = (settingsForm.store_slug || summary?.settings?.store_slug || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  const fallbackSlugFromName =
    slugifyCompanyName(
      summary?.settings?.company_name ||
        settingsForm.footer_info?.legal_name ||
        summary?.settings?.domain ||
        (getUser() as any)?.company_name ||
        ''
    ) || 'loja-oficial';
  const effectiveStoreSlug =
    rawSlugCandidate && !/^\d+$/.test(rawSlugCandidate) ? rawSlugCandidate : fallbackSlugFromName;
  const officialB2cSubdomain = `b2c-${effectiveStoreSlug}.${baseTenantDomain}`;
  const officialB2cSubdomainUrl = `https://${officialB2cSubdomain}`;
  const friendlyStoreUrl = `${originUrl}/loja/${effectiveStoreSlug}`;
  const cleanCustomDomain = (settingsForm.b2c_custom_domain || summary?.settings?.b2c_custom_domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const storePublicUrl = cleanCustomDomain ? `https://${cleanCustomDomain}` : `/loja/${effectiveStoreSlug}`;
  const storeDisplayPath = cleanCustomDomain ? cleanCustomDomain : `/loja/${effectiveStoreSlug}`;

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* VIEW 1: CUPONS DE DESCONTO (/b2c-storefront)                          */}
      {/* ===================================================================== */}
      {effectiveSection === 'coupons' && (
        <>
          {/* Clean, Precise Header */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                <Ticket className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Cupons de Desconto &amp; Controle de Saldos
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Crie cupons promocionais ou lotes por CPF, defina regras de saldo residual automático e acompanhe quem utilizou cada código.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 text-xs">
                <Globe className="w-3.5 h-3.5 text-indigo-500 mr-1.5 shrink-0" />
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate max-w-[230px]">
                  {storeDisplayPath}
                </span>
              </div>

              <a
                href={storePublicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-indigo-600" />
                Ver Loja Online
              </a>

              <button
                onClick={() => setShowSingleModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Criar Cupom Individual
              </button>

              <button
                onClick={() => setShowBatchModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Gerar Lote de Cupons
              </button>
            </div>
          </div>

          {/* 4 Focused KPIs for Coupons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Total Emitido em Cupons</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                {formatBRL(summary?.total_issued_value || 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.total_coupons || 0} cupons gerados ({summary?.total_batches || 0} campanhas)
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Valor Já Utilizado</p>
              <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatBRL(summary?.total_used_value || 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.total_redemptions || 0} compras realizadas com cupom
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Saldo Disponível / Residual</p>
              <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                {formatBRL(summary?.total_remaining_balance || 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.residual_generated_coupons || 0} cupons residuais automáticos
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Status dos Cupons</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                  {summary?.available_coupons || 0}
                </span>
                <span className="text-xs text-slate-500">ativos para uso</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {summary?.exhausted_coupons || 0} esgotados • {summary?.partially_used_coupons || 0} parciais
              </p>
            </div>
          </div>

          {/* Sub-view Switcher & Filters */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start">
                <button
                  type="button"
                  onClick={() => setCouponSubView('list')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    couponSubView === 'list'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Todos os Cupons ({coupons.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCouponSubView('batches')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    couponSubView === 'batches'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Campanhas / Lotes ({batches.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCouponSubView('history')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    couponSubView === 'history'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Histórico de Utilização ({redemptions.length})
                </button>
              </div>

              <button
                onClick={exportCouponsCSV}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Planilha CSV
              </button>
            </div>

            {couponSubView === 'list' && (
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={couponSearch}
                    onChange={(e) => setCouponSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                    placeholder="Buscar por código do cupom, CPF, nome do cliente ou cupom residual..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>

                <select
                  value={selectedBatchFilter}
                  onChange={(e) => setSelectedBatchFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="">Todas as Campanhas / Lotes</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <select
                  value={couponStatusFilter}
                  onChange={(e) => setCouponStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="">Todos os Status</option>
                  <option value="AVAILABLE">Disponíveis</option>
                  <option value="PARTIALLY_USED">Uso Parcial</option>
                  <option value="EXHAUSTED">100% Utilizados</option>
                  <option value="CANCELLED">Cancelados</option>
                </select>

                <button
                  onClick={loadAllData}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
                >
                  Filtrar
                </button>
              </div>
            )}

            {couponSubView === 'history' && (
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={redemptionSearch}
                    onChange={(e) => setRedemptionSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                    placeholder="Filtrar histórico por nome do cliente, CPF, e-mail ou código usado..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
                <button
                  onClick={loadAllData}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
                >
                  Buscar
                </button>
              </div>
            )}
          </div>

          {/* SUB-VIEW 1: LISTA PRECISA DE CUPONS E SALDOS */}
          {couponSubView === 'list' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3.5 px-4">Código do Cupom</th>
                    <th className="py-3.5 px-4">Campanha / Regra</th>
                    <th className="py-3.5 px-4">Beneficiário (Nome / CPF)</th>
                    <th className="py-3.5 px-4">Valor Inicial</th>
                    <th className="py-3.5 px-4">Consumido</th>
                    <th className="py-3.5 px-4">Saldo Atual / Residual</th>
                    <th className="py-3.5 px-4">Validade &amp; Status</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                  {coupons.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Nenhum cupom encontrado. Clique em <strong>Criar Cupom Individual</strong> ou <strong>Gerar Lote de Cupons</strong> acima.
                      </td>
                    </tr>
                  ) : (
                    coupons.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                              {c.code}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(c.code);
                                toast.success(`Código ${c.code} copiado!`);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700"
                              title="Copiar código"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {c.coupon_mode === 'RESIDUAL' && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                              Cupom de Saldo Residual
                            </span>
                          )}
                          {c.coupon_mode === 'MULTI_USE' && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                              Múltiplos Usos ({c.uses_count || 0} / {c.max_uses || 1} usados)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {c.partner_company_name || c.batch_name || 'Cupom Avulso'}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {c.allows_freight_discount ? 'Frete Grátis Incluso' : 'Frete Normal'} •{' '}
                            {c.allow_residual_balance !== false ? 'Gera Residual' : 'Uso Único'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {c.assigned_name || c.assigned_cpf ? (
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {c.assigned_name || 'Cliente Vinculado'}
                              </span>
                              {c.assigned_cpf && (
                                <span className="block font-mono text-[11px] text-slate-500">
                                  CPF: {c.assigned_cpf}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Livre (Qualquer cliente / 1º uso)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {c.discount_type === 'PERCENTAGE' ? `${c.initial_value}%` : formatBRL(c.initial_value)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-600">
                          {formatBRL(c.used_amount)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {c.discount_type === 'PERCENTAGE' ? '—' : formatBRL(c.current_balance)}
                          </span>
                          {c.generated_child_code && (
                            <div className="text-[11px] text-amber-600 font-semibold mt-0.5">
                              Gerou saldo: <code className="font-mono font-bold">{c.generated_child_code}</code>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {c.status === 'AVAILABLE' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-bold">
                                Disponível
                              </span>
                            )}
                            {c.status === 'PARTIALLY_USED' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                                Uso Parcial
                              </span>
                            )}
                            {c.status === 'EXHAUSTED' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                                100% Utilizado
                              </span>
                            )}
                            {c.status === 'CANCELLED' && (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-[11px] font-bold">
                                Cancelado
                              </span>
                            )}
                            {c.valid_until && (
                              <span className="block text-[10px] text-slate-400">
                                Até {c.valid_until.split('-').reverse().join('/')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(c.status === 'AVAILABLE' || c.status === 'PARTIALLY_USED') && (
                            <button
                              onClick={() => handleCancelCoupon(c.id, c.code)}
                              className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SUB-VIEW 2: CAMPANHAS / LOTES */}
          {couponSubView === 'batches' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3.5 px-4">Campanha / Lote</th>
                    <th className="py-3.5 px-4">Empresa / Parceiro</th>
                    <th className="py-3.5 px-4">Modo</th>
                    <th className="py-3.5 px-4">Valor por Cupom</th>
                    <th className="py-3.5 px-4">Regras</th>
                    <th className="py-3.5 px-4">Consumo</th>
                    <th className="py-3.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                  {batches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Nenhum lote cadastrado ainda.
                      </td>
                    </tr>
                  ) : (
                    batches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          {b.name}
                          {b.valid_until && (
                            <span className="block text-[11px] font-normal text-slate-400">
                              Válido até {b.valid_until.split('-').reverse().join('/')}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {b.partner_company_name || '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {b.batch_mode === 'SHARED_CPF_LIMIT' ? (
                            <div>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                                Código Único por CPF ({b.shared_code})
                              </span>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-bold">
                              {b.coupons_count} Códigos Individuais
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          {b.discount_type === 'PERCENTAGE' ? `${b.coupon_value}%` : formatBRL(b.coupon_value)}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                          Frete: <strong>{b.allows_freight_discount ? 'Sim' : 'Não'}</strong> • Residual:{' '}
                          <strong>{b.allow_residual_balance ? 'Sim' : 'Não'}</strong>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {b.coupons_used_count} / {b.coupons_count || b.max_uses_total} usados
                          </div>
                          <div className="text-[11px] text-emerald-600 font-semibold">
                            {formatBRL(b.consumed_batch_value)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedBatchFilter(String(b.id));
                              setCouponSubView('list');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-xs font-bold text-slate-700 dark:text-slate-200"
                          >
                            Filtrar Cupons →
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SUB-VIEW 3: HISTÓRICO DE USO (QUEM USOU CADA CUPOM) */}
          {couponSubView === 'history' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3.5 px-4">Data / Pedido</th>
                    <th className="py-3.5 px-4">Cliente (Nome / CPF)</th>
                    <th className="py-3.5 px-4">Cupom Aplicado</th>
                    <th className="py-3.5 px-4">Valor da Compra</th>
                    <th className="py-3.5 px-4">Desconto Abatido</th>
                    <th className="py-3.5 px-4">Saldo Restante</th>
                    <th className="py-3.5 px-4">Diferença Paga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                  {redemptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Nenhuma utilização de cupom registrada até o momento.
                      </td>
                    </tr>
                  ) : (
                    redemptions.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => r.order_id && navigateToOrderDetails(r.order_id)}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                          r.order_id ? 'cursor-pointer group' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          {r.order_id ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToOrderDetails(r.order_id);
                              }}
                              className="font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline inline-flex items-center gap-1 cursor-pointer"
                              title={`Abrir detalhes do Pedido #${r.order_id}`}
                            >
                              Pedido #{r.order_id}
                              <ExternalLink className="w-3 h-3 opacity-70" />
                            </button>
                          ) : (
                            <span className="font-bold text-slate-900 dark:text-white">Pedido #—</span>
                          )}
                          <span className="block text-[11px] text-slate-400">
                            {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : ''}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {r.customer_name}
                          </span>
                          <span className="block font-mono text-[11px] text-slate-500">
                            CPF: {r.customer_cpf} • {r.customer_email}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                            {r.coupon_code}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {formatBRL(Number(r.order_subtotal || 0) + Number(r.order_freight || 0))}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-600">
                          - {formatBRL(r.discount_applied)}
                        </td>
                        <td className="py-3.5 px-4">
                          {r.used_full_balance ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-bold">
                              100% Utilizado
                            </span>
                          ) : (
                            <div>
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                                Sobrou {formatBRL(r.remaining_balance)}
                              </span>
                              {r.residual_coupon_code && (
                                <span className="block text-[11px] text-amber-700 dark:text-amber-400 font-mono mt-0.5">
                                  Novo: <strong>{r.residual_coupon_code}</strong>
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {Number(r.difference_paid || 0) <= 0.009 ? (
                            <span className="text-xs font-bold text-emerald-600">R$ 0,00</span>
                          ) : (
                            <span className="font-bold text-slate-900 dark:text-white">
                              {formatBRL(r.difference_paid)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* VIEW 2: PEDIDOS DA LOJA B2C (/b2c-storefront/orders)                  */}
      {/* ===================================================================== */}
      {effectiveSection === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Pedidos da Loja B2C
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Acompanhe os pedidos da loja virtual, evolua o status operacional, informe a Nota Fiscal e o código de rastreio.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 text-xs">
                <Globe className="w-3.5 h-3.5 text-indigo-500 mr-1.5 shrink-0" />
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate max-w-[240px]">
                  {storeDisplayPath}
                </span>
              </div>

              <a
                href={storePublicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-indigo-600" />
                Ver Loja Online
              </a>
            </div>
          </div>

          {selectedOrder ? (
            /* ================================================================= */
            /* TELA DEDICADA DE DETALHE DO PEDIDO B2C (SEM MODAL)                */
            /* ================================================================= */
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrder(null);
                        if (typeof window !== 'undefined' && window.location.search.includes('order_id=')) {
                          router.replace('/b2c-storefront/orders');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                    >
                      ← Voltar para Lista de Pedidos
                    </button>
                    {fromCustomerId && (
                      <button
                        type="button"
                        onClick={() => router.push(`/b2c-storefront/customers?customer_id=${fromCustomerId}`)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:underline cursor-pointer"
                      >
                        • Voltar para Ficha do Cliente
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                      Detalhes do Pedido #{selectedOrder.id}
                    </h2>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        (
                          B2C_ORDER_STATUS_STEPS.find((s) => s.key === selectedOrder.status) ||
                          B2C_ORDER_STATUS_STEPS[0]
                        ).badge
                      }`}
                    >
                      {selectedOrder.status_label || selectedOrder.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Realizado em{' '}
                    {selectedOrder.created_at
                      ? new Date(selectedOrder.created_at).toLocaleString('pt-BR')
                      : '—'}{' '}
                    • Canal: {selectedOrder.payment_gateway || selectedOrder.checkout_mode}
                  </p>
                </div>
              </div>

              {/* Régua Oficial de Status do Pedido B2C + Reenvio Manual de E-mail */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    Fluxo de Status do Pedido B2C (Clique para avançar ou alterar)
                  </span>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyCustomerOnSave}
                      onChange={(e) => setNotifyCustomerOnSave(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    Notificar cliente por e-mail ao alterar o status
                  </label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {B2C_ORDER_STATUS_STEPS.map((step, idx) => {
                    const active = orderEditForm.status === step.key;
                    return (
                      <button
                        key={step.key}
                        type="button"
                        disabled={savingOrder}
                        onClick={() => {
                          setOrderEditForm((prev) => ({ ...prev, status: step.key }));
                          setManualEmailStatus(step.key);
                          handleSaveOrderDetails(step.key);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                        }`}
                      >
                        <span className="block text-[10px] opacity-75 font-bold">
                          Etapa {idx + 1}
                        </span>
                        <span className="block text-xs font-extrabold mt-0.5">{step.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Barra de Disparo / Reenvio Manual de E-mail do Pedido */}
                <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Mail className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        Disparo / Reenvio Manual de E-mail do Pedido:
                      </span>
                      {selectedOrder.last_email_sent_at ? (
                        <span className="ml-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          ✓ Último envio em{' '}
                          {new Date(selectedOrder.last_email_sent_at).toLocaleString('pt-BR')} para{' '}
                          {selectedOrder.last_email_to || selectedOrder.customer_email}
                        </span>
                      ) : (
                        <span className="ml-1.5 text-[11px] text-slate-500">
                          Envie ou reenvie o e-mail de status para o cliente quando desejar.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={manualEmailStatus}
                      onChange={(e) => setManualEmailStatus(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                    >
                      {B2C_ORDER_STATUS_STEPS.map((st) => (
                        <option key={st.key} value={st.key}>
                          Modelo: {st.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="email"
                      value={manualEmailTo}
                      onChange={(e) => setManualEmailTo(e.target.value)}
                      placeholder="E-mail do destinatário"
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs min-w-[210px]"
                    />
                    <button
                      type="button"
                      disabled={sendingOrderEmail}
                      onClick={() => handleSendOrderEmail()}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {sendingOrderEmail ? 'Enviando...' : 'Disparar E-mail Agora'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Card de Integração do Pedido com o Horus ERP (API Aberta B2C — Sem ID_GUID de Cliente) */}
              <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-2.5">
                    <PackageCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5 sm:mt-0" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                          Integração com Horus ERP (API Aberta B2C)
                        </h4>
                        {selectedOrder.horus_pedido_venda ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-extrabold font-mono">
                            ✓ Pedido Horus #{selectedOrder.horus_pedido_venda}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-bold">
                            Não enviado ao Horus
                          </span>
                        )}
                        {selectedOrder.horus_cod_cli && (
                          <span className="text-[11px] font-mono text-slate-500">
                            COD_CLI: {selectedOrder.horus_cod_cli}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        Localiza ou cadastra o cliente no Horus apenas por CPF/CNPJ (sem exigir ID_GUID), atualiza o endereço e cria o pedido com os itens em CAIXA ALTA.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!selectedOrder.horus_pedido_venda ? (
                      <button
                        type="button"
                        disabled={sendingToHorus === selectedOrder.id}
                        onClick={() => handleSendOrderToHorus(selectedOrder.id, false)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <PackageCheck className="w-4 h-4" />
                        {sendingToHorus === selectedOrder.id
                          ? 'Integrando no Horus...'
                          : 'Enviar Pedido para o Horus ERP'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={sendingToHorus === selectedOrder.id}
                        onClick={() => handleSendOrderToHorus(selectedOrder.id, true)}
                        className="px-3.5 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 hover:bg-indigo-50 text-indigo-700 dark:text-indigo-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${sendingToHorus === selectedOrder.id ? 'animate-spin' : ''}`} />
                        {sendingToHorus === selectedOrder.id ? 'Reenviando...' : 'Reenviar ao Horus'}
                      </button>
                    )}
                  </div>
                </div>

                {Array.isArray(selectedOrder.horus_integration_log) &&
                  selectedOrder.horus_integration_log.length > 0 && (
                    <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-900/40 space-y-1">
                      <span className="block text-[10px] font-bold uppercase text-indigo-800 dark:text-indigo-300">
                        Últimas Execuções na API Horus:
                      </span>
                      {selectedOrder.horus_integration_log.slice(-3).map((lg: any, i: number) => (
                        <div
                          key={i}
                          className="text-[11px] font-mono bg-white/80 dark:bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className={lg.ok ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-rose-600 font-bold'}>
                            {lg.ok
                              ? `✓ Sucesso: Pedido Horus #${lg.cod_ped_venda} (Cliente ${lg.cod_cli})`
                              : `✕ Falha na etapa [${lg.step || 'ERP'}]: ${lg.error}`}
                          </span>
                          <span className="text-slate-400">
                            {lg.at ? new Date(lg.at).toLocaleString('pt-BR') : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Dados do Cliente + Endereço de Entrega & Resumo Financeiro */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-slate-400">
                    Dados do Cliente &amp; Endereço de Entrega
                  </h4>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedOrder.customer_name}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                    CPF: {selectedOrder.customer_cpf} • Tel: {selectedOrder.customer_phone || 'Não informado'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    E-mail: {selectedOrder.customer_email}
                  </p>
                  {selectedOrder.shipping_address?.street && (
                    <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        Endereço de Entrega ({selectedOrder.freight_service_name || 'Frete'}):
                      </span>
                      {selectedOrder.shipping_address.street}, {selectedOrder.shipping_address.number}
                      {selectedOrder.shipping_address.complement
                        ? ` - ${selectedOrder.shipping_address.complement}`
                        : ''}
                      <br />
                      {selectedOrder.shipping_address.neighborhood} —{' '}
                      {selectedOrder.shipping_address.city}/{selectedOrder.shipping_address.state} • CEP:{' '}
                      {selectedOrder.shipping_address.zip_code}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-slate-400">
                    Informações de Pagamento &amp; Cupom
                  </h4>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Subtotal dos Produtos:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatBRL(selectedOrder.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">
                      Frete ({selectedOrder.freight_service_name || 'Entrega'}):
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {Number(selectedOrder.freight || 0) <= 0
                        ? 'Grátis (R$ 0,00)'
                        : formatBRL(selectedOrder.freight)}
                    </span>
                  </div>
                  {selectedOrder.coupon_code && (
                    <div className="flex justify-between text-xs text-emerald-600 font-bold">
                      <span>Cupom Aplicado ({selectedOrder.coupon_code}):</span>
                      <span>-{formatBRL(selectedOrder.discount_applied)}</span>
                    </div>
                  )}
                  {selectedOrder.residual_coupon_code && (
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-[11px] text-amber-800 dark:text-amber-300 font-mono">
                      Novo Cupom Residual Gerado: <strong>{selectedOrder.residual_coupon_code}</strong> (
                      {formatBRL(selectedOrder.remaining_balance)})
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white">
                    <span>Valor Total Pago:</span>
                    <span>{formatBRL(selectedOrder.difference_paid)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Meio: <strong>{selectedOrder.payment_method || selectedOrder.checkout_mode}</strong>{' '}
                    {selectedOrder.external_id ? `• Transação: ${selectedOrder.external_id}` : ''}
                    {selectedOrder.vindi_status_name ? ` • Status Vindi: ${selectedOrder.vindi_status_name}` : ''}
                  </p>
                  {(selectedOrder.payment_gateway === 'VINDI' || selectedOrder.vindi_token_transaction) && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={syncingVindi}
                        onClick={() => handleSyncVindiOrders(selectedOrder.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingVindi ? 'animate-spin' : ''}`} />
                        {syncingVindi ? 'Consultando Vindi...' : 'Consultar / Atualizar Pagamento na Vindi'}
                      </button>
                      {selectedOrder.vindi_payment_url && (
                        <a
                          href={selectedOrder.vindi_payment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Abrir Link Vindi
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Histórico Auditável de Pagamento (PIX / Cartão / Link Vindi) */}
              {Array.isArray(selectedOrder.payment_history) && selectedOrder.payment_history.length > 0 && (
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
                      Histórico de Pagamento &amp; Retorno Vindi ({selectedOrder.payment_history.length}{' '}
                      {selectedOrder.payment_history.length === 1 ? 'evento' : 'eventos'})
                    </h4>
                    {selectedOrder.vindi_token_transaction && (
                      <span className="text-[11px] font-mono text-slate-500">
                        Token Vindi: {selectedOrder.vindi_token_transaction}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {selectedOrder.payment_history.map((ev: any, idx: number) => {
                      const stName = ev.vindi_status_name || ev.status_name || '';
                      const evDate = ev.at || ev.timestamp;
                      const labelText =
                        ev.event === 'PAYMENT_APPROVED' || Number(ev.status_id) === 6
                          ? '✓ Pagamento Aprovado'
                          : ev.event === 'PAYMENT_CANCELED'
                          ? '✕ Pagamento Cancelado/Reprovado'
                          : ev.event === 'CHECKOUT_CREATED' || ev.source === 'CHECKOUT_LOJA'
                          ? '• Transação / Link Gerado no Checkout'
                          : stName
                          ? `• ${stName}`
                          : ev.message
                          ? `• ${ev.message}`
                          : '• Registro de Pagamento';
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {labelText}
                            </span>
                            <span className="text-slate-500 ml-2">
                              Meio: <strong>{ev.payment_method || '—'}</strong>
                              {stName ? ` • Vindi: ${stName}` : ''}
                              {ev.transaction_id ? ` • ID: ${ev.transaction_id}` : ''}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">
                            {evDate ? new Date(evDate).toLocaleString('pt-BR') : '—'} ({ev.source || 'SISTEMA'})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lista de Itens do Pedido */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  Itens do Pedido ({selectedOrder.items_count})
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 uppercase">
                      <th className="py-2.5 px-4">SKU / ISBN</th>
                      <th className="py-2.5 px-4">Produto</th>
                      <th className="py-2.5 px-4 text-center">Qtd</th>
                      <th className="py-2.5 px-4 text-right">Unitário</th>
                      <th className="py-2.5 px-4 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(selectedOrder.items || []).map((it: any) => (
                      <tr key={it.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {it.ean_isbn || it.sku}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">
                          {it.name}
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold">{it.quantity}</td>
                        <td className="py-2.5 px-4 text-right">{formatBRL(it.unit_price)}</td>
                        <td className="py-2.5 px-4 text-right font-bold">
                          {formatBRL(it.total_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Dados da Nota Fiscal & Rastreio da Encomenda */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Dados da Nota Fiscal &amp; Rastreio da Encomenda
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Número da Nota Fiscal (NF-e)
                    </label>
                    <input
                      type="text"
                      value={orderEditForm.invoice_number}
                      onChange={(e) =>
                        setOrderEditForm({ ...orderEditForm, invoice_number: e.target.value })
                      }
                      placeholder="Ex: 00012548"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Chave de Acesso NF-e (44 dígitos)
                    </label>
                    <input
                      type="text"
                      value={orderEditForm.invoice_key}
                      onChange={(e) =>
                        setOrderEditForm({ ...orderEditForm, invoice_key: e.target.value })
                      }
                      placeholder="Chave da Nota Fiscal"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Código de Rastreio (Correios / Transp.)
                    </label>
                    <input
                      type="text"
                      value={orderEditForm.tracking_code}
                      onChange={(e) =>
                        setOrderEditForm({
                          ...orderEditForm,
                          tracking_code: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="Ex: AA123456789BR"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Transportadora / Modalidade
                    </label>
                    <input
                      type="text"
                      value={orderEditForm.carrier_name}
                      onChange={(e) =>
                        setOrderEditForm({ ...orderEditForm, carrier_name: e.target.value })
                      }
                      placeholder="Ex: Correios SEDEX / Jadlog"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={savingOrder}
                    onClick={() => handleSaveOrderDetails()}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {savingOrder ? 'Salvando...' : 'Salvar Nota Fiscal, Rastreio e Status'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Régua de Filtro por Status de Pedido B2C */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      orderStatusFilter === 'ALL'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Todos os Pedidos ({b2cOrders.length})
                  </button>
                  {B2C_ORDER_STATUS_STEPS.map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setOrderStatusFilter(st.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        orderStatusFilter === st.key
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                      placeholder="Buscar por nº do pedido, nome do cliente, CPF, e-mail, NF-e ou rastreio..."
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={syncingVindi}
                      onClick={() => handleSyncVindiOrders()}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingVindi ? 'animate-spin' : ''}`} />
                      {syncingVindi ? 'Sincronizando Vindi...' : 'Sincronizar Pagamentos Vindi'}
                    </button>
                    <button
                      onClick={loadAllData}
                      className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Atualizar Lista
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabela Limpa de Pedidos com o Olhinho (Visualizar Detalhes) */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                      <th className="py-3.5 px-4">Pedido</th>
                      <th className="py-3.5 px-4">Data</th>
                      <th className="py-3.5 px-4">Cliente</th>
                      <th className="py-3.5 px-4">Total / Cupom</th>
                      <th className="py-3.5 px-4">NF-e / Rastreio</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
                    {b2cOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Nenhum pedido registrado para este filtro.
                        </td>
                      </tr>
                    ) : (
                      b2cOrders.map((o) => {
                        const stObj =
                          B2C_ORDER_STATUS_STEPS.find((s) => s.key === o.status) ||
                          B2C_ORDER_STATUS_STEPS[0];
                        return (
                          <tr
                            key={o.id}
                            onClick={() => openOrderDetailsModal(o)}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer"
                          >
                            <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                              #{o.id}
                              <span className="block text-[11px] font-normal text-slate-400">
                                {o.items_count} {o.items_count === 1 ? 'item' : 'itens'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 font-mono">
                              {o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                {o.customer_name}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                CPF: {o.customer_cpf}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-extrabold text-slate-900 dark:text-white block">
                                {Number(o.difference_paid || 0) <= 0.009
                                  ? 'R$ 0,00 (100% Cupom)'
                                  : formatBRL(o.difference_paid)}
                              </span>
                              {o.coupon_code && (
                                <span className="inline-block mt-0.5 text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  Cupom: {o.coupon_code} (-{formatBRL(o.discount_applied)})
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-xs">
                              {o.horus_pedido_venda ? (
                                <span className="inline-block mb-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono text-[10px] font-extrabold">
                                  Horus #{o.horus_pedido_venda}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={sendingToHorus === o.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSendOrderToHorus(o.id, false);
                                  }}
                                  className="inline-block mb-1 px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold cursor-pointer"
                                >
                                  {sendingToHorus === o.id ? 'Enviando...' : '→ Enviar p/ Horus'}
                                </button>
                              )}
                              {o.invoice_number ? (
                                <span className="block font-semibold text-slate-700 dark:text-slate-300">
                                  NF-e: {o.invoice_number}
                                </span>
                              ) : (
                                <span className="block text-slate-400">Sem NF-e</span>
                              )}
                              {o.tracking_code ? (
                                <span className="block font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                                  Rastreio: {o.tracking_code}
                                </span>
                              ) : (
                                <span className="block text-[11px] text-slate-400">Sem rastreio</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={o.status}
                                onChange={(e) => handleQuickStatusChange(o, e.target.value)}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold border-0 cursor-pointer ${stObj.badge}`}
                                title="Alterar status e disparar e-mail ao cliente"
                              >
                                {B2C_ORDER_STATUS_STEPS.map((st) => (
                                  <option
                                    key={st.key}
                                    value={st.key}
                                    className="bg-white text-slate-900 font-semibold"
                                  >
                                    {st.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openOrderDetailsModal(o);
                                }}
                                title="Abrir tela de detalhes do pedido"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 dark:bg-slate-800 dark:hover:bg-indigo-950/50 text-xs font-bold text-slate-700 hover:text-indigo-600 dark:text-slate-200 transition-colors cursor-pointer"
                              >
                                <Eye className="w-4 h-4 text-indigo-600" />
                                Ver Pedido
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 3: CLIENTES B2C & FICHA 360º (/b2c-storefront/customers)          */}
      {/* ===================================================================== */}
      {effectiveSection === 'customers' && (
        <div className="space-y-4">
          {selectedCustomer360 ? (
            /* ── TELA DEDICADA 360º DO CLIENTE B2C (COM MENUS INTERNOS) ── */
            <div className="space-y-4">
              {/* Barra Superior de Navegação e Identificação do Cliente */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer360(null)}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                      title="Voltar para a lista de clientes"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white">
                          {selectedCustomer360.customer?.name}
                        </h1>
                        {selectedCustomer360.customer?.has_password ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-bold">
                            ✓ Senha Ativa
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold">
                            ⏳ Aguardando Definição de Senha (1º Acesso)
                          </span>
                        )}
                        {selectedCustomer360.customer?.origin === 'EXCEL_MIGRATION' && (
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold">
                            Migrado via Planilha
                          </span>
                        )}
                        {selectedCustomer360.customer?.horus_cod_cli && (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-mono">
                            Horus #{selectedCustomer360.customer.horus_cod_cli}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        CPF: <strong>{selectedCustomer360.customer?.cpf || 'Não informado'}</strong> • E-mail:{' '}
                        <strong>{selectedCustomer360.customer?.email || 'Não informado'}</strong> • Tel:{' '}
                        <strong>{selectedCustomer360.customer?.phone || 'Não informado'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={sendingResetForId === selectedCustomer360.customer?.id}
                      onClick={() => handleSendCustomerPasswordReset(selectedCustomer360.customer.id)}
                      className="px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {sendingResetForId === selectedCustomer360.customer?.id
                        ? 'Enviando Token...'
                        : 'Enviar Token de Recuperação de Senha'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerDetailTab('profile')}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Editar Cadastro
                    </button>
                  </div>
                </div>

                {/* KPIs Resumo do Cliente */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                    <span className="text-[11px] font-semibold text-slate-500 block">Pedidos Realizados</span>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {selectedCustomer360.metrics?.orders_count || 0}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50">
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 block">
                      Total Comprado na Loja
                    </span>
                    <span className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(selectedCustomer360.metrics?.total_spent || 0)}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/50">
                    <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 block">
                      Cupons Utilizados / Economia
                    </span>
                    <span className="text-lg font-extrabold text-indigo-700 dark:text-indigo-300">
                      {selectedCustomer360.metrics?.coupons_used_count || 0} ({formatBRL(selectedCustomer360.metrics?.total_discount_coupons || 0)})
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50">
                    <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 block">
                      Acessos / Logins Registrados
                    </span>
                    <span className="text-lg font-extrabold text-amber-800 dark:text-amber-300">
                      {selectedCustomer360.metrics?.logins_count || 0}
                    </span>
                    <span className="block text-[10px] text-slate-500 truncate">
                      {selectedCustomer360.customer?.last_login_at
                        ? `Último: ${new Date(selectedCustomer360.customer.last_login_at).toLocaleString('pt-BR')}`
                        : 'Sem login recente'}
                    </span>
                  </div>
                </div>

                {/* Menus Internos da Ficha do Cliente */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  {[
                    {
                      id: 'orders',
                      label: `Pedidos do Cliente (${selectedCustomer360.orders?.length || 0})`,
                      icon: ShoppingBag,
                    },
                    {
                      id: 'coupons',
                      label: `Cupons Utilizados & Carteira (${(selectedCustomer360.coupon_redemptions?.length || 0) + (selectedCustomer360.assigned_coupons?.length || 0)})`,
                      icon: Ticket,
                    },
                    {
                      id: 'logins',
                      label: `Logins, Acessos & LGPD (${(selectedCustomer360.login_history?.length || 0) + (selectedCustomer360.lgpd_consents?.length || 0)})`,
                      icon: History,
                    },
                    {
                      id: 'profile',
                      label: 'Detalhes do Cadastro & Endereço',
                      icon: MapPin,
                    },
                  ].map((tb) => {
                    const IconC = tb.icon;
                    const active = customerDetailTab === tb.id;
                    return (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => setCustomerDetailTab(tb.id as any)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        <IconC className="w-3.5 h-3.5" />
                        {tb.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ABA 1: PEDIDOS DO CLIENTE & ÚLTIMOS PEDIDOS */}
              {customerDetailTab === 'orders' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-indigo-600" />
                      Histórico Completo de Pedidos do Cliente
                    </h3>
                  </div>

                  {!selectedCustomer360.orders?.length ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      Este cliente ainda não realizou pedidos na loja B2C.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500">
                            <th className="py-3 px-4">Pedido</th>
                            <th className="py-3 px-4">Data</th>
                            <th className="py-3 px-4">Itens Comprados</th>
                            <th className="py-3 px-4">Cupom / Desconto</th>
                            <th className="py-3 px-4">Total Pago</th>
                            <th className="py-3 px-4">Status / ERP</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selectedCustomer360.orders.map((ord: any) => {
                            const stStep =
                              B2C_ORDER_STATUS_STEPS.find((s) => s.key === ord.status) ||
                              B2C_ORDER_STATUS_STEPS[0];
                            return (
                              <tr
                                key={ord.id}
                                onClick={() => navigateToOrderDetails(ord.id, selectedCustomer360.customer?.id)}
                                className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                title={`Clique para abrir os detalhes do Pedido #${ord.id}`}
                              >
                                <td className="py-3 px-4 font-extrabold text-slate-900 dark:text-white">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigateToOrderDetails(ord.id, selectedCustomer360.customer?.id);
                                    }}
                                    className="font-extrabold text-indigo-600 dark:text-indigo-400 group-hover:underline inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    #{ord.id}
                                    <ExternalLink className="w-3 h-3 opacity-70" />
                                  </button>
                                  <span className="block text-[10px] font-normal text-slate-400">
                                    {ord.payment_method}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                                  {ord.created_at ? new Date(ord.created_at).toLocaleString('pt-BR') : '—'}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="space-y-0.5">
                                    {(ord.items || []).map((it: any) => (
                                      <div key={it.id} className="text-slate-700 dark:text-slate-200">
                                        <strong>{it.quantity}x</strong> {it.name}{' '}
                                        <span className="text-[10px] font-mono text-slate-400">
                                          ({it.ean_isbn || it.sku})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  {ord.coupon_code ? (
                                    <div>
                                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                        {ord.coupon_code}
                                      </span>
                                      <span className="block text-[11px] text-emerald-600 font-bold">
                                        -{formatBRL(ord.discount_applied)}
                                      </span>
                                      {ord.residual_coupon_code && (
                                        <span className="block text-[10px] font-mono text-amber-700">
                                          Residual: {ord.residual_coupon_code}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-extrabold text-slate-900 dark:text-white">
                                  {formatBRL(ord.difference_paid)}
                                  <span className="block text-[10px] font-normal text-slate-400">
                                    Subtotal: {formatBRL(ord.subtotal)} | Frete: {formatBRL(ord.freight)}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${stStep.badge}`}>
                                    {ord.status_label}
                                  </span>
                                  {ord.horus_pedido_venda && (
                                    <span className="block mt-1 font-mono text-[10px] text-emerald-700 font-bold">
                                      Horus #{ord.horus_pedido_venda}
                                    </span>
                                  )}
                                  {ord.tracking_code && (
                                    <span className="block font-mono text-[10px] text-indigo-600">
                                      Rastreio: {ord.tracking_code}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 2: CUPONS UTILIZADOS & CARTEIRA DE BENEFÍCIOS DO CLIENTE */}
              {customerDetailTab === 'coupons' && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-indigo-600" />
                      Histórico de Cupons Utilizados em Pedidos ({selectedCustomer360.coupon_redemptions?.length || 0})
                    </h3>
                    {!selectedCustomer360.coupon_redemptions?.length ? (
                      <p className="text-xs text-slate-400 py-6 text-center">
                        Nenhum cupom resgatado por este cliente até o momento.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500">
                              <th className="py-2.5 px-4">Data</th>
                              <th className="py-2.5 px-4">Código Utilizado</th>
                              <th className="py-2.5 px-4">Campanha / Lote</th>
                              <th className="py-2.5 px-4">Pedido</th>
                              <th className="py-2.5 px-4 text-right">Saldo Anterior</th>
                              <th className="py-2.5 px-4 text-right">Desconto Aplicado</th>
                              <th className="py-2.5 px-4 text-right">Saldo Residual</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {selectedCustomer360.coupon_redemptions.map((red: any) => (
                              <tr
                                key={red.id}
                                onClick={() =>
                                  red.order_id &&
                                  navigateToOrderDetails(red.order_id, selectedCustomer360.customer?.id)
                                }
                                className={`hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 ${
                                  red.order_id ? 'cursor-pointer group' : ''
                                }`}
                              >
                                <td className="py-2.5 px-4 font-mono text-slate-500">
                                  {red.created_at ? new Date(red.created_at).toLocaleString('pt-BR') : '—'}
                                </td>
                                <td className="py-2.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  {red.coupon_code}
                                </td>
                                <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                                  {red.batch_name || 'Cupom Individual'}
                                  {red.partner_company_name ? ` (${red.partner_company_name})` : ''}
                                </td>
                                <td className="py-2.5 px-4 font-bold">
                                  {red.order_id ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigateToOrderDetails(
                                          red.order_id,
                                          selectedCustomer360.customer?.id
                                        );
                                      }}
                                      className="font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      #{red.order_id}
                                      <ExternalLink className="w-3 h-3 opacity-70" />
                                    </button>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono">
                                  {formatBRL(red.previous_balance)}
                                </td>
                                <td className="py-2.5 px-4 text-right font-extrabold text-emerald-600">
                                  -{formatBRL(red.discount_applied)}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="font-bold text-amber-700">
                                    {formatBRL(red.remaining_balance)}
                                  </span>
                                  {red.residual_coupon_code && (
                                    <span className="block text-[10px] font-mono text-indigo-600">
                                      Novo: {red.residual_coupon_code}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Carteira de Cupons Atribuídos ao CPF / E-mail ({selectedCustomer360.assigned_coupons?.length || 0})
                    </h3>
                    {!selectedCustomer360.assigned_coupons?.length ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        Nenhum cupom nominal vinculado diretamente ao CPF/E-mail deste cliente.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedCustomer360.assigned_coupons.map((cp: any) => (
                          <div
                            key={cp.id}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                                {cp.code}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                {cp.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">{cp.batch_name}</p>
                            <div className="flex justify-between text-xs pt-1 border-t border-slate-200/70 dark:border-slate-700">
                              <span>Valor Inicial: <strong>{formatBRL(cp.initial_value)}</strong></span>
                              <span className="text-emerald-600 font-bold">
                                Saldo: {formatBRL(cp.current_balance)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 3: LOGINS, ACESSOS & ACEITES LGPD */}
              {customerDetailTab === 'logins' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-indigo-600" />
                      Histórico de Logins, Acessos e Senha ({selectedCustomer360.login_history?.length || 0})
                    </h3>
                    {!selectedCustomer360.login_history?.length ? (
                      <p className="text-xs text-slate-400 py-8 text-center">
                        Nenhum evento de login ou redefinição de senha registrado ainda para este cliente.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {selectedCustomer360.login_history.map((lg: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-indigo-700 dark:text-indigo-300">
                                {lg.event === 'LOGIN'
                                  ? '🔑 Login realizado na Loja B2C'
                                  : lg.event === 'REGISTER'
                                  ? '✨ Cadastro / Ativação de Conta'
                                  : lg.event === 'FIRST_ACCESS_PASSWORD_SET'
                                  ? '🔐 Definição de Senha em 1º Acesso'
                                  : lg.event === 'PASSWORD_RESET_COMPLETED'
                                  ? '✅ Senha Redefinida via Token'
                                  : lg.event === 'PASSWORD_RESET_SENT_BY_SELLER'
                                  ? '📧 Token de Senha Enviado pelo Painel'
                                  : lg.event}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {lg.at ? new Date(lg.at).toLocaleString('pt-BR') : '—'}
                              </span>
                            </div>
                            {lg.detail && <p className="text-slate-600 dark:text-slate-300">{lg.detail}</p>}
                            {(lg.ip || lg.user_agent) && (
                              <p className="text-[10px] font-mono text-slate-400 truncate">
                                IP: {lg.ip || '—'} • Dispositivo: {lg.user_agent || '—'}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Termos de Consentimento LGPD Aceitos ({selectedCustomer360.lgpd_consents?.length || 0})
                    </h3>
                    {!selectedCustomer360.lgpd_consents?.length ? (
                      <p className="text-xs text-slate-400 py-8 text-center">
                        Nenhum aceite LGPD registrado no checkout ainda.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {selectedCustomer360.lgpd_consents.map((c: any) => (
                          <div
                            key={c.id}
                            className="p-3 rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-emerald-800 dark:text-emerald-300">
                                ✓ Aceite LGPD ({c.terms_version})
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {c.accepted_at ? new Date(c.accepted_at).toLocaleString('pt-BR') : '—'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300">
                              Marketing Opt-in: <strong>{c.marketing_opt_in ? 'Sim' : 'Não'}</strong> • IP:{' '}
                              <span className="font-mono">{c.ip_address || '—'}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 4: DETALHES DO CADASTRO & ENDEREÇO (EDIÇÃO RÁPIDA) */}
              {customerDetailTab === 'profile' && (
                <form
                  onSubmit={handleSaveManualCustomer}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Dados Cadastrais &amp; Endereço do Cliente B2C
                      </h3>
                      <p className="text-xs text-slate-500">
                        Mantenha o CPF e o E-mail atualizados para que o cliente possa recuperar a senha e acompanhar seus pedidos.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={savingCustomer}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {savingCustomer ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Nome Completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerForm.name}
                        onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        CPF (Obrigatório) *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerForm.cpf}
                        onChange={(e) => setCustomerForm({ ...customerForm, cpf: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Telefone / WhatsApp
                      </label>
                      <input
                        type="text"
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        E-mail (Obrigatório p/ Recuperação de Senha) *
                      </label>
                      <input
                        type="email"
                        required
                        value={customerForm.email}
                        onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Definir / Redefinir Senha Manualmente (Opcional - mín. 6 dígitos)
                      </label>
                      <input
                        type="password"
                        placeholder="Deixe em branco para manter a senha atual"
                        value={customerForm.password}
                        onChange={(e) => setCustomerForm({ ...customerForm, password: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        CEP
                      </label>
                      <input
                        type="text"
                        value={customerForm.zip_code}
                        onChange={(e) => setCustomerForm({ ...customerForm, zip_code: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Logradouro / Rua
                      </label>
                      <input
                        type="text"
                        value={customerForm.street}
                        onChange={(e) => setCustomerForm({ ...customerForm, street: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Número
                      </label>
                      <input
                        type="text"
                        value={customerForm.number}
                        onChange={(e) => setCustomerForm({ ...customerForm, number: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Complemento
                      </label>
                      <input
                        type="text"
                        value={customerForm.complement}
                        onChange={(e) => setCustomerForm({ ...customerForm, complement: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Bairro
                      </label>
                      <input
                        type="text"
                        value={customerForm.neighborhood}
                        onChange={(e) => setCustomerForm({ ...customerForm, neighborhood: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Cidade
                      </label>
                      <input
                        type="text"
                        value={customerForm.city}
                        onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        UF
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={customerForm.state}
                        onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono uppercase"
                      />
                    </div>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* ── LISTAGEM DE CLIENTES B2C + IMPORTAÇÃO DE PLANILHA EXCEL + CADASTRO ── */
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
                <div>
                  <h1 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    Clientes da Loja B2C &amp; Alertas Avise-me ({b2cCustomers.length})
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clique em qualquer cliente para abrir a ficha 360º (Pedidos, Cupons Utilizados, Logins e Cadastro) ou importe planilhas Excel para migração de clientes.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={storePublicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
                    Ver Loja Online
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      setImportResultSummary(null);
                      setShowImportCustomersModal(true);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Importar Planilha Excel (Migração)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomerForm({
                        name: '',
                        cpf: '',
                        email: '',
                        phone: '',
                        zip_code: '',
                        street: '',
                        number: '',
                        complement: '',
                        neighborhood: '',
                        city: '',
                        state: '',
                        password: '',
                      });
                      setShowNewCustomerModal(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Novo Cliente B2C
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOnlyStockAlerts(false)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      !onlyStockAlerts
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Todos os Clientes ({b2cCustomers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlyStockAlerts(true)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      onlyStockAlerts
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                    Com Bandeira Avise-me ({pendingAviseMeCount})
                  </button>
                </div>

                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar nome, e-mail, CPF ou livro..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadAllData()}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                      <th className="py-3 px-4">Cliente / CPF</th>
                      <th className="py-3 px-4">E-mail / Contato</th>
                      <th className="py-3 px-4">Acesso / Logins</th>
                      <th className="py-3 px-4 text-center">Cupons Usados</th>
                      <th className="py-3 px-4 text-center">Pedidos B2C</th>
                      <th className="py-3 px-4 text-right">Total Comprado</th>
                      <th className="py-3 px-4 text-right">Ficha 360º</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {b2cCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Nenhum cliente ou solicitação Avise-me encontrada.
                        </td>
                      </tr>
                    ) : (
                      b2cCustomers.map((cust) => {
                        const alerts = Array.isArray(cust.stock_alerts) ? cust.stock_alerts : [];
                        return (
                          <tr
                            key={cust.id}
                            onClick={() => cust.customer_id && openCustomer360View(cust.customer_id)}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 align-top cursor-pointer"
                          >
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 dark:text-white">{cust.name}</span>
                                {cust.has_avise_me && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-extrabold">
                                    <Bell className="w-3 h-3" />
                                    AVISE-ME ({alerts.length})
                                  </span>
                                )}
                                {cust.origin === 'EXCEL_MIGRATION' && (
                                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 text-[10px] font-bold">
                                    Migrado
                                  </span>
                                )}
                              </div>
                              {cust.cpf && (
                                <span className="block font-mono text-[11px] text-slate-500 mt-0.5">
                                  CPF: {cust.cpf}
                                </span>
                              )}
                              {(cust.city || cust.state) && (
                                <span className="block text-[11px] text-slate-400">
                                  {cust.city}/{cust.state}
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                {cust.email || '—'}
                              </span>
                              {cust.phone && (
                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                  Tel: {cust.phone}
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              {cust.has_password ? (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px] font-bold">
                                  ✓ Senha Ativa
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 text-[10px] font-bold">
                                  1º Acesso / Recuperar
                                </span>
                              )}
                              <span className="block text-[11px] text-slate-500 mt-1">
                                {cust.logins_count || 0} login(s)
                                {cust.last_login_at
                                  ? ` • ${new Date(cust.last_login_at).toLocaleDateString('pt-BR')}`
                                  : ''}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-center font-bold text-indigo-600 dark:text-indigo-400">
                              {cust.coupons_used_count || 0}
                            </td>

                            <td className="py-3.5 px-4 text-center font-bold">
                              {cust.orders_count || 0}
                            </td>

                            <td className="py-3.5 px-4 text-right font-extrabold text-emerald-600">
                              {formatBRL(cust.total_spent || 0)}
                            </td>

                            <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              {cust.customer_id ? (
                                <button
                                  type="button"
                                  disabled={loadingCustomer360}
                                  onClick={() => openCustomer360View(cust.customer_id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 dark:bg-slate-800 text-xs font-bold text-slate-700 hover:text-indigo-600 dark:text-slate-200 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                  Abrir Cliente
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">Visitante</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* MODAL: CADASTRO MANUAL DE CLIENTE B2C */}
          {showNewCustomerModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-indigo-600" />
                      Cadastrar Cliente no B2C
                    </h3>
                    <p className="text-xs text-slate-500">
                      Informe CPF e E-mail obrigatórios para que o cliente possa recuperar a senha ou ativar o acesso na loja.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerModal(false)}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Fechar ✕
                  </button>
                </div>

                <form onSubmit={handleSaveManualCustomer} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Nome Completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerForm.name}
                        onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                        placeholder="Ex: MARIA SILVA"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        CPF (Obrigatório) *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerForm.cpf}
                        onChange={(e) => setCustomerForm({ ...customerForm, cpf: e.target.value })}
                        placeholder="000.000.000-00"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        E-mail (Obrigatório p/ Recuperação de Senha) *
                      </label>
                      <input
                        type="email"
                        required
                        value={customerForm.email}
                        onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                        placeholder="cliente@email.com.br"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Telefone / Celular
                      </label>
                      <input
                        type="text"
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                        placeholder="(11) 99999-8888"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        CEP
                      </label>
                      <input
                        type="text"
                        value={customerForm.zip_code}
                        onChange={(e) => setCustomerForm({ ...customerForm, zip_code: e.target.value })}
                        placeholder="00000-000"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Cidade
                      </label>
                      <input
                        type="text"
                        value={customerForm.city}
                        onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        UF
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={customerForm.state}
                        onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowNewCustomerModal(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingCustomer}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {savingCustomer ? 'Salvando...' : 'Salvar Cliente B2C'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: IMPORTAR PLANILHA EXCEL (.XLSX / .CSV) PARA MIGRAÇÃO DE CLIENTES */}
          {showImportCustomersModal && (
            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Upload className="w-5 h-5 text-emerald-600" />
                      Importar Clientes B2C via Planilha Excel (Migração)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ideal para migrar clientes de outra loja virtual para o Cronuz B2C.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowImportCustomersModal(false)}
                    className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Fechar ✕
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 text-xs space-y-2">
                  <p className="font-bold text-indigo-950 dark:text-indigo-200">
                    Como funciona a migração de clientes e recuperação de senha:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                    <li>
                      Os campos <strong>CPF (11 dígitos)</strong> e <strong>E-mail</strong> são obrigatórios em cada linha;
                    </li>
                    <li>
                      Quando o cliente migrado acessar a loja B2C pela primeira vez, ele poderá clicar em{' '}
                      <strong>&ldquo;Esqueci minha senha&rdquo;</strong> ou informar o CPF/E-mail no checkout para receber o token de segurança no e-mail cadastrado;
                    </li>
                    <li>
                      Limite máximo de arquivo: <strong>10 MB</strong> (formatos <code>.xlsx</code> ou <code>.csv</code>).
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={handleDownloadCustomerImportTemplate}
                    className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold text-xs cursor-pointer hover:bg-indigo-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Planilha Modelo (.xlsx)
                  </button>
                </div>

                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-5 text-center space-y-2">
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    disabled={importingCustomers}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (f) handleUploadCustomersSpreadsheet(f);
                    }}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                  />
                  {importingCustomers && (
                    <p className="text-xs font-bold text-indigo-600 animate-pulse">
                      Processando planilha e migrando clientes...
                    </p>
                  )}
                </div>

                {importResultSummary && (
                  <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs space-y-1.5">
                    <p className="font-bold text-emerald-900 dark:text-emerald-200">
                      ✓ {importResultSummary.message}
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Novos cadastrados: <strong>{importResultSummary.created_count}</strong> • Atualizados:{' '}
                      <strong>{importResultSummary.updated_count}</strong> • Ignorados:{' '}
                      <strong>{importResultSummary.skipped_count}</strong>
                    </p>
                    {Array.isArray(importResultSummary.skipped_rows) &&
                      importResultSummary.skipped_rows.length > 0 && (
                        <div className="max-h-28 overflow-y-auto pt-1 text-[11px] font-mono text-rose-600">
                          {importResultSummary.skipped_rows.map((sk: any, i: number) => (
                            <div key={i}>
                              Linha {sk.row} ({sk.name}): {sk.reason}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW 4: CONFIGURAÇÕES COM SUBMENU LIMPO (/b2c-storefront/settings)    */}
      {/* ===================================================================== */}
      {effectiveSection === 'settings' && (
        <div className="space-y-5">
          {/* Top Header of Settings with Store Link & Ver Loja Online */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Configurações da Loja B2C
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Gerencie domínio e URL da loja, dados do rodapé e SAC, SEO para o Google, checkout, integração Horus ERP, e-mails do pedido, frete, cache e LGPD.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 text-xs">
                <Globe className="w-3.5 h-3.5 text-indigo-500 mr-2 shrink-0" />
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate max-w-[250px]">
                  {storeDisplayPath}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const urlToCopy = cleanCustomDomain ? `https://${cleanCustomDomain}` : friendlyStoreUrl;
                    navigator.clipboard.writeText(urlToCopy);
                    toast.success('Link da Loja B2C copiado!');
                  }}
                  className="ml-2 p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Copiar Link da Loja"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <a
                href={storePublicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-indigo-600" />
                Ver Loja Online
              </a>
            </div>
          </div>

          {/* Submenu Horizontal de Configurações */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex flex-wrap items-center gap-2 shadow-sm">
            {[
              { id: 'store_domain', label: 'Domínio, Rodapé & SEO', icon: Globe },
              { id: 'checkout', label: 'Checkout e Pagamento', icon: CreditCard },
              { id: 'horus_orders', label: 'Pedidos Horus ERP', icon: PackageCheck },
              { id: 'emails', label: 'E-mails do Pedido', icon: Mail },
              { id: 'freight', label: 'Frete e Entrega', icon: Truck },
              { id: 'cache', label: 'Performance e Cache', icon: Database },
              { id: 'lgpd', label: 'Privacidade e LGPD', icon: ShieldCheck },
            ].map((tab) => {
              const IconComp = tab.icon;
              const isActive = settingsSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSettingsSubTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <IconComp className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* SUB-ABA 0: DOMÍNIO, URL DA LOJA, RODAPÉ OBRIGATÓRIO & SEO */}
          {settingsSubTab === 'store_domain' && (
            <div className="space-y-5">
              {/* Card 1: URL Amigável, Domínio Próprio & Status da Loja Aberta */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                        URL Amigável &amp; Domínio Próprio da Loja B2C
                      </h2>
                      <p className="text-xs text-slate-500">
                        Configure o caminho amigável <code className="font-mono">/loja/nome_cliente</code> e o domínio próprio oficial (ex: <code className="font-mono">parceria.movimentoliterario.com.br</code>).
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveB2CSettings}
                    disabled={savingSettings}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.b2c_storefront_open}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, b2c_storefront_open: e.target.checked })
                      }
                      className="mt-1 w-4 h-4 rounded text-indigo-600"
                    />
                    <div>
                      <span className="block text-sm font-bold text-slate-900 dark:text-white">
                        Loja Virtual Aberta ao Público
                      </span>
                      <span className="text-xs text-slate-500">
                        Permite que clientes naveguem pelo catálogo, criem conta com CPF/E-mail e senha segura, calculem o frete e finalizem compras.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settingsForm.allow_zero_balance_sale)}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, allow_zero_balance_sale: e.target.checked })
                      }
                      className="mt-1 w-4 h-4 rounded text-indigo-600"
                    />
                    <div>
                      <span className="block text-sm font-bold text-slate-900 dark:text-white">
                        Vender Itens com Saldo Zero (Exceto Situação FC ou FE)
                      </span>
                      <span className="text-xs text-slate-500">
                        Habilita a compra na loja B2C de produtos sem saldo imediato quando a situação do item no Horus ERP for diferente de <code className="font-mono font-bold text-rose-600">FC</code> (Fora de Catálogo) e <code className="font-mono font-bold text-rose-600">FE</code> (Falta na Editora).
                      </span>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Slug Amigável da Loja (Caminho /loja/nome_cliente)
                    </label>
                    <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
                      <span className="px-3 py-2.5 text-xs text-slate-400 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 font-mono">
                        /loja/
                      </span>
                      <input
                        type="text"
                        value={settingsForm.store_slug || effectiveStoreSlug}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            store_slug: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, '-')
                              .replace(/^\d+$/, ''),
                          })
                        }
                        placeholder="ex: movimento-literario"
                        className="w-full px-3 py-2.5 text-sm bg-transparent text-slate-900 dark:text-white focus:outline-none font-mono font-bold"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Link amigável interno:{' '}
                      <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                        {friendlyStoreUrl}
                      </strong>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Subdomínio padrão B2C:{' '}
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                        {officialB2cSubdomainUrl}
                      </strong>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Domínio ou Subdomínio Próprio Oficial (Prioritário no botão Ver Loja)
                    </label>
                    <input
                      type="text"
                      value={settingsForm.b2c_custom_domain}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, b2c_custom_domain: e.target.value })
                      }
                      placeholder={`ex: parceria.movimentoliterario.com.br ou ${officialB2cSubdomain}`}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                      Quando preenchido, todos os botões <strong>Ver Loja</strong> do painel abrirão diretamente{' '}
                      <strong className="font-mono text-indigo-600 dark:text-indigo-400">
                        {cleanCustomDomain ? `https://${cleanCustomDomain}` : 'https://seu-dominio.com.br'}
                      </strong>
                      . Aponte um registro <strong>CNAME</strong> para{' '}
                      <code className="font-mono text-indigo-600 dark:text-indigo-400">
                        {officialB2cSubdomain}
                      </code>{' '}
                      (ou registro <strong>A</strong> para <code className="font-mono">64.23.182.183</code>).
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Rodapé Obrigatório (CNPJ, Endereço) & Página de Contato (SAC) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                        Rodapé Obrigatório (CNPJ, Endereço) &amp; Página de Contato (SAC)
                      </h2>
                      <p className="text-xs text-slate-500">
                        Informações legais obrigatórias no e-commerce brasileiro (Decreto nº 7.962/2013) exibidas no rodapé e na página Fale Conosco.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveB2CSettings}
                    disabled={savingSettings}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Razão Social da Empresa
                    </label>
                    <input
                      type="text"
                      value={settingsForm.footer_info.legal_name}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          footer_info: { ...settingsForm.footer_info, legal_name: e.target.value },
                        })
                      }
                      placeholder="Ex: Editora Exemplo Ltda"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      CNPJ Obrigatório
                    </label>
                    <input
                      type="text"
                      value={settingsForm.footer_info.cnpj}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          footer_info: { ...settingsForm.footer_info, cnpj: e.target.value },
                        })
                      }
                      placeholder="00.000.000/0001-00"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Endereço Físico Completo (Exibido no Rodapé e Contato)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.footer_info.address_line}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        footer_info: { ...settingsForm.footer_info, address_line: e.target.value },
                      })
                    }
                    placeholder="Ex: Rua das Letras, 100 - Centro • São Paulo/SP • CEP 01000-000"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      WhatsApp de Atendimento
                    </label>
                    <input
                      type="text"
                      value={settingsForm.footer_info.whatsapp}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          footer_info: { ...settingsForm.footer_info, whatsapp: e.target.value },
                        })
                      }
                      placeholder="Ex: (11) 99999-9999"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Telefone Fixo / SAC
                    </label>
                    <input
                      type="text"
                      value={settingsForm.footer_info.contact_phone}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          footer_info: { ...settingsForm.footer_info, contact_phone: e.target.value },
                        })
                      }
                      placeholder="Ex: (11) 3000-0000"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      E-mail de Atendimento
                    </label>
                    <input
                      type="email"
                      value={settingsForm.footer_info.contact_email}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          footer_info: { ...settingsForm.footer_info, contact_email: e.target.value },
                        })
                      }
                      placeholder="sac@sualoja.com.br"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Horário de Atendimento
                    </label>
                    <input
                      type="text"
                      value={settingsForm.footer_info.business_hours}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          footer_info: { ...settingsForm.footer_info, business_hours: e.target.value },
                        })
                      }
                      placeholder="Segunda a Sexta, das 09h às 18h"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Texto Institucional do Rodapé (Sobre a Loja)
                    </label>
                    <input
                      type="text"
                      value={settingsForm.footer_info.about_text}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          footer_info: { ...settingsForm.footer_info, about_text: e.target.value },
                        })
                      }
                      placeholder="Breve descrição da sua livraria/editora..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: SEO Dinâmico para Buscas do Google (ISBN Automático, Categorias, Vitrines & Sitemap XML) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                        SEO para Buscas do Google (ISBN Automático, Categorias, Vitrines e Home)
                      </h2>
                      <p className="text-xs text-slate-500">
                        O sistema já preenche automaticamente o Nome do Livro, ISBN (GTIN-13), Autor, Editora e Preço para o Google. Personalize os padrões abaixo se desejar.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const cid = summary?.settings?.company_id || getUser()?.company_id || '';
                        const smUrl = `${apiBase}/b2c/public/sitemap.xml?company_id=${cid}`;
                        navigator.clipboard.writeText(smUrl);
                        toast.success('URL do Sitemap XML copiada para o Google Search Console!');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copiar Sitemap XML (Google)
                    </button>
                    <button
                      onClick={handleSaveB2CSettings}
                      disabled={savingSettings}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                      {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <span className="font-bold text-slate-800 dark:text-white block">
                    Variáveis automáticas disponíveis nos modelos:
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {['{nome}', '{isbn}', '{autor}', '{editora}', '{categoria}', '{vitrine}', '{preco}', '{loja}'].map(
                      (v) => (
                        <code
                          key={v}
                          className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-indigo-600 dark:text-indigo-400 font-bold"
                        >
                          {v}
                        </code>
                      )
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Título SEO da Página Inicial (Home)
                    </label>
                    <input
                      type="text"
                      value={settingsForm.seo_config.home_title}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: { ...settingsForm.seo_config, home_title: e.target.value },
                        })
                      }
                      placeholder="{loja} | Livraria e Loja Oficial"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Descrição SEO da Página Inicial (Meta Description)
                    </label>
                    <input
                      type="text"
                      value={settingsForm.seo_config.home_description}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: { ...settingsForm.seo_config, home_description: e.target.value },
                        })
                      }
                      placeholder="Compre livros na loja oficial {loja}..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Padrão de Título das Páginas de Livro (com ISBN automático)
                    </label>
                    <input
                      type="text"
                      value={settingsForm.seo_config.product_title_template}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: {
                            ...settingsForm.seo_config,
                            product_title_template: e.target.value,
                          },
                        })
                      }
                      placeholder="{nome} - ISBN {isbn} | {autor} | {loja}"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Padrão de Descrição das Páginas de Livro
                    </label>
                    <input
                      type="text"
                      value={settingsForm.seo_config.product_description_template}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: {
                            ...settingsForm.seo_config,
                            product_description_template: e.target.value,
                          },
                        })
                      }
                      placeholder="Compre o livro {nome} (ISBN {isbn}) de {autor}, editora {editora} na {loja}."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Padrão de Título das Categorias
                    </label>
                    <input
                      type="text"
                      value={settingsForm.seo_config.category_title_template}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: {
                            ...settingsForm.seo_config,
                            category_title_template: e.target.value,
                          },
                        })
                      }
                      placeholder="{categoria} - Livros em Oferta | {loja}"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Padrão de Título das Vitrines
                    </label>
                    <input
                      type="text"
                      value={settingsForm.seo_config.showcase_title_template}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: {
                            ...settingsForm.seo_config,
                            showcase_title_template: e.target.value,
                          },
                        })
                      }
                      placeholder="{vitrine} | Seleção Especial {loja}"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Código de Verificação Google Search Console (opcional)
                    </label>
                    <input
                      type="text"
                      value={settingsForm.seo_config.google_site_verification}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: {
                            ...settingsForm.seo_config,
                            google_site_verification: e.target.value,
                          },
                        })
                      }
                      placeholder="Ex: google-site-verification=..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsForm.seo_config.auto_json_ld !== false}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          seo_config: {
                            ...settingsForm.seo_config,
                            auto_json_ld: e.target.checked,
                          },
                        })
                      }
                      className="mt-0.5 rounded text-emerald-600"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-emerald-950 dark:text-emerald-200 block">
                        Dados Estruturados Google (Schema.org Book + ISBN)
                      </span>
                      <span className="text-[11px] text-emerald-800 dark:text-emerald-300">
                        Envia automaticamente ISBN/GTIN-13, Preço, Autor, Editora e Disponibilidade de Estoque para os resultados ricos do Google.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* SUB-ABA 1: CHECKOUT E GATEWAYS DE PAGAMENTO HOMOLOGADOS */}
          {settingsSubTab === 'checkout' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Checkout &amp; Gateways de Pagamento Homologados
                  </h1>
                  <p className="text-xs text-slate-500">
                    Visualize e gerencie o gateway homologado para processar PIX e Cartão de Crédito no checkout padrão da loja B2C.
                  </p>
                </div>
              </div>
            </div>

            {/* Gateway, credenciais e modo de finalização ficam em Configurações > Pagamentos (fonte única) */}
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Pagamento da loja B2C</p>
                <p>
                  Gateway ativo: <strong>{settingsForm.payment_gateway_active || 'EFI'}</strong> · Finalização:{' '}
                  <strong>Checkout na loja / Link de Pagamento</strong>
                </p>
                <p className="text-slate-500">
                  O gateway (Vindi / Efí), as credenciais e o modo de finalização são configurados em Configurações → Pagamentos.
                </p>
              </div>
              <a
                href="/settings"
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold text-center shrink-0"
              >
                Abrir Configurações → Pagamentos
              </a>
            </div>
          </div>
          )}

          {/* SUB-ABA: INTEGRAÇÃO DE PEDIDOS COM O HORUS ERP (API ABERTA B2C) */}
          {settingsSubTab === 'horus_orders' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                    <PackageCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      Integração de Pedidos com o Horus ERP (API Aberta B2C)
                    </h1>
                    <p className="text-xs text-slate-500">
                      Cadastra ou localiza o cliente apenas pelo CPF/CNPJ (sem exigir ID_GUID), atualiza o endereço de entrega e cria o pedido de venda automaticamente em CAIXA ALTA.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSaveB2CSettings}
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {savingSettings ? 'Salvando...' : 'Salvar Parâmetros Horus'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.horus_order_config?.enabled)}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          enabled: e.target.checked,
                        },
                      })
                    }
                    className="mt-1 w-4 h-4 rounded text-indigo-600"
                  />
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">
                      Habilitar Integração de Pedidos B2C com o Horus ERP
                    </span>
                    <span className="text-xs text-slate-500">
                      Permite enviar pedidos da loja B2C para o Horus ERP (manualmente no pedido ou automaticamente ao confirmar pagamento).
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.horus_order_config?.auto_send_on_paid)}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          auto_send_on_paid: e.target.checked,
                        },
                      })
                    }
                    className="mt-1 w-4 h-4 rounded text-indigo-600"
                  />
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">
                      Enviar Automaticamente quando o Pedido ficar &ldquo;Pago&rdquo;
                    </span>
                    <span className="text-xs text-slate-500">
                      Assim que o pagamento for aprovado (via Cartão, PIX, Cupom 100% ou alteração manual para Pago), o pedido é integrado no Horus.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.allow_zero_balance_sale)}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        allow_zero_balance_sale: e.target.checked,
                      })
                    }
                    className="mt-1 w-4 h-4 rounded text-indigo-600"
                  />
                  <div>
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">
                      Permitir Venda com Saldo Zero (se Situação ≠ FC e ≠ FE)
                    </span>
                    <span className="text-xs text-slate-500">
                      Guarda a situação do item no Cronuz (<code className="font-mono">SITUACAO_ITEM</code>) e libera a compra B2C com saldo zero se não for <code className="font-mono font-bold text-rose-600">FC</code> nem <code className="font-mono font-bold text-rose-600">FE</code>.
                    </span>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Parâmetro Fiscal Estadual (Mesma UF) *
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.cod_param_fiscal_intra || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          cod_param_fiscal_intra: e.target.value,
                        },
                      })
                    }
                    placeholder="Ex: 68 ou 1"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Parâmetro Fiscal Interestadual (Outra UF) *
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.cod_param_fiscal_inter || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          cod_param_fiscal_inter: e.target.value,
                        },
                      })
                    }
                    placeholder="Ex: 41 ou 2"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Pedido (`TIPO_PEDIDO_V_T_D`)
                  </label>
                  <select
                    value={settingsForm.horus_order_config?.tipo_pedido || 'L'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          tipo_pedido: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                  >
                    <option value="L">L — Liberação / Remessa (Padrão B2C)</option>
                    <option value="V">V — Venda Direta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status Final no Horus (`STA_PEDIDO`)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.status_envio_erp || 'LEX'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          status_envio_erp: e.target.value.toUpperCase(),
                        },
                      })
                    }
                    placeholder="LEX"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código do Método (`COD_METODO`)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.cod_metodo || '1'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          cod_metodo: e.target.value,
                        },
                      })
                    }
                    placeholder="1 ou 2"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Endereço (`COD_TPO_END`)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.cod_endereco || '1'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          cod_endereco: e.target.value,
                        },
                      })
                    }
                    placeholder="1"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código da Transportadora (`COD_TRANSP`)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.cod_transp || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          cod_transp: e.target.value,
                        },
                      })
                    }
                    placeholder="Ex: 2"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Modalidade Frete (`FRETE_EMIT_DEST`)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.frete_emit_dest || '1'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          frete_emit_dest: e.target.value,
                        },
                      })
                    }
                    placeholder="1 (CIF) ou 2 (FOB)"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Responsável p/ Novos Clientes (`NOM_RESP`)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.resp_cliente || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          resp_cliente: e.target.value.toUpperCase(),
                        },
                      })
                    }
                    placeholder="Ex: LOJA B2C ou FMZ"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Cód. Responsável (`COD_RESPONSAVEL`)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.horus_order_config?.cod_resp || '1'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          cod_resp: e.target.value,
                        },
                      })
                    }
                    placeholder="1"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Valor Unitário Enviado nos Itens (`VLR_LIQUIDO`)
                  </label>
                  <select
                    value={settingsForm.horus_order_config?.price_mode || 'UNIT_PRICE'}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        horus_order_config: {
                          ...settingsForm.horus_order_config,
                          price_mode: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                  >
                    <option value="UNIT_PRICE">Preço Unitário de Venda da Loja</option>
                    <option value="NET_PAID">Valor Líquido proporcional (após abatimento de cupom)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold cursor-pointer w-full">
                    <input
                      type="checkbox"
                      checked={settingsForm.horus_order_config?.send_freight_value !== false}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          horus_order_config: {
                            ...settingsForm.horus_order_config,
                            send_freight_value: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <span>Enviar Valor do Frete (`VLR_FRETE`)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* SUB-ABA: NOTIFICAÇÕES AUTOMÁTICAS DE E-MAIL DO PEDIDO B2C */}
          {settingsSubTab === 'emails' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    E-mails Automáticos do Pedido (Layout Simples &amp; Objetivo)
                  </h1>
                  <p className="text-xs text-slate-500">
                    Disparo automático para o cliente ao realizar o pedido, ao ter o pagamento confirmado e caso o pedido seja cancelado.
                  </p>
                </div>
              </div>
              <button
                onClick={handleSaveB2CSettings}
                disabled={savingSettings}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {savingSettings ? 'Salvando...' : 'Salvar Textos de E-mail'}
              </button>
            </div>

            {/* Card de Disparo de E-mail de Teste Imediato */}
            <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs sm:text-sm font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  Testar Disparo de E-mail Agora
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Envie um e-mail de teste real com os textos configurados abaixo para validar o recebimento e o visual na sua caixa de entrada.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={testEmailStatus}
                  onChange={(e) => setTestEmailStatus(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                >
                  <option value="WAITING_PAYMENT">1. Pedido Realizado (Aguardando Pagamento)</option>
                  <option value="PAID">2. Pagamento Aprovado (Pedido Pago)</option>
                  <option value="SEPARATION">3. Pedido em Separação</option>
                  <option value="FINALIZED">4. Pedido Finalizado / NF-e Emitida</option>
                  <option value="DELIVERED">5. Pedido Entregue</option>
                  <option value="CANCELLED">6. Pedido Cancelado</option>
                </select>
                <input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="Digite o e-mail para receber o teste..."
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs min-w-[230px]"
                />
                <button
                  type="button"
                  disabled={sendingTestEmail}
                  onClick={handleSendTestEmail}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {sendingTestEmail ? 'Disparando Teste...' : 'Enviar E-mail de Teste'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsForm.email_notifications_config?.enabled !== false}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      email_notifications_config: {
                        ...settingsForm.email_notifications_config,
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="mt-1 w-4 h-4 rounded text-indigo-600"
                />
                <div>
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">
                    Ativar Disparo Automático de E-mails Transacionais do Pedido
                  </span>
                  <span className="text-xs text-slate-500">
                    Utiliza a infraestrutura de e-mail já configurada na plataforma. Variáveis dinâmicas suportadas nos textos:{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px]">{'{cliente}'}</code>,{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px]">{'{pedido}'}</code>,{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px]">{'{loja}'}</code> e{' '}
                    <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[11px]">{'{valor}'}</code>.
                  </span>
                </div>
              </label>

              {/* Seletor rápido de quais Status do Pedido disparam e-mail quando alterados */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                  Quais Status do Pedido Podem Disparar E-mail Quando o Status Mudar?
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'waiting_payment_enabled', label: '⏳ Aguardando Pagamento' },
                    { key: 'paid_enabled', label: '✅ Pago' },
                    { key: 'separation_enabled', label: '📦 Em Separação' },
                    { key: 'finalized_enabled', label: '🚚 Finalizado' },
                    { key: 'delivered_enabled', label: '🎉 Entregue' },
                    { key: 'canceled_enabled', label: '❌ Cancelado' },
                  ].map((st) => {
                    const isChecked = settingsForm.email_notifications_config?.[st.key] !== false;
                    return (
                      <label
                        key={st.key}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                          isChecked
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:border-indigo-500 dark:text-indigo-200'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              email_notifications_config: {
                                ...settingsForm.email_notifications_config,
                                [st.key]: e.target.checked,
                              },
                            })
                          }
                          className="w-3.5 h-3.5 rounded text-indigo-600"
                        />
                        {st.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 1. Pedido Realizado (Aguardando Pagamento) */}
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                    1. Aguardando Pagamento
                  </span>
                  <input
                    type="checkbox"
                    checked={settingsForm.email_notifications_config?.waiting_payment_enabled !== false}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          waiting_payment_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Assunto do E-mail
                  </label>
                  <input
                    type="text"
                    value={settingsForm.email_notifications_config?.waiting_payment_subject || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          waiting_payment_subject: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Mensagem Principal (Simples e Objetiva)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settingsForm.email_notifications_config?.waiting_payment_message ||
                      settingsForm.email_notifications_config?.waiting_payment_body ||
                      ''
                    }
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          waiting_payment_message: e.target.value,
                          waiting_payment_body: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                  />
                </div>
              </div>

              {/* 2. Pagamento Aprovado (Pedido Pago) */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                    2. Pago (Pagamento Aprovado)
                  </span>
                  <input
                    type="checkbox"
                    checked={settingsForm.email_notifications_config?.paid_enabled !== false}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          paid_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Assunto do E-mail
                  </label>
                  <input
                    type="text"
                    value={settingsForm.email_notifications_config?.paid_subject || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          paid_subject: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Mensagem Principal (Simples e Objetiva)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settingsForm.email_notifications_config?.paid_message ||
                      settingsForm.email_notifications_config?.paid_body ||
                      ''
                    }
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          paid_message: e.target.value,
                          paid_body: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                  />
                </div>
              </div>

              {/* 3. Em Separação */}
              <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                    3. Em Separação
                  </span>
                  <input
                    type="checkbox"
                    checked={settingsForm.email_notifications_config?.separation_enabled !== false}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          separation_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Assunto do E-mail
                  </label>
                  <input
                    type="text"
                    value={settingsForm.email_notifications_config?.separation_subject || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          separation_subject: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Mensagem Principal (Simples e Objetiva)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settingsForm.email_notifications_config?.separation_message ||
                      settingsForm.email_notifications_config?.separation_body ||
                      ''
                    }
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          separation_message: e.target.value,
                          separation_body: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                  />
                </div>
              </div>

              {/* 4. Finalizado */}
              <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/30 dark:bg-sky-950/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">
                    4. Finalizado (Pronto p/ Envio)
                  </span>
                  <input
                    type="checkbox"
                    checked={settingsForm.email_notifications_config?.finalized_enabled !== false}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          finalized_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Assunto do E-mail
                  </label>
                  <input
                    type="text"
                    value={settingsForm.email_notifications_config?.finalized_subject || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          finalized_subject: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Mensagem Principal (Simples e Objetiva)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settingsForm.email_notifications_config?.finalized_message ||
                      settingsForm.email_notifications_config?.finalized_body ||
                      ''
                    }
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          finalized_message: e.target.value,
                          finalized_body: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                  />
                </div>
              </div>

              {/* 5. Entregue */}
              <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/30 dark:bg-teal-950/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
                    5. Entregue
                  </span>
                  <input
                    type="checkbox"
                    checked={settingsForm.email_notifications_config?.delivered_enabled !== false}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          delivered_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Assunto do E-mail
                  </label>
                  <input
                    type="text"
                    value={settingsForm.email_notifications_config?.delivered_subject || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          delivered_subject: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Mensagem Principal (Simples e Objetiva)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settingsForm.email_notifications_config?.delivered_message ||
                      settingsForm.email_notifications_config?.delivered_body ||
                      ''
                    }
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          delivered_message: e.target.value,
                          delivered_body: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                  />
                </div>
              </div>

              {/* 6. Pedido Cancelado */}
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/30 dark:bg-rose-950/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">
                    6. Cancelado
                  </span>
                  <input
                    type="checkbox"
                    checked={settingsForm.email_notifications_config?.canceled_enabled !== false}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          canceled_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Assunto do E-mail
                  </label>
                  <input
                    type="text"
                    value={settingsForm.email_notifications_config?.canceled_subject || ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          canceled_subject: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Mensagem Principal (Simples e Objetiva)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      settingsForm.email_notifications_config?.canceled_message ||
                      settingsForm.email_notifications_config?.canceled_body ||
                      ''
                    }
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        email_notifications_config: {
                          ...settingsForm.email_notifications_config,
                          canceled_message: e.target.value,
                          canceled_body: e.target.value,
                        },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Texto de Rodapé do E-mail
                </label>
                <input
                  type="text"
                  value={settingsForm.email_notifications_config?.footer_note || ''}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      email_notifications_config: {
                        ...settingsForm.email_notifications_config,
                        footer_note: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs text-slate-600 dark:text-slate-400 flex items-center">
                <span>
                  O layout inclui automaticamente o <strong>cabeçalho da loja</strong>, o <strong>selo de status</strong>, o <strong>texto personalizado acima</strong>, a <strong>tabela com os itens e valores do pedido</strong> (e botão de pagamento quando aguardando pagamento).
                </span>
              </div>
            </div>
          </div>
          )}

          {/* SUB-ABA 2: CONFIGURAÇÕES DE FRETE (CORREIOS DIRETO + TABELA DE TRANSPORTADORA POR PESO E CEP) */}
          {settingsSubTab === 'freight' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Frete por CEP e Peso (Correios &amp; Transportadora)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Configure os Correios (PAC e SEDEX) e sua tabela de transportadora por faixa de CEP/UF e peso (kg).
                  </p>
                </div>
              </div>
              <button
                onClick={handleSaveB2CSettings}
                disabled={savingSettings}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {savingSettings ? 'Salvando...' : 'Salvar Frete'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  CEP de Origem da Loja
                </label>
                <input
                  type="text"
                  value={settingsForm.origin_zip_code}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      origin_zip_code: e.target.value.replace(/\D/g, '').slice(0, 8),
                    })
                  }
                  placeholder="01001000"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Peso Padrão por Livro (kg)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  value={settingsForm.freight_config.default_book_weight_kg}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      freight_config: {
                        ...settingsForm.freight_config,
                        default_book_weight_kg: Number(e.target.value || 0.35),
                      },
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Frete Grátis Acima de (R$)
                </label>
                <CurrencyInput
                  prefixStr="R$ "
                  value={settingsForm.b2c_free_shipping_min_value}
                  onChangeValue={(val) =>
                    setSettingsForm({ ...settingsForm, b2c_free_shipping_min_value: val })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                />
              </div>
            </div>

            {/* Correios Direto */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.freight_config.correios_enabled}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        freight_config: {
                          ...settingsForm.freight_config,
                          correios_enabled: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Habilitar Cálculo Automático Correios (PAC e SEDEX por CEP e Peso)
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Usuário / Contrato Correios (Opcional)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.correios_user}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, correios_user: e.target.value })
                    }
                    placeholder="Código Administrativo / Meu Correios"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                     Chave de Acesso / Token Correios (Opcional)
                  </label>
                  <input
                    type="password"
                    value={settingsForm.correios_password}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, correios_password: e.target.value })
                    }
                    placeholder="Token de API Correios"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Tabela de Frete Personalizada / Transportadora (Por UF/CEP e Peso) */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Tabela de Transportadora por Faixa de CEP / UF e Peso (kg)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Adicione faixas de peso e CEP/Estado para disponibilizar opções adicionais de entrega quando o cliente informar o CEP no carrinho.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettingsForm({
                      ...settingsForm,
                      freight_config: {
                        ...settingsForm.freight_config,
                        carrier_table: [
                          ...settingsForm.freight_config.carrier_table,
                          {
                            name: 'Transportadora Expressa',
                            uf: 'ALL',
                            cep_start: '',
                            cep_end: '',
                            weight_min_kg: 0,
                            weight_max_kg: 5,
                            price: 18.9,
                            delivery_days: 4,
                            active: true,
                          },
                        ],
                      },
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold cursor-pointer self-start"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Faixa de Frete
                </button>
              </div>

              {settingsForm.freight_config.carrier_table.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                  Nenhuma faixa de transportadora cadastrada. O sistema utilizará o cálculo dos Correios (PAC e SEDEX).
                </div>
              ) : (
                <div className="space-y-2.5">
                  {settingsForm.freight_config.carrier_table.map((row: any, idx: number) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 items-end"
                    >
                      <div className="lg:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          Nome da Modalidade / Transp.
                        </label>
                        <input
                          type="text"
                          value={row.name || ''}
                          onChange={(e) => {
                            const updated = [...settingsForm.freight_config.carrier_table];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            setSettingsForm({
                              ...settingsForm,
                              freight_config: { ...settingsForm.freight_config, carrier_table: updated },
                            });
                          }}
                          placeholder="Ex: Jadlog Package"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          UF (ALL = Todos)
                        </label>
                        <input
                          type="text"
                          maxLength={3}
                          value={row.uf || 'ALL'}
                          onChange={(e) => {
                            const updated = [...settingsForm.freight_config.carrier_table];
                            updated[idx] = { ...updated[idx], uf: e.target.value.toUpperCase() };
                            setSettingsForm({
                              ...settingsForm,
                              freight_config: { ...settingsForm.freight_config, carrier_table: updated },
                            });
                          }}
                          placeholder="ALL ou SP"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          Peso Mín (kg)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={row.weight_min_kg ?? 0}
                          onChange={(e) => {
                            const updated = [...settingsForm.freight_config.carrier_table];
                            updated[idx] = { ...updated[idx], weight_min_kg: Number(e.target.value) };
                            setSettingsForm({
                              ...settingsForm,
                              freight_config: { ...settingsForm.freight_config, carrier_table: updated },
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          Peso Máx (kg)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={row.weight_max_kg ?? 10}
                          onChange={(e) => {
                            const updated = [...settingsForm.freight_config.carrier_table];
                            updated[idx] = { ...updated[idx], weight_max_kg: Number(e.target.value) };
                            setSettingsForm({
                              ...settingsForm,
                              freight_config: { ...settingsForm.freight_config, carrier_table: updated },
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          Valor do Frete (R$)
                        </label>
                        <CurrencyInput
                          prefixStr="R$ "
                          value={Number(row.price || 0)}
                          onChangeValue={(val) => {
                            const updated = [...settingsForm.freight_config.carrier_table];
                            updated[idx] = { ...updated[idx], price: val };
                            setSettingsForm({
                              ...settingsForm,
                              freight_config: { ...settingsForm.freight_config, carrier_table: updated },
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Prazo (dias)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={row.delivery_days ?? 4}
                            onChange={(e) => {
                              const updated = [...settingsForm.freight_config.carrier_table];
                              updated[idx] = { ...updated[idx], delivery_days: Number(e.target.value) };
                              setSettingsForm({
                                ...settingsForm,
                                freight_config: { ...settingsForm.freight_config, carrier_table: updated },
                              });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = settingsForm.freight_config.carrier_table.filter(
                              (_: any, i: number) => i !== idx
                            );
                            setSettingsForm({
                              ...settingsForm,
                              freight_config: { ...settingsForm.freight_config, carrier_table: updated },
                            });
                          }}
                          className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer mt-4"
                          title="Remover faixa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          {/* SUB-ABA 3: MOTOR DE CACHE & ALTA PERFORMANCE DA VITRINE B2C */}
          {settingsSubTab === 'cache' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      Cache de Alta Performance da Vitrine B2C
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        cacheStatus?.enabled !== false
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {cacheStatus?.enabled !== false ? '● Cache Ativo' : '○ Cache Desativado'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Acumula em memória as consultas de catálogo, categorias e vitrines para atender milhares de acessos simultâneos sem sobrecarregar o ERP Horus ou o banco de dados.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleWarmupCache}
                  disabled={warmingCache}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Flame className={`w-4 h-4 ${warmingCache ? 'animate-pulse' : ''}`} />
                  {warmingCache ? 'Aquecendo...' : 'Pré-Aquecer Vitrine'}
                </button>

                <button
                  type="button"
                  onClick={handleClearCache}
                  disabled={clearingCache}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${clearingCache ? 'animate-spin' : ''}`} />
                  {clearingCache ? 'Limpando...' : 'Limpar Cache Agora'}
                </button>
              </div>
            </div>

            {/* Live Cache Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Páginas / Consultas em Cache
                </span>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5 block">
                  {cacheStatus?.cached_entries_count || 0} páginas
                </span>
                <span className="text-[10px] text-slate-400">
                  ~{cacheStatus?.estimated_size_kb || 0} KB em memória
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Acessos Atendidos pelo Cache
                </span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {cacheStatus?.cache_hits || 0} hits
                </span>
                <span className="text-[10px] text-slate-400">
                  Consultas poupadas do ERP
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Taxa de Eficiência (Hit Rate)
                </span>
                <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                  {cacheStatus?.hit_rate_percent || 0}%
                </span>
                <span className="text-[10px] text-slate-400">
                  {cacheStatus?.cache_misses || 0} leituras de origem
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Última Limpeza Manual / Auto
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 block">
                  {cacheStatus?.last_cleared_at
                    ? new Date(cacheStatus.last_cleared_at).toLocaleString('pt-BR')
                    : 'Automático por expiração'}
                </span>
                <span className="text-[10px] text-slate-400">
                  Expira a cada {Math.round(Number(cacheStatus?.ttl_seconds || 900) / 60)} min
                </span>
              </div>
            </div>

            {/* Seller Cache Controls (Enable/Disable & TTL) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cacheStatus?.enabled !== false}
                  disabled={savingCacheConfig}
                  onChange={(e) =>
                    handleUpdateCacheConfig(
                      e.target.checked,
                      Number(cacheStatus?.ttl_seconds || 900)
                    )
                  }
                  className="mt-1 w-4 h-4 rounded text-emerald-600"
                />
                <div>
                  <span className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Acumular Cache Automaticamente na Vitrine B2C (Recomendado)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Mantém as vitrines e páginas de livros em memória rápida. Sempre que você salvar alterações em Banners, Vitrines ou Promoções, o cache é atualizado automaticamente.
                  </span>
                </div>
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tempo de Retenção do Cache (Renovação Automática)
                </label>
                <select
                  value={Number(cacheStatus?.ttl_seconds || 900)}
                  disabled={savingCacheConfig}
                  onChange={(e) =>
                    handleUpdateCacheConfig(
                      cacheStatus?.enabled !== false,
                      Number(e.target.value)
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value={300}>5 minutos (Atualização frequente)</option>
                  <option value={900}>15 minutos (Recomendado — Equilíbrio ideal)</option>
                  <option value={1800}>30 minutos (Alta performance)</option>
                  <option value={3600}>1 hora (Campanhas de alto tráfego)</option>
                  <option value={21600}>6 horas (Máxima proteção do ERP)</option>
                  <option value={86400}>24 horas (Catálogo estático)</option>
                </select>
              </div>
            </div>
          </div>
          )}

          {/* SUB-ABA 4: PRIVACIDADE & CONSENTIMENTO LGPD */}
          {settingsSubTab === 'lgpd' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Termo de Privacidade &amp; Consentimento LGPD (Lei nº 13.709/2018)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Texto apresentado para aceite obrigatório do cliente no momento do checkout.
                  </p>
                </div>
                <button
                  onClick={handleSaveB2CSettings}
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {savingSettings ? 'Salvando...' : 'Salvar Termo LGPD'}
                </button>
              </div>
              <textarea
                rows={3}
                value={settingsForm.b2c_lgpd_terms_text}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, b2c_lgpd_terms_text: e.target.value })
                }
                placeholder="Ao finalizar seu cadastro e pedido, você autoriza o tratamento dos seus dados pessoais conforme a LGPD..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Registro de Consentimento LGPD dos Clientes ({lgpdConsents.length})
                  </h3>
                </div>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3 px-4">Data / Hora</th>
                    <th className="py-3 px-4">Cliente (Nome / CPF)</th>
                    <th className="py-3 px-4">E-mail</th>
                    <th className="py-3 px-4">IP</th>
                    <th className="py-3 px-4">Versão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {lgpdConsents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        Nenhum registro de aceite LGPD ainda.
                      </td>
                    </tr>
                  ) : (
                    lgpdConsents.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono">
                          {c.accepted_at ? new Date(c.accepted_at).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {c.customer_name}
                          <span className="block font-mono text-[11px] font-normal text-slate-500">
                            CPF: {c.customer_cpf}
                          </span>
                        </td>
                        <td className="py-3 px-4">{c.customer_email}</td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {c.ip_address}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 font-bold">
                            {c.terms_version}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: GERAR LOTE DE CUPONS                                         */}
      {/* ===================================================================== */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-indigo-600" />
                Gerar Lote de Cupons de Desconto
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-sm font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Campanha / Lote *
                  </label>
                  <input
                    type="text"
                    required
                    value={batchForm.name}
                    onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                    placeholder="Ex: Campanha Leitura 2026"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Empresa / Parceiro (Opcional)
                  </label>
                  <input
                    type="text"
                    value={batchForm.partner_company_name}
                    onChange={(e) =>
                      setBatchForm({ ...batchForm, partner_company_name: e.target.value })
                    }
                    placeholder="Ex: Empresa Parceira Ltda"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Modo de Geração */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Formato dos Códigos
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBatchForm({ ...batchForm, batch_mode: 'INDIVIDUAL_CODES' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      batchForm.batch_mode === 'INDIVIDUAL_CODES'
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Vários Códigos Individuais
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Gera N códigos únicos para distribuir individualmente ou exportar em planilha.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBatchForm({ ...batchForm, batch_mode: 'SHARED_CPF_LIMIT' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      batchForm.batch_mode === 'SHARED_CPF_LIMIT'
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Código Único Controlado por CPF
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Um único código promocional onde cada CPF possui seu próprio saldo individual.
                    </p>
                  </button>
                </div>

                {batchForm.batch_mode === 'INDIVIDUAL_CODES' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Prefixo dos Códigos
                      </label>
                      <input
                        type="text"
                        value={batchForm.code_prefix}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, code_prefix: e.target.value.toUpperCase() })
                        }
                        placeholder="Ex: PROMO"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Quantidade de Cupons
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={batchForm.quantity}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, quantity: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Código Único Compartilhado *
                      </label>
                      <input
                        type="text"
                        value={batchForm.shared_code}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, shared_code: e.target.value.toUpperCase() })
                        }
                        placeholder="Ex: LEITURA100"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Limite Máximo de Usos (CPFs)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={batchForm.quantity}
                        onChange={(e) =>
                          setBatchForm({ ...batchForm, quantity: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Valor com alternador R$ / % e CurrencyInput */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Desconto
                  </label>
                  <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setBatchForm({ ...batchForm, discount_type: 'FIXED_BRL' })}
                      className={`flex-1 py-2 text-xs font-bold ${
                        batchForm.discount_type === 'FIXED_BRL'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      Valor (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBatchForm({ ...batchForm, discount_type: 'PERCENTAGE', coupon_value: 20 })
                      }
                      className={`flex-1 py-2 text-xs font-bold ${
                        batchForm.discount_type === 'PERCENTAGE'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      Percentual (%)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {batchForm.discount_type === 'PERCENTAGE'
                      ? 'Percentual (%)'
                      : 'Valor de Cada Cupom (R$)'}
                  </label>
                  <CurrencyInput
                    prefixStr={batchForm.discount_type === 'FIXED_BRL' ? 'R$ ' : ''}
                    suffixStr={batchForm.discount_type === 'PERCENTAGE' ? '%' : ''}
                    max={batchForm.discount_type === 'PERCENTAGE' ? 100 : undefined}
                    value={batchForm.coupon_value}
                    onChangeValue={(val) => setBatchForm({ ...batchForm, coupon_value: val })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Validade (Opcional)
                  </label>
                  <input
                    type="date"
                    value={batchForm.valid_until}
                    onChange={(e) => setBatchForm({ ...batchForm, valid_until: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              {/* Flags de Frete e Saldo Residual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchForm.allows_freight_discount}
                    onChange={(e) =>
                      setBatchForm({ ...batchForm, allows_freight_discount: e.target.checked })
                    }
                    className="mt-0.5 rounded text-indigo-600"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Não cobrar frete (Frete Grátis com este cupom)
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Marcado: isenta 100% do frete ao aplicar o cupom. Desmarcado: cobra o frete normalmente.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchForm.allow_residual_balance}
                    onChange={(e) =>
                      setBatchForm({ ...batchForm, allow_residual_balance: e.target.checked })
                    }
                    className="mt-0.5 rounded text-indigo-600"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Gerar novo cupom se sobrar saldo
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Se a compra for menor que o cupom, cria um novo código com a diferença.
                    </span>
                  </div>
                </label>
              </div>

              {/* Lista Opcional de Beneficiários */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lista de CPFs / Beneficiários (Opcional — 1 por linha: <code>Nome;CPF;Email</code>)
                </label>
                <textarea
                  rows={3}
                  value={batchForm.employees_raw}
                  onChange={(e) => setBatchForm({ ...batchForm, employees_raw: e.target.value })}
                  placeholder={'João Silva;12345678901;joao@email.com\nMaria Souza;98765432100;maria@email.com'}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Gerando...' : 'Gerar Lote de Cupons'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CRIAR CUPOM INDIVIDUAL PRECISO                               */}
      {/* ===================================================================== */}
      {showSingleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Ticket className="w-4 h-4 text-indigo-600" />
                Criar Cupom de Desconto
              </h3>
              <button onClick={() => setShowSingleModal(false)} className="text-slate-400">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSingleCoupon} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código do Cupom (Em branco = automático)
                  </label>
                  <input
                    type="text"
                    value={singleForm.code}
                    onChange={(e) =>
                      setSingleForm({ ...singleForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="Ex: LEITURA100"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Limite de Usos *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    required
                    value={singleForm.max_uses}
                    onChange={(e) =>
                      setSingleForm({ ...singleForm, max_uses: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Desconto
                  </label>
                  <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSingleForm({ ...singleForm, discount_type: 'FIXED_BRL' })}
                      className={`flex-1 py-2 text-xs font-bold ${
                        singleForm.discount_type === 'FIXED_BRL'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      R$ (Valor)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSingleForm({
                          ...singleForm,
                          discount_type: 'PERCENTAGE',
                          initial_value: 15,
                        })
                      }
                      className={`flex-1 py-2 text-xs font-bold ${
                        singleForm.discount_type === 'PERCENTAGE'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600'
                      }`}
                    >
                      % (Percentual)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {singleForm.discount_type === 'PERCENTAGE'
                      ? 'Percentual de Desconto (%)'
                      : 'Valor do Cupom (R$)'}
                  </label>
                  <CurrencyInput
                    prefixStr={singleForm.discount_type === 'FIXED_BRL' ? 'R$ ' : ''}
                    suffixStr={singleForm.discount_type === 'PERCENTAGE' ? '%' : ''}
                    max={singleForm.discount_type === 'PERCENTAGE' ? 100 : undefined}
                    value={singleForm.initial_value}
                    onChangeValue={(val) => setSingleForm({ ...singleForm, initial_value: val })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Campanha / Nome (Opcional)
                  </label>
                  <input
                    type="text"
                    value={singleForm.assigned_name}
                    onChange={(e) => setSingleForm({ ...singleForm, assigned_name: e.target.value })}
                    placeholder="Ex: Campanha VIP"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Restringir a 1 CPF (Opcional)
                  </label>
                  <input
                    type="text"
                    value={singleForm.assigned_cpf}
                    onChange={(e) => setSingleForm({ ...singleForm, assigned_cpf: e.target.value })}
                    placeholder="Livre para vários CPFs"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Validade (Opcional)
                  </label>
                  <input
                    type="date"
                    value={singleForm.valid_until}
                    onChange={(e) => setSingleForm({ ...singleForm, valid_until: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={singleForm.allows_freight_discount}
                    onChange={(e) =>
                      setSingleForm({ ...singleForm, allows_freight_discount: e.target.checked })
                    }
                    className="rounded text-indigo-600"
                  />
                  Não cobrar frete (Frete Grátis automático ao aplicar este cupom)
                </label>

                {singleForm.discount_type === 'FIXED_BRL' && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={singleForm.allow_residual_balance}
                      onChange={(e) =>
                        setSingleForm({ ...singleForm, allow_residual_balance: e.target.checked })
                      }
                      className="rounded text-indigo-600"
                    />
                    Se sobrar valor na compra, gerar novo cupom automático com o saldo restante
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSingleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  {submitting ? 'Criando...' : 'Criar Cupom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
