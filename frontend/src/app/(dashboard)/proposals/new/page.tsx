"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';
import { 
  FileText, Search, ArrowLeft, Loader2, Minus, Plus, Trash2, ShoppingCart, 
  User, Building2, Inbox, Info, Save, Layers, HelpCircle, Calendar, PlusCircle
} from 'lucide-react';
import Link from 'next/link';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';

interface Customer {
  id: number;
  name: string;
  corporate_name: string;
  document: string;
  credit_limit?: number;
  discount?: number;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  whatsapp?: string;
  company_name?: string;
  source?: string | null;
}

interface Product {
  id: number | string;
  name: string;
  sku: string;
  price: number;
  stock?: number;
}

interface Service {
  id: number;
  name: string;
  description?: string;
  price?: number;
}

interface ProposalItem {
  id?: number;
  item_type: 'PRODUCT' | 'SERVICE';
  product_id?: number;
  service_id?: number;
  name: string;
  sku_code: string;
  quantity: number;
  unit_price: number;
  discount: number;
  custom_description?: string;
}

export default function NewOrEditProposalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editProposalId = searchParams?.get('proposal_id');

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [relationType, setRelationType] = useState<'CUSTOMER' | 'LEAD' | 'MANUAL'>('CUSTOMER');

  // Recipient selection states
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Manual Contact Fields
  const [manualName, setManualName] = useState('');
  const [manualDocument, setManualDocument] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');

  // User & Company details for Lead registration
  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  const [leadMode, setLeadMode] = useState<'SELECT' | 'NEW'>('SELECT');
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadWhatsapp, setNewLeadWhatsapp] = useState('');
  const [newLeadCompanyName, setNewLeadCompanyName] = useState('');
  const [newLeadRole, setNewLeadRole] = useState('');
  const [newLeadSource, setNewLeadSource] = useState('Manual');
  const [newLeadDescription, setNewLeadDescription] = useState('');
  const [newLeadAssignedTo, setNewLeadAssignedTo] = useState<number | ''>('');
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [customSources, setCustomSources] = useState<string[]>([]);

  // Cart / Items
  const [cart, setCart] = useState<ProposalItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [paymentCondition, setPaymentCondition] = useState('A Vista');
  const [notes, setNotes] = useState('');

  // Catalog search states
  const [itemTypeTab, setItemTypeTab] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Set default dates
  useEffect(() => {
    if (!editProposalId) {
      const today = new Date();
      const fifteenDaysLater = new Date();
      fifteenDaysLater.setDate(today.getDate() + 15);

      setValidFrom(today.toISOString().split('T')[0]);
      setValidUntil(fifteenDaysLater.toISOString().split('T')[0]);
    }
  }, [editProposalId]);

  // Load leads list if relationType === 'LEAD'
  useEffect(() => {
    if (relationType === 'LEAD' && leadsList.length === 0) {
      const fetchLeads = async () => {
        setLoadingLeads(true);
        try {
          const token = getToken();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const res = await fetch(`${apiUrl}/leads`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setLeadsList(data || []);
          }
        } catch (e) {
          console.error("Error fetching leads", e);
        } finally {
          setLoadingLeads(false);
        }
      };
      fetchLeads();
    }
  }, [relationType]);

  // Fetch company users for lead assignment
  useEffect(() => {
    if (companyId) {
      const fetchCompanyUsers = async () => {
        try {
          const token = getToken();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const res = await fetch(`${apiUrl}/companies/${companyId}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setCompanyUsers(data.items || []);
          }
        } catch (e) {
          console.error("Error fetching company users", e);
        }
      };
      fetchCompanyUsers();
    }
  }, [companyId]);

  // Set default assigned user once companyUsers loads
  useEffect(() => {
    if (currentUser?.id && companyUsers.length > 0) {
      const exists = companyUsers.some(u => u.id === currentUser.id);
      if (exists) {
        setNewLeadAssignedTo(currentUser.id);
      }
    }
  }, [companyUsers, currentUser?.id]);

  // Load proposal data if editing
  useEffect(() => {
    if (!editProposalId) return;

    const loadProposal = async () => {
      setLoadingInitial(true);
      try {
        const token = getToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiUrl}/proposals/${editProposalId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTitle(data.title);
          setValidFrom(data.valid_from);
          setValidUntil(data.valid_until);
          setRelationType(data.relation_type);
          
          if (data.relation_type === 'CUSTOMER') {
            // Will trigger autocomplete hydration from value
            setSelectedCustomer({
              id: data.customer_id,
              name: '',
              corporate_name: '',
              document: ''
            });
          } else if (data.relation_type === 'LEAD') {
            setSelectedLeadId(data.lead_id || '');
          } else {
            setManualName(data.manual_name || '');
            setManualDocument(data.manual_document || '');
            setManualEmail(data.manual_email || '');
            setManualPhone(data.manual_phone || '');
          }

          setGlobalDiscount(data.discount);
          setShippingCost(data.shipping_cost);
          setPaymentMethod(data.payment_method || 'PIX');
          setPaymentCondition(data.payment_condition || 'A Vista');
          setNotes(data.notes || '');

          // Hydrate cart items
          const items = (data.items || []).map((i: any) => ({
            id: i.id,
            item_type: i.item_type,
            product_id: i.product_id,
            service_id: i.service_id,
            name: i.item_type === 'PRODUCT' ? (i.product?.name || 'Produto') : (i.service?.name || 'Serviço'),
            sku_code: i.item_type === 'PRODUCT' ? (i.product?.sku || '') : 'Serviço',
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount: i.discount,
            custom_description: i.custom_description || ''
          }));
          setCart(items);
        }
      } catch (e) {
        console.error("Error loading proposal", e);
      } finally {
        setLoadingInitial(false);
      }
    };
    loadProposal();
  }, [editProposalId]);

  // Catalog search logic
  useEffect(() => {
    const searchCatalog = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      setLoadingSearch(true);
      try {
        const token = getToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        if (itemTypeTab === 'PRODUCT') {
          const url = new URL(`${apiUrl}/products/`);
          url.searchParams.append('search', searchQuery);
          // Standard admin mode allows search without customer_id
          url.searchParams.append('source', 'admin');
          url.searchParams.append('limit', '10');

          if (selectedCustomer) {
            url.searchParams.append('customer_id', String(selectedCustomer.id));
          }

          const res = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data.items || []);
          }
        } else {
          // Search Services
          const url = new URL(`${apiUrl}/services`);
          url.searchParams.append('search', searchQuery);
          url.searchParams.append('limit', '10');

          const res = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data.items || []);
          }
        }
      } catch (e) {
        console.error("Catalog search failed", e);
      } finally {
        setLoadingSearch(false);
      }
    };

    const delayDebounce = setTimeout(searchCatalog, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, itemTypeTab, selectedCustomer]);

  // Add Item to Cart
  const addItemToCart = (item: any) => {
    setCart(prev => {
      // Check duplicate
      const isProduct = itemTypeTab === 'PRODUCT';
      const exists = prev.find(i => 
        isProduct 
          ? (i.item_type === 'PRODUCT' && i.product_id === (item.original_id || item.id))
          : (i.item_type === 'SERVICE' && i.service_id === item.id)
      );

      if (exists) {
        return prev.map(i => {
          const match = isProduct 
            ? (i.item_type === 'PRODUCT' && i.product_id === (item.original_id || item.id))
            : (i.item_type === 'SERVICE' && i.service_id === item.id);
          return match ? { ...i, quantity: i.quantity + 1 } : i;
        });
      }

      const cartItem: ProposalItem = {
        item_type: isProduct ? 'PRODUCT' : 'SERVICE',
        product_id: isProduct ? (item.original_id || item.id) : undefined,
        service_id: isProduct ? undefined : item.id,
        name: item.name,
        sku_code: isProduct ? item.sku : 'SERVIÇO',
        quantity: 1,
        unit_price: isProduct ? (item.price || item.base_price || 0) : (item.base_value || 0),
        discount: 0,
        custom_description: isProduct ? '' : (item.default_description || '')
      };

      return [...prev, cartItem];
    });

    setSearchQuery('');
    setSearchResults([]);
  };

  // Cart operations
  const updateCartItem = (index: number, key: keyof ProposalItem, val: any) => {
    setCart(prev => prev.map((item, idx) => 
      idx === index ? { ...item, [key]: val } : item
    ));
  };

  const removeCartItem = (index: number) => {
    setCart(prev => prev.filter((_, idx) => idx !== index));
  };

  // Real-time subtotals
  const subtotal = cart.reduce((acc, item) => acc + ((item.unit_price * item.quantity) - item.discount), 0);
  const total = Math.max(0, subtotal - globalDiscount + shippingCost);

  // Form Submit
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return alert("O título/assunto é obrigatório.");
    if (cart.length === 0) return alert("Adicione pelo menos 1 item à proposta.");

    // Validation for recipient
    if (relationType === 'CUSTOMER' && !selectedCustomer) {
      return alert("Por favor, selecione um cliente da base.");
    }
    if (relationType === 'LEAD') {
      if (leadMode === 'SELECT' && !selectedLeadId) {
        return alert("Por favor, selecione um lead da lista.");
      }
      if (leadMode === 'NEW') {
        if (!newLeadName.trim()) {
          return alert("Por favor, preencha o nome do novo lead.");
        }
        if (!newLeadEmail.trim()) {
          return alert("Por favor, preencha o e-mail do novo lead.");
        }
      }
    }
    if (relationType === 'MANUAL' && !manualName.trim()) {
      return alert("Por favor, digite o nome do contato manual.");
    }

    setIsSubmitting(true);

    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      let finalLeadId = selectedLeadId;

      // Register new lead if leadMode is NEW
      if (relationType === 'LEAD' && leadMode === 'NEW') {
        const leadPayload = {
          name: newLeadName,
          email: newLeadEmail,
          whatsapp: newLeadWhatsapp || null,
          need_type: "Proposta/Orçamento",
          source: newLeadSource || null,
          company_name: newLeadCompanyName || null,
          role: newLeadRole || null,
          description: newLeadDescription || null,
          assigned_to: newLeadAssignedTo ? Number(newLeadAssignedTo) : null,
          status: "new"
        };

        const leadRes = await fetch(`${apiUrl}/leads/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(leadPayload)
        });

        if (!leadRes.ok) {
          const err = await leadRes.json();
          alert(`Erro ao criar lead: ${err.detail || 'Falha desconhecida'}`);
          setIsSubmitting(false);
          return;
        }

        const createdLead = await leadRes.json();
        finalLeadId = createdLead.id;

        // Associate with company
        if (companyId) {
          await fetch(`${apiUrl}/leads/${finalLeadId}/company`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ company_id: Number(companyId) })
          });
        }
      }

      const payload = {
        title,
        valid_from: validFrom,
        valid_until: validUntil,
        relation_type: relationType,
        customer_id: relationType === 'CUSTOMER' ? selectedCustomer?.id : null,
        lead_id: relationType === 'LEAD' ? finalLeadId : null,
        manual_name: relationType === 'MANUAL' ? manualName : null,
        manual_document: relationType === 'MANUAL' ? manualDocument : null,
        manual_email: relationType === 'MANUAL' ? manualEmail : null,
        manual_phone: relationType === 'MANUAL' ? manualPhone : null,
        discount: globalDiscount,
        shipping_cost: shippingCost,
        payment_method: paymentMethod,
        payment_condition: paymentCondition,
        notes: notes,
        items: cart.map(i => ({
          item_type: i.item_type,
          product_id: i.product_id,
          service_id: i.service_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          custom_description: i.custom_description || null
        }))
      };

      const endpoint = editProposalId 
        ? `${apiUrl}/proposals/${editProposalId}`
        : `${apiUrl}/proposals`;

      const method = editProposalId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        alert(editProposalId ? "Proposta atualizada com sucesso!" : "Proposta criada com sucesso!");
        router.push(`/proposals/${result.id}`);
      } else {
        const err = await res.json();
        alert(`Erro: ${err.detail || 'Falha ao salvar a proposta'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Falha de conexão com o servidor local.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary-base)]" />
        <p className="text-slate-500 text-sm">Carregando dados da proposta...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Title block */}
      <div className="flex items-center gap-4">
        <Link href="/proposals" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-[var(--color-primary-base)]" />
            {editProposalId ? 'Editar Proposta / Orçamento' : 'Criar Nova Proposta'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Preencha os termos comerciais e monte a proposta no carrinho reativo.</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Column: general info and destinatário */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* General settings */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="font-bold text-slate-800 dark:text-slate-200 text-lg flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <Layers className="w-5 h-5 text-[var(--color-primary-base)]" />
              1. Informações Básicas
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Título / Assunto da Proposta</label>
              <input
                type="text"
                placeholder="Ex: Proposta de Implantação e Licenciamento 2026"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Validade Início</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={validFrom}
                    onChange={e => setValidFrom(e.target.value)}
                    required
                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Validade Fim / Expira em</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    required
                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Recipient panel */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="font-bold text-slate-800 dark:text-slate-200 text-lg flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <User className="w-5 h-5 text-[var(--color-primary-base)]" />
              2. Destinatário
            </h2>

            {/* Selector tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl items-center border border-slate-200 dark:border-slate-800/80">
              {[
                { id: 'CUSTOMER', label: 'Cliente cadastrado', icon: Building2 },
                { id: 'LEAD', label: 'Lead Comercial', icon: Inbox },
                ...(relationType === 'MANUAL' ? [{ id: 'MANUAL', label: 'Contato Manual', icon: User }] : [])
              ].map(type => {
                const IconComp = type.icon;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setRelationType(type.id as any);
                      setSelectedCustomer(null);
                      setSelectedLeadId('');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                      relationType === type.id 
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <IconComp className="w-4 h-4" />
                    {type.label}
                  </button>
                );
              })}
            </div>

            {/* Recipient Conditional Render */}
            {relationType === 'CUSTOMER' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Buscar Cliente na base</label>
                <CustomerAutocomplete
                  value={selectedCustomer?.id || ""}
                  onChange={(id, cust) => setSelectedCustomer(cust as Customer)}
                  placeholder="Busque por razão social, nome fantasia ou CNPJ..."
                />
                {selectedCustomer && selectedCustomer.name && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/50 rounded-xl text-xs flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    <span>Vinculado a: <strong>{selectedCustomer.name}</strong> (CNPJ: {selectedCustomer.document})</span>
                  </div>
                )}
              </div>
            )}

            {relationType === 'LEAD' && (
              <div className="space-y-4">
                {/* Selector for lead mode */}
                <div className="flex gap-4 p-0.5 bg-slate-100 dark:bg-slate-950 rounded-xl w-fit border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setLeadMode('SELECT')}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      leadMode === 'SELECT'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Selecionar Lead Existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeadMode('NEW')}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      leadMode === 'NEW'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    Cadastrar Novo Lead
                  </button>
                </div>

                {leadMode === 'SELECT' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Selecionar Lead da Fila</label>
                    {loadingLeads ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-base)]"/> Carregando leads...</div>
                    ) : (
                      <select
                        value={selectedLeadId}
                        onChange={e => setSelectedLeadId(e.target.value)}
                        className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all dark:text-white"
                      >
                        <option value="">-- Selecione o Lead --</option>
                        {leadsList.map(ld => (
                          <option key={ld.id} value={ld.id}>
                            {ld.name} {ld.company_name ? `(${ld.company_name})` : ''} - {ld.email}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome do Contato <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          placeholder="Ex: Pedro de Souza"
                          value={newLeadName}
                          onChange={e => setNewLeadName(e.target.value)}
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">E-mail <span className="text-rose-500">*</span></label>
                        <input
                          type="email"
                          placeholder="pedro@empresa.com"
                          value={newLeadEmail}
                          onChange={e => setNewLeadEmail(e.target.value)}
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Celular / WhatsApp</label>
                        <input
                          type="text"
                          placeholder="(11) 99999-9999"
                          value={newLeadWhatsapp}
                          onChange={e => setNewLeadWhatsapp(e.target.value)}
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome da Empresa</label>
                        <input
                          type="text"
                          placeholder="Ex: Minha Empresa Ltda"
                          value={newLeadCompanyName}
                          onChange={e => setNewLeadCompanyName(e.target.value)}
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Cargo / Posição</label>
                        <input
                          type="text"
                          placeholder="Ex: Gerente, Diretor..."
                          value={newLeadRole}
                          onChange={e => setNewLeadRole(e.target.value)}
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Atribuído a</label>
                        <select
                          value={newLeadAssignedTo}
                          onChange={e => setNewLeadAssignedTo(e.target.value ? Number(e.target.value) : '')}
                          className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                        >
                          <option value="">-- Sem atribuição --</option>
                          {companyUsers.map(user => (
                            <option key={user.id} value={user.id}>
                              {user.name} ({user.type})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fonte da Captação</label>
                      <div className="flex gap-2">
                        <select
                          value={newLeadSource}
                          onChange={e => setNewLeadSource(e.target.value)}
                          className="flex-1 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                        >
                          {Array.from(new Set([
                            "Manual", "Indicação", "Prospecção Ativa", "Evento / Feira",
                            ...leadsList.map(l => l.source).filter((s): s is string => !!s),
                            ...customSources
                          ])).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const newSrc = window.prompt("Digite o nome da nova fonte:");
                            if (newSrc && newSrc.trim()) {
                              setCustomSources(prev => [...prev, newSrc.trim()]);
                              setNewLeadSource(newSrc.trim());
                            }
                          }}
                          className="px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 font-bold text-sm rounded-xl transition-colors flex items-center justify-center shadow-sm"
                          title="Criar nova Fonte de Captação"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observações / Histórico Inicial</label>
                      <textarea
                        value={newLeadDescription}
                        onChange={e => setNewLeadDescription(e.target.value)}
                        rows={3}
                        placeholder="Ex: Detalhes do briefing inicial ou notas sobre o lead..."
                        className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white resize-none shadow-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {relationType === 'MANUAL' && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome Completo / Razão Social</label>
                    <input
                      type="text"
                      placeholder="Ex: João da Silva / Licivan Tec Ltda"
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">CNPJ / CPF</label>
                    <input
                      type="text"
                      placeholder="Somente números"
                      value={manualDocument}
                      onChange={e => setManualDocument(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email de Contato</label>
                    <input
                      type="email"
                      placeholder="exemplo@gmail.com"
                      value={manualEmail}
                      onChange={e => setManualEmail(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="(11) 99999-9999"
                      value={manualPhone}
                      onChange={e => setManualPhone(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <h2 className="font-bold text-slate-800 dark:text-slate-200 text-lg flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <ShoppingCart className="w-5 h-5 text-[var(--color-primary-base)]" />
              3. Itens Propostos (Produtos / Serviços)
            </h2>

            {/* Catalog search tabs */}
            <div className="flex gap-4 items-center">
              <button
                type="button"
                onClick={() => { setItemTypeTab('PRODUCT'); setSearchQuery(''); setSearchResults([]); }}
                className={`text-sm font-bold pb-2 transition-colors border-b-2 ${itemTypeTab === 'PRODUCT' ? 'border-[var(--color-primary-base)] text-slate-900 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Buscar Produtos
              </button>
              <button
                type="button"
                onClick={() => { setItemTypeTab('SERVICE'); setSearchQuery(''); setSearchResults([]); }}
                className={`text-sm font-bold pb-2 transition-colors border-b-2 ${itemTypeTab === 'SERVICE' ? 'border-[var(--color-primary-base)] text-slate-900 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Buscar Serviços
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={itemTypeTab === 'PRODUCT' ? 'Buscar produto por SKU ou nome...' : 'Buscar serviço no catálogo...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:text-white"
              />
              {loadingSearch && <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-base)] absolute right-3 top-1/2 -translate-y-1/2" />}

              {searchQuery.trim() !== '' && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto p-2 space-y-1">
                  {searchResults.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItemToCart(item)}
                      className="w-full text-left p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg flex justify-between items-center transition-colors text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</span>
                        {itemTypeTab === 'PRODUCT' && <span className="text-xs text-slate-400 font-mono">SKU: {item.sku}</span>}
                      </div>
                      <span className="font-bold text-[var(--color-primary-base)]">
                        R$ {(item.price || item.base_price || item.standard_price || item.base_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Table */}
            {cart.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                      <th className="px-4 py-2">Item</th>
                      <th className="px-4 py-2 text-right">Unitário (R$)</th>
                      <th className="px-4 py-2 text-center w-24">Qtd</th>
                      <th className="px-4 py-2 text-right">Desc. Item (R$)</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {cart.map((item, idx) => {
                      const itemTotal = (item.unit_price * item.quantity) - item.discount;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="px-4 py-3">
                            <div className="flex flex-col max-w-[220px]">
                              <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{item.name}</span>
                              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider w-fit mt-1">
                                {item.item_type === 'PRODUCT' ? `Prod / SKU: ${item.sku_code}` : 'Serviço'}
                              </span>
                              {/* Custom description scope */}
                              <textarea
                                placeholder="Notas ou escopo adicional do item..."
                                value={item.custom_description || ''}
                                onChange={e => updateCartItem(idx, 'custom_description', e.target.value)}
                                rows={2}
                                className="mt-2 text-xs border border-slate-200 dark:border-slate-800 rounded p-1 bg-slate-50 dark:bg-slate-950 outline-none focus:border-[var(--color-primary-base)] focus:ring-1 focus:ring-[var(--color-primary-base)] w-full resize-y font-normal"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price}
                              onChange={e => updateCartItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-20 text-right bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[var(--color-primary-base)]"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateCartItem(idx, 'quantity', Math.max(1, item.quantity - 1))}
                                className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => updateCartItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-12 text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-1 py-0.5 text-sm focus:ring-1 focus:ring-[var(--color-primary-base)] font-bold outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => updateCartItem(idx, 'quantity', item.quantity + 1)}
                                className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.discount}
                              onChange={e => updateCartItem(idx, 'discount', Math.min(item.unit_price * item.quantity, parseFloat(e.target.value) || 0))}
                              className="w-16 text-right bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-[var(--color-primary-base)] text-rose-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-200">
                            R$ {itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeCartItem(idx)}
                              className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-400 flex flex-col items-center gap-2">
                <PlusCircle className="w-8 h-8 text-slate-300" />
                <p className="text-sm">O carrinho da proposta está vazio.</p>
                <p className="text-xs">Busque produtos ou serviços no painel acima para adicioná-los.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Conditions, Totals & Actions */}
        <div className="space-y-6">
          
          {/* Payment Terms Panel */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider pb-2 border-b border-slate-200 dark:border-slate-800">
              Condições de Fechamento
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Método de Pagamento</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-[var(--color-primary-base)]"
              >
                <option value="PIX">Pix Transferência</option>
                <option value="BOLETO">Boleto Bancário</option>
                <option value="CREDIT_CARD">Cartão de Crédito</option>
                <option value="DEPOSIT">Depósito em Conta</option>
                <option value="OUTRO">Outras Negociações</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Condição de Parcelamento</label>
              <input
                type="text"
                placeholder="Ex: A vista, 30 DDL, 30/60/90 parcelado"
                value={paymentCondition}
                onChange={e => setPaymentCondition(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-[var(--color-primary-base)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observações Internas / Termos</label>
              <textarea
                rows={3}
                placeholder="Notas que constam nos rodapés do orçamento..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 outline-none focus:ring-1 focus:ring-[var(--color-primary-base)] resize-none"
              />
            </div>
          </div>

          {/* Totals Panel */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider pb-2 border-b border-slate-200 dark:border-slate-800">
              Resumo Financeiro
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>Subtotal Itens</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 mb-1">
                  <span>Desconto Global (R$)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={globalDiscount}
                    onChange={e => setGlobalDiscount(Math.min(subtotal, parseFloat(e.target.value) || 0))}
                    className="w-24 text-right bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-sm focus:ring-1 focus:ring-[var(--color-primary-base)] text-rose-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 mb-1">
                  <span>Valor do Frete (R$)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shippingCost}
                    onChange={e => setShippingCost(parseFloat(e.target.value) || 0)}
                    className="w-24 text-right bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-sm focus:ring-1 focus:ring-[var(--color-primary-base)] font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center text-base font-black pt-3 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-800 dark:text-slate-200">Total Proposto</span>
                <span className="text-[var(--color-primary-base)] text-lg">
                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || cart.length === 0}
              className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Salvando Proposta...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Salvar Proposta</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
