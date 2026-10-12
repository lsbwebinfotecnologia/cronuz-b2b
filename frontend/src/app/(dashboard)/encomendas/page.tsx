'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  Truck,
  MessageCircle,
  AlertTriangle,
  BookOpen,
  X,
  Loader2,
  Check,
  ChevronDown,
  ChevronRight,
  Store,
  User,
  Phone,
  MapPin,
  ExternalLink,
  Info,
  ShoppingBag,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

type BackorderStatus =
  | 'ALL'
  | 'PENDING'
  | 'GROUPED'
  | 'ORDER_PLACED'
  | 'RECEIVED'
  | 'NOTIFIED'
  | 'COMPLETED'
  | 'CANCELLED';

interface CustomerBrief {
  id: number;
  name: string;
  document: string;
  phone?: string | null;
  email?: string | null;
}

interface BackorderItem {
  id: number;
  company_id: number;
  customer_id?: number | null;
  customer?: CustomerBrief | null;
  isbn: string;
  title: string;
  publisher?: string | null;
  author?: string | null;
  quantity: number;
  cover_url?: string | null;
  price_estimated?: number | null;
  status: string;
  origin: string;
  has_erp_registration: boolean;
  horus_cod_item?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CustomerEncomendaItem {
  id: number;
  isbn: string;
  title: string;
  publisher?: string | null;
  author?: string | null;
  cover_url?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
}

export interface CustomerEncomenda {
  id: number;
  company_id: number;
  encomenda_number: string;
  customer_id?: number | null;
  customer_name: string;
  customer_document?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  delivery_type: string;
  pickup_branch_name?: string | null;
  shipping_street?: string | null;
  shipping_number?: string | null;
  shipping_complement?: string | null;
  shipping_neighborhood?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_zip_code?: string | null;
  status: string;
  total_items: number;
  total_amount: number;
  notes?: string | null;
  created_at: string;
  items: CustomerEncomendaItem[];
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: React.ElementType }
> = {
  PENDING: {
    label: 'Pendente',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    icon: Clock,
  },
  GROUPED: {
    label: 'Agrupada em Pedido',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    icon: Package,
  },
  ORDER_PLACED: {
    label: 'Pedido Enviado',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
    icon: Truck,
  },
  RECEIVED: {
    label: 'Recebida no Estoque',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300 dark:border-teal-800',
    icon: CheckCircle2,
  },
  NOTIFIED: {
    label: 'Cliente Avisado',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    icon: MessageCircle,
  },
  COMPLETED: {
    label: 'Entregue / Concluída',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    icon: Check,
  },
  CANCELLED: {
    label: 'Cancelada',
    badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    icon: X,
  },
};

export default function EncomendasPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BackorderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Filtros
  const [selectedStatus, setSelectedStatus] = useState<BackorderStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Métricas
  const [metrics, setMetrics] = useState({
    total: 0,
    pending: 0,
    grouped: 0,
    received: 0,
    notified: 0,
    completed: 0,
  });

  // Modal Nova Encomenda
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newIsbn, setNewIsbn] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPublisher, setNewPublisher] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newNotes, setNewNotes] = useState('');
  const [newCustomerDoc, setNewCustomerDoc] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [lookingUpCustomer, setLookingUpCustomer] = useState(false);
  const [lookingUpWeb, setLookingUpWeb] = useState(false);
  const [isModuleDisabled, setIsModuleDisabled] = useState(false);

  // Visão em Abas: Encomendas do Cliente vs Suprimentos/Itens
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'ITEMS'>('ORDERS');
  const [customerOrders, setCustomerOrders] = useState<CustomerEncomenda[]>([]);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<number[]>([]);

  // Status Change State
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Carrega métricas
  const fetchMetrics = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/backorders/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      } else if (res.status === 403) {
        setIsModuleDisabled(true);
      }
    } catch {}
  }, [apiUrl]);

  // Carrega encomendas de clientes (pedidos multi-título)
  const fetchCustomerOrders = useCallback(async () => {
    setCustomerOrdersLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (selectedStatus !== 'ALL') {
        params.append('status', selectedStatus);
      }
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim());
      }
      const res = await fetch(`${apiUrl}/encomendas?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerOrders(Array.isArray(data) ? data : (data.items || []));
      } else if (res.status === 403) {
        setIsModuleDisabled(true);
      }
    } catch {
      // silencioso
    } finally {
      setCustomerOrdersLoading(false);
    }
  }, [apiUrl, selectedStatus, searchQuery]);

  // Carrega listagem de itens avulsos / suprimentos
  const fetchBackorders = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (selectedStatus !== 'ALL') {
        params.append('status', selectedStatus);
      }
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim());
      }

      const res = await fetch(`${apiUrl}/backorders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
      } else if (res.status === 403) {
        setIsModuleDisabled(true);
      } else {
        toast.error('Erro ao carregar lista de encomendas.');
      }
    } catch {
      toast.error('Falha de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, page, pageSize, selectedStatus, searchQuery]);

  useEffect(() => {
    fetchMetrics();
    if (activeTab === 'ORDERS') {
      fetchCustomerOrders();
    } else {
      fetchBackorders();
    }
  }, [fetchMetrics, fetchCustomerOrders, fetchBackorders, activeTab]);

  const handleUpdateCustomerOrderStatus = async (id: number, newStatus: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/encomendas/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Status atualizado para ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
        fetchCustomerOrders();
        fetchMetrics();
      } else {
        toast.error('Erro ao atualizar status.');
      }
    } catch {
      toast.error('Falha de conexão.');
    }
  };

  const toggleExpandOrder = (id: number) => {
    setExpandedOrderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const buildCustomerOrderWhatsAppLink = (order: CustomerEncomenda) => {
    const rawPhone = (order.customer_phone || '').replace(/\D/g, '');
    if (!rawPhone) return null;
    const phoneWithCountry = rawPhone.length <= 11 ? `55${rawPhone}` : rawPhone;
    const clientName = order.customer_name || 'Cliente';
    const booksList = (order.items || []).map(it => `• ${it.title} (${it.quantity} un)`).join('\n');
    const msg = encodeURIComponent(
      `Olá, ${clientName}! Informamos que os livros da sua encomenda ${order.encomenda_number} já chegaram na livraria:\n\n${booksList}\n\nVocê já pode passar para retirar ou aguardar a entrega!`
    );
    return `https://wa.me/${phoneWithCountry}?text=${msg}`;
  };

  // Atualizar status da encomenda
  const handleUpdateStatus = async (id: number, newStatus: string) => {
    setUpdatingId(id);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/backorders/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Status atualizado para ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
        fetchBackorders();
        fetchMetrics();
      } else {
        toast.error('Erro ao atualizar status.');
      }
    } catch {
      toast.error('Falha de conexão.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Busca cliente por CPF/CNPJ digitado no modal para não duplicar
  const handleCustomerBlur = async () => {
    const rawDoc = newCustomerDoc.replace(/\D/g, '');
    if (rawDoc.length < 11) return;

    setLookingUpCustomer(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/customers/search?q=${rawDoc}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const found = Array.isArray(data) ? data[0] : (data.items ? data.items[0] : null);
        if (found) {
          setNewCustomerName(found.name || found.trade_name || '');
          setNewCustomerPhone(found.phone || found.mobile_phone || '');
          setNewCustomerEmail(found.email || '');
          toast.info(`Cliente localizado: ${found.name || found.trade_name}`);
        }
      }
    } catch {}
    finally {
      setLookingUpCustomer(false);
    }
  };

  // Busca livro na internet se informar ISBN no modal
  const handleLookupIsbn = async () => {
    const cleanIsbn = newIsbn.replace(/[^0-9X]/gi, '');
    if (cleanIsbn.length < 9) {
      toast.warning('Informe um ISBN válido para busca.');
      return;
    }
    setLookingUpWeb(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/product-search/external-lookup?term=${encodeURIComponent(cleanIsbn)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.data) {
          const b = data.data;
          if (b.title) setNewTitle(b.title);
          if (b.authors) setNewAuthor(b.authors);
          if (b.publisher) setNewPublisher(b.publisher);
          if (b.estimated_price) setNewPrice(String(b.estimated_price));
          toast.success('Metadados da obra localizados via API externa!');
        } else {
          toast.info('Não foi possível encontrar dados automáticos para este ISBN.');
        }
      }
    } catch {
      toast.error('Erro ao consultar metadados na internet.');
    } finally {
      setLookingUpWeb(false);
    }
  };

  // Salvar nova encomenda manual
  const handleCreateBackorder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIsbn.trim() || !newTitle.trim()) {
      toast.warning('ISBN e Título são obrigatórios.');
      return;
    }

    setSubmitting(true);
    try {
      const token = getToken();
      const payload = {
        isbn: newIsbn.trim(),
        title: newTitle.trim(),
        publisher: newPublisher.trim() || null,
        author: newAuthor.trim() || null,
        quantity: Number(newQty) || 1,
        price_estimated: newPrice ? parseFloat(newPrice.replace(',', '.')) : 0.0,
        origin: 'MANUAL',
        has_erp_registration: false,
        notes: newNotes.trim() || null,
        customer_document: newCustomerDoc.replace(/\D/g, '') || null,
        customer_name: newCustomerName.trim() || null,
        customer_phone: newCustomerPhone.trim() || null,
        customer_email: newCustomerEmail.trim() || null,
      };

      const res = await fetch(`${apiUrl}/backorders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('Encomenda criada com sucesso!');
        setIsModalOpen(false);
        setNewIsbn('');
        setNewTitle('');
        setNewPublisher('');
        setNewAuthor('');
        setNewPrice('');
        setNewQty(1);
        setNewNotes('');
        setNewCustomerDoc('');
        setNewCustomerName('');
        setNewCustomerPhone('');
        setNewCustomerEmail('');
        fetchBackorders();
        fetchMetrics();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao criar encomenda.');
      }
    } catch {
      toast.error('Falha de conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  // Formata link de WhatsApp para avisar cliente
  const buildWhatsAppLink = (item: BackorderItem) => {
    const rawPhone = (item.customer?.phone || '').replace(/\D/g, '');
    if (!rawPhone) return null;
    const phoneWithCountry = rawPhone.length <= 11 ? `55${rawPhone}` : rawPhone;
    const clientName = item.customer?.name || 'Cliente';
    const msg = encodeURIComponent(
      `Olá, ${clientName}! Informamos que seu livro encomendado "${item.title}" (ISBN: ${item.isbn}) já chegou em nossa loja e está disponível para retirada!`
    );
    return `https://wa.me/${phoneWithCountry}?text=${msg}`;
  };

  if (isModuleDisabled) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
          <Package className="w-8 h-8" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Módulo Encomendas Não Habilitado
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O recurso de encomendas sob demanda integrada ao Busca Preço e ERP ainda não está habilitado para a sua empresa.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Entre em contato com o administrador Master para solicitar a ativação deste módulo.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/product-search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-sm font-semibold transition-all shadow-sm"
          >
            Ir para Busca Preço
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── HEADER DA PÁGINA (MOBILE-FIRST) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Package className="w-7 h-7 text-[#00b4b4]" />
            Gestão de Encomendas
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Controle de pedidos sob demanda abertos pelo Busca Preço, loja ou balcão de atendimento.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00b4b4] hover:bg-[#009999] text-white text-sm font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nova Encomenda
          </button>
        </div>
      </div>

      {/* ── CARDS DE MÉTRICAS (GRID RESPONSIVO) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div
          onClick={() => setSelectedStatus('ALL')}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            selectedStatus === 'ALL'
              ? 'border-[#00b4b4] bg-[#00b4b4]/10 shadow-sm ring-1 ring-[#00b4b4]'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total</span>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
            {metrics.total}
          </p>
        </div>

        <div
          onClick={() => setSelectedStatus('PENDING')}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            selectedStatus === 'PENDING'
              ? 'border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pendentes
          </span>
          <p className="text-xl sm:text-2xl font-black text-amber-600 mt-1">
            {metrics.pending}
          </p>
        </div>

        <div
          onClick={() => setSelectedStatus('GROUPED')}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            selectedStatus === 'GROUPED'
              ? 'border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1">
            <Package className="w-3 h-3" /> Em Pedido
          </span>
          <p className="text-xl sm:text-2xl font-black text-blue-600 mt-1">
            {metrics.grouped}
          </p>
        </div>

        <div
          onClick={() => setSelectedStatus('RECEIVED')}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            selectedStatus === 'RECEIVED'
              ? 'border-teal-500 bg-teal-500/10 shadow-sm ring-1 ring-teal-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> No Estoque
          </span>
          <p className="text-xl sm:text-2xl font-black text-teal-600 mt-1">
            {metrics.received}
          </p>
        </div>

        <div
          onClick={() => setSelectedStatus('NOTIFIED')}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            selectedStatus === 'NOTIFIED'
              ? 'border-purple-500 bg-purple-500/10 shadow-sm ring-1 ring-purple-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-purple-600 uppercase tracking-wider flex items-center gap-1">
            <MessageCircle className="w-3 h-3" /> Avisadas
          </span>
          <p className="text-xl sm:text-2xl font-black text-purple-600 mt-1">
            {metrics.notified}
          </p>
        </div>

        <div
          onClick={() => setSelectedStatus('COMPLETED')}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            selectedStatus === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
            <Check className="w-3 h-3" /> Entregues
          </span>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-1">
            {metrics.completed}
          </p>
        </div>
      </div>

      {/* ── ALERTA DE EXPERIÊNCIA DO OPERADOR: DIFERENCIAÇÃO CLARA ── */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 text-sky-950 dark:text-sky-200 text-xs">
        <Info className="w-5 h-5 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm text-sky-900 dark:text-sky-100">
            Diferenciação Operacional: Encomenda do Cliente vs. Compra com Fornecedor
          </p>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            • <strong>Encomenda do Cliente (Balcão / Busca Preço):</strong> Pedido solicitado pelo consumidor final, contendo múltiplos livros, dados de contato e entrega (retirada no balcão ou entrega em endereço).
            <br />
            • <strong>Compra com Fornecedor (Suprimentos):</strong> Abastecimento dos livros pendentes via integração Hórus ou Bookinfo com as editoras/distribuidoras parceiras.
          </p>
        </div>
      </div>

      {/* ── SELETOR DE VISÃO (ABAS) ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('ORDERS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeTab === 'ORDERS'
              ? 'bg-[#00b4b4] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Encomendas de Clientes ({customerOrders.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ITEMS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeTab === 'ITEMS'
              ? 'bg-[#00b4b4] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          Itens / Suprimentos Individuais ({total})
        </button>
      </div>

      {/* ── BARRA DE PESQUISA E FILTROS ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (activeTab === 'ORDERS') fetchCustomerOrders();
                else fetchBackorders();
              }
            }}
            placeholder={
              activeTab === 'ORDERS'
                ? 'Buscar por número (#ENC...), cliente, CPF ou telefone...'
                : 'Buscar por ISBN, título do livro, CPF ou nome do cliente...'
            }
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
          />
        </div>

        <button
          onClick={() => {
            if (activeTab === 'ORDERS') fetchCustomerOrders();
            else fetchBackorders();
          }}
          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors cursor-pointer"
        >
          Filtrar
        </button>
      </div>

      {/* ── CONTEÚDO PRINCIPAL CONFORME A ABA ATIVA ── */}
      {activeTab === 'ORDERS' ? (
        <div className="space-y-4">
          {customerOrdersLoading ? (
            <div className="p-12 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#00b4b4]" />
              Carregando pedidos de encomendas dos clientes...
            </div>
          ) : customerOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <ShoppingBag className="w-10 h-10 opacity-30 mx-auto" />
              <p className="text-sm font-medium">Nenhuma encomenda de cliente registrada no momento.</p>
              <p className="text-xs text-slate-400">
                Você pode abrir encomendas com múltiplos títulos diretamente no <strong>Busca Preço</strong>.
              </p>
              <div className="pt-2">
                <Link
                  href="/product-search"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00b4b4] hover:bg-[#009999] text-white text-xs font-semibold shadow-xs"
                >
                  <Search className="w-3.5 h-3.5" />
                  Ir para Busca Preço
                </Link>
              </div>
            </div>
          ) : (
            customerOrders.map((order) => {
              const isExpanded = expandedOrderIds.includes(order.id);
              const statusConf = STATUS_CONFIG[order.status] || {
                label: order.status,
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
                icon: Clock,
              };
              const StatusIcon = statusConf.icon;
              const waLink = buildCustomerOrderWhatsAppLink(order);

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all"
                >
                  {/* Cabeçalho do Pedido da Encomenda */}
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#00b4b4]/10 text-[#00b4b4] flex items-center justify-center font-bold text-sm shrink-0">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {order.encomenda_number}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusConf.badgeClass}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusConf.label}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded-md">
                            {order.delivery_type === 'STORE_PICKUP' ? (
                              <>
                                <Store className="w-3 h-3 text-slate-600 dark:text-slate-300" />
                                Retirada Balcão: {order.pickup_branch_name || 'Loja'}
                              </>
                            ) : (
                              <>
                                <Truck className="w-3 h-3 text-slate-600 dark:text-slate-300" />
                                Entrega no Endereço
                              </>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Aberto em {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Dados do Cliente e Ação WhatsApp */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center lg:justify-end gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {order.customer_name}
                        </p>
                        <p className="text-[11px] text-slate-500 flex items-center lg:justify-end gap-1.5 font-mono">
                          {order.customer_document && <span>Doc: {order.customer_document}</span>}
                          {order.customer_phone && <span>• Tel: {order.customer_phone}</span>}
                        </p>
                      </div>

                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                          title="Enviar mensagem WhatsApp ao cliente"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Avisar no WhatsApp
                        </a>
                      )}

                      {/* Select de Status da Encomenda */}
                      <select
                        value={order.status}
                        onChange={(e) => handleUpdateCustomerOrderStatus(order.id, e.target.value)}
                        className="text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-3 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]"
                      >
                        <option value="PENDING">Pendente</option>
                        <option value="GROUPED">Agrupada em Pedido</option>
                        <option value="ORDER_PLACED">Pedido Enviado ao Fornecedor</option>
                        <option value="RECEIVED">Recebido na Loja</option>
                        <option value="NOTIFIED">Cliente Avisado</option>
                        <option value="COMPLETED">Entregue ao Cliente</option>
                        <option value="CANCELLED">Cancelada</option>
                      </select>
                    </div>
                  </div>

                  {/* Resumo e Botão de Expandir Itens */}
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {order.total_items} título(s) encomendado(s)
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        Total: R$ {Number(order.total_amount || 0).toFixed(2).replace('.', ',')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpandOrder(order.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00b4b4] hover:text-[#009999] cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronDown className="w-4 h-4" /> Ocultar Títulos
                        </>
                      ) : (
                        <>
                          <ChevronRight className="w-4 h-4" /> Ver Títulos Encomendados ({order.items?.length || 0})
                        </>
                      )}
                    </button>
                  </div>

                  {/* Lista Expandida de Livros do Pedido */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/40 p-4 space-y-3">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Livros Solicitados pelo Cliente nesta Encomenda
                      </h4>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                        {(order.items || []).map((item) => (
                          <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3 min-w-0">
                              {item.cover_url ? (
                                <img
                                  src={item.cover_url}
                                  alt=""
                                  className="w-9 h-12 object-contain rounded bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700"
                                />
                              ) : (
                                <div className="w-9 h-12 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                  <BookOpen className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                  {item.title}
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono">
                                  ISBN: {item.isbn} {item.publisher ? `• Editora: ${item.publisher}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0 text-right">
                              <div>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {item.quantity} un
                                </span>
                                <span className="text-[11px] text-slate-400 block font-mono">
                                  x R$ {Number(item.unit_price).toFixed(2).replace('.', ',')}
                                </span>
                              </div>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono min-w-[70px] text-right">
                                R$ {Number(item.total_price).toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300">
                          <strong>Observações do Cliente / Atendimento:</strong> {order.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ── TABELA DE ITENS E SUPRIMENTOS (MOBILE-FIRST COM OVERFLOW RESPONSIVO) ── */
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 uppercase font-semibold">
              <tr>
                <th className="px-4 py-3.5">Obra / Livro</th>
                <th className="px-4 py-3.5">Cliente</th>
                <th className="px-4 py-3.5 text-center">Qtd</th>
                <th className="px-4 py-3.5">Origem / Catálogo</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Data</th>
                <th className="px-4 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#00b4b4]" />
                    Carregando encomendas...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 opacity-40 mx-auto mb-2" />
                    Nenhuma encomenda encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const statusConf = STATUS_CONFIG[item.status] || {
                    label: item.status,
                    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
                    icon: Clock,
                  };
                  const StatusIcon = statusConf.icon;
                  const waLink = buildWhatsAppLink(item);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Obra */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {item.cover_url ? (
                            <img
                              src={item.cover_url}
                              alt=""
                              className="w-10 h-14 object-contain rounded bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-10 h-14 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                              <BookOpen className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0 max-w-xs sm:max-w-sm">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              <span className="font-mono">{item.isbn}</span>
                              {item.publisher && <span>• {item.publisher}</span>}
                            </div>
                            {item.notes && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 line-clamp-1 italic">
                                Nota: {item.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-3.5">
                        {item.customer ? (
                          <div>
                            <p className="font-medium text-slate-800 dark:text-slate-200">
                              {item.customer.name}
                            </p>
                            <p className="text-xs font-mono text-slate-400">
                              CPF: {item.customer.document}
                            </p>
                            {item.customer.phone && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-slate-500">{item.customer.phone}</span>
                                {waLink && (
                                  <a
                                    href={waLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Notificar cliente via WhatsApp"
                                    className="p-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 transition-colors"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sem cliente vinculado</span>
                        )}
                      </td>

                      {/* Qtd */}
                      <td className="px-4 py-3.5 text-center font-bold text-slate-800 dark:text-slate-200">
                        {item.quantity} un
                      </td>

                      {/* Catálogo / Origem */}
                      <td className="px-4 py-3.5">
                        {item.has_erp_registration ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            ERP Hórus #{item.horus_cod_item || ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Cadastrado apenas no Cronuz. Não existe ainda no Horus!">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            Apenas Cronuz
                          </span>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                          Via {item.origin}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusConf.badgeClass}`}
                        >
                          <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                          {statusConf.label}
                        </span>
                      </td>

                      {/* Data */}
                      <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '—'}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.status === 'PENDING' || item.status === 'ORDER_PLACED' ? (
                            <button
                              onClick={() => handleUpdateStatus(item.id, 'RECEIVED')}
                              disabled={updatingId === item.id}
                              title="Marcar como Recebido no Estoque"
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
                            >
                              Receber
                            </button>
                          ) : null}

                          {item.status === 'RECEIVED' ? (
                            <button
                              onClick={() => {
                                handleUpdateStatus(item.id, 'NOTIFIED');
                                if (waLink) window.open(waLink, '_blank');
                              }}
                              disabled={updatingId === item.id}
                              title="Avisar cliente da chegada"
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <MessageCircle className="w-3 h-3" />
                              Avisar
                            </button>
                          ) : null}

                          {item.status === 'NOTIFIED' ? (
                            <button
                              onClick={() => handleUpdateStatus(item.id, 'COMPLETED')}
                              disabled={updatingId === item.id}
                              title="Marcar como Entregue ao Cliente"
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                            >
                              Entregar
                            </button>
                          ) : null}

                          <select
                            value={item.status}
                            onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                            disabled={updatingId === item.id}
                            className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 px-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#00b4b4]"
                          >
                            <option value="PENDING">Pendente</option>
                            <option value="GROUPED">Agrupada</option>
                            <option value="ORDER_PLACED">Pedido Enviado</option>
                            <option value="RECEIVED">Recebida</option>
                            <option value="NOTIFIED">Cliente Avisado</option>
                            <option value="COMPLETED">Entregue</option>
                            <option value="CANCELLED">Cancelada</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* ── MODAL NOVA ENCOMENDA MANUAL ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#00b4b4]" />
                Nova Encomenda de Livro
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBackorder} className="space-y-4">
              {/* Dados do Livro */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  1. Dados da Obra / Livro
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      ISBN / Código de Barras *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newIsbn}
                        onChange={(e) => setNewIsbn(e.target.value)}
                        placeholder="Ex: 9788543112596"
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                      />
                      <button
                        type="button"
                        onClick={handleLookupIsbn}
                        disabled={lookingUpWeb}
                        className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold shrink-0 cursor-pointer"
                        title="Buscar dados na internet"
                      >
                        {lookingUpWeb ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Autocompletar'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Quantidade *
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={newQty}
                      onChange={(e) => setNewQty(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Título do Livro *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Título da obra"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Editora
                    </label>
                    <input
                      type="text"
                      value={newPublisher}
                      onChange={(e) => setNewPublisher(e.target.value)}
                      placeholder="Editora"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Autor
                    </label>
                    <input
                      type="text"
                      value={newAuthor}
                      onChange={(e) => setNewAuthor(e.target.value)}
                      placeholder="Autor"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Preço de Capa (R$)
                    </label>
                    <input
                      type="text"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                  </div>
                </div>
              </div>

              {/* Dados do Cliente */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  2. Dados do Cliente Solicitante
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      CPF ou CNPJ
                    </label>
                    <input
                      type="text"
                      value={newCustomerDoc}
                      onChange={(e) => setNewCustomerDoc(e.target.value)}
                      onBlur={handleCustomerBlur}
                      placeholder="Somente dígitos"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                    {lookingUpCustomer && (
                      <span className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Verificando cadastro...
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Cliente
                    </label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      WhatsApp / Celular
                    </label>
                    <input
                      type="text"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      placeholder="(DD) 99999-9999"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                      placeholder="cliente@email.com"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Observações Internas
                  </label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Instruções para a equipe de compras ou aviso ao cliente..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-[#00b4b4] hover:bg-[#009999] text-white shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Cadastrar Encomenda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

