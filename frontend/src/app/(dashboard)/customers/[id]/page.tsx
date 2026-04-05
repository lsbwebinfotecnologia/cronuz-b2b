'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Building2, MapPin, Users, ShoppingCart, MessageSquare, StickyNote, Mail, Phone, ExternalLink, Plus, X, RefreshCw, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';

export default function CustomerDetailsPage() {
  const params = useParams();
  const customerId = params.id as string;
  const router = useRouter();
  const user = getUser();

  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'interactions' | 'orders' | 'contacts'>('overview');
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Edit states for Financial Overview
  const [editingFinance, setEditingFinance] = useState(false);
  const [newLimit, setNewLimit] = useState(0);
  const [newDiscount, setNewDiscount] = useState(0);

  // General Edit Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    corporate_name: '',
    email: '',
    phone: '',
    document: '',
    state_registration: '',
    default_payment_method: 'ERP_STANDARD'
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Contacts States
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', role: '' });
  const [savingContact, setSavingContact] = useState(false);

  // B2B Auth States
  const [customerUser, setCustomerUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'create' | 'edit'>('create');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [savingAuth, setSavingAuth] = useState(false);

  // CRM Timeline states
  const [interactionContent, setInteractionContent] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [syncingHorus, setSyncingHorus] = useState(false);

  useEffect(() => {
    fetchCustomer();
    fetchCustomerOrders();
  }, [customerId]);

  async function fetchCustomerOrders() {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders?customer_id=${customerId}&limit=5`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const docs = data.orders || data.items || data.data || [];
        // orders backend usually returns list directly if it's not paginated, let's assume it returns a list or standard fastApi pagination
        // the endpoint /orders returns dict! Let's check how the frontend processes /orders. Wait, it usually returns {items: [], total: x} or [{...}].
        // Actually, let's just grab the response format.
        setOrders(Array.isArray(data) ? data : (data.items || data.data || []));
      }
    } catch(e) {
      // quiet fail
    } finally {
      setOrdersLoading(false);
    }
  }

  async function fetchCustomer() {
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setCustomer(data);
        setNewLimit(data.credit_limit || 0);
        setNewDiscount(data.discount || 0);
        setNewDiscount(data.discount || 0);
        setInteractions(data.interactions || []);
        setEditFormData({
          name: data.name || '',
          corporate_name: data.corporate_name || '',
          email: data.email || '',
          phone: data.phone || '',
          document: data.document || '',
          state_registration: data.state_registration || '',
          default_payment_method: data.default_payment_method || 'ERP_STANDARD'
        });

        try {
          const ures = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (ures.ok) {
            const udata = await ures.json();
            setCustomerUser(udata);
          }
        } catch (e) {
          // Ignore silently
        }
      } else {
        toast.error("Cliente não encontrado.");
        router.push('/customers');
      }
    } catch (error) {
      toast.error('Erro ao carregar os dados do cliente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateFinance() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          credit_limit: newLimit,
          discount: newDiscount
        })
      });
      if (res.ok) {
        toast.success("Dados financeiros atualizados!");
        setCustomer({ ...customer, credit_limit: newLimit, discount: newDiscount });
        setEditingFinance(false);
      } else {
        toast.error("Erro ao atualizar financeiro.");
      }
    } catch(e) {
      toast.error("Erro de sistema.");
    }
  }

  async function handleToggleConsignment() {
    const newStatus = customer.consignment_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ consignment_status: newStatus })
      });
      if (res.ok) {
        toast.success(`Consignação ${newStatus === 'ACTIVE' ? 'ativada' : 'desativada'}!`);
        setCustomer({ ...customer, consignment_status: newStatus });
      } else {
        toast.error("Erro ao alterar status de consignação.");
      }
    } catch(e) {
      toast.error("Erro de sistema.");
    }
  }

  async function handleSaveGeneralEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editFormData)
      });

      if (res.ok) {
        toast.success("Dados do cliente atualizados!");
        setCustomer({ ...customer, ...editFormData });
        setIsEditModalOpen(false);
      } else {
        toast.error("Erro ao atualizar dados.");
      }
    } catch(e) {
      toast.error("Erro de sistema ao salvar edição.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAddInteraction() {
    if (!interactionContent.trim()) return;
    setSavingInteraction(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/interactions`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'NOTE',
          content: interactionContent
        })
      });
      if (res.ok) {
        const result = await res.json();
        setInteractions([{ id: result.id, type: 'NOTE', content: interactionContent, created_at: new Date().toISOString() }, ...interactions]);
        setInteractionContent('');
        toast.success("Interação registrada!");
      }
    } catch (e) {
      toast.error("Erro ao registrar interação.");
    } finally {
      setSavingInteraction(false);
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/contacts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact)
      });
      if (res.ok) {
        toast.success("Contato adicionado!");
        const added = await res.json();
        setCustomer({ ...customer, contacts: [...(customer.contacts || []), added] });
        setIsContactModalOpen(false);
        setNewContact({ name: '', email: '', phone: '', role: '' });
      } else toast.error("Erro ao adicionar contato.");
    } catch(e) { toast.error("Erro de sistema."); }
    finally { setSavingContact(false); }
  }

  async function handleDeleteContact(contactId: number) {
    if (!confirm("Tem certeza que deseja remover este contato?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/contacts/${contactId}`, {
         method: 'DELETE',
         headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
         toast.success("Contato removido.");
         setCustomer({ ...customer, contacts: customer.contacts.filter((c:any) => c.id !== contactId) });
      } else toast.error("Erro ao remover.");
    } catch(e) { toast.error("Erro de sistema."); }
  }

  function openAuthModal() {
    if (customerUser) {
      setAuthMode('edit');
      setAuthForm({ email: customerUser.email, password: '' });
    } else {
      setAuthMode('create');
      setAuthForm({ email: customer.email || '', password: '' });
    }
    setIsAuthModalOpen(true);
  }

  async function handleSaveAuth(e: React.FormEvent) {
    e.preventDefault();
    setSavingAuth(true);
    try {
      if (authMode === 'create') {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/users`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(authForm)
        });
        if (res.ok) {
          toast.success("Acesso B2B criado com sucesso!");
          setCustomerUser(await res.json());
          setIsAuthModalOpen(false);
        } else {
          const err = await res.json();
          toast.error(err.detail || "Erro ao criar credencial.");
        }
      } else {
        // Edit mode
        let hasError = false;
        if (authForm.email !== customerUser.email) {
           const eRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${customerUser.id}/email`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: authForm.email })
           });
           if (!eRes.ok) hasError = true;
           else setCustomerUser({ ...customerUser, email: authForm.email });
        }
        if (authForm.password) {
           const pRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${customerUser.id}/password`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: authForm.password })
           });
           if (!pRes.ok) hasError = true;
        }
        
        if (hasError) toast.error("Ocorreu um erro ao atualizar email ou senha.");
        else { toast.success("Acesso atualizado!"); setIsAuthModalOpen(false); }
      }
    } catch(e) { toast.error("Erro interno."); }
    finally { setSavingAuth(false); }
  }

  async function handleSyncHorus() {
    if (!customer?.document) return;
    const cleanCnpj = customer.document.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast.error('CNPJ inválido para buscar no Horus.');
      return;
    }

    setSyncingHorus(true);
    try {
      if (!user?.company_id) throw new Error('Falha na autenticação: Empresa não encontrada.');
      
      const horusRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${user.company_id}/horus/customers/${cleanCnpj}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (!horusRes.ok) {
        const err = await horusRes.json();
        throw new Error(err.detail || 'Erro ao conectar no Horus.');
      }
      
      const payload = await horusRes.json();
      const horusData = payload.data;
      
      if (!horusData || !horusData.ID_GUID) {
         throw new Error('Retorno do Horus sem as chaves de integração.');
      }
      
      const patchRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, {
         method: 'PATCH',
         headers: { 
           'Authorization': `Bearer ${getToken()}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
            id_guid: horusData.ID_GUID,
            id_doc: payload.cnpj_seller,
            credit_limit: payload.financials?.credit_limit,
            open_debts: payload.financials?.open_debts,
            consignment_status: payload.financials?.consignment_status
         })
      });
      
      if (patchRes.ok) {
         toast.success('Sincronizado com o Horus com sucesso!');
         setCustomer({ 
           ...customer, 
           id_guid: horusData.ID_GUID, 
           id_doc: payload.cnpj_seller,
           credit_limit: payload.financials?.credit_limit || customer.credit_limit,
           open_debts: payload.financials?.open_debts || customer.open_debts,
           consignment_status: payload.financials?.consignment_status || customer.consignment_status
         });
      } else {
         const patchErr = await patchRes.json();
         throw new Error(patchErr.detail || 'Erro ao salvar as chaves no banco local.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao sincronizar com Horus.');
    } finally {
      setSyncingHorus(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex items-start gap-5">
          <Link 
            href="/customers"
            className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white mt-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-lg dark:bg-slate-800 dark:border-slate-700/50">
              <Building2 className="h-8 w-8 text-[var(--color-primary-base)]" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-2xl font-bold tracking-tight text-slate-900 cursor-pointer hover:text-[var(--color-primary-base)] transition-colors flex items-center gap-2 group border-b border-transparent hover:border-[var(--color-primary-base)]/30 dark:text-white dark:hover:text-indigo-400 dark:hover:border-indigo-400/30"
                  title="Clique para editar"
                >
                  {customer.name}
                </h1>
                <button 
                  onClick={handleToggleConsignment} 
                  title="Clique para habilitar/desabilitar permissão de compras consignadas"
                  className={`cursor-pointer hover:opacity-80 transition-opacity px-2.5 py-1 text-xs font-medium rounded-full border flex items-center gap-1.5 ${customer.consignment_status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700'}`}
                >
                   {customer.consignment_status === 'ACTIVE' ? <><CheckCircle className="w-3.5 h-3.5"/> Consignação Ativa</> : 'Faturamento Padrão'}
                </button>

              </div>
              <div className="flex flex-wrap items-center gap-4 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                  {customer.customer_type === 'PF' ? 'CPF:' : 'CNPJ:'} {customer.document}
                </span>
                {customer.corporate_name && <span className="opacity-75">{customer.corporate_name}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Temporarily disabled while building Product Catalog
        <div className="flex items-center gap-3">
          <Link
            href={`/orders/new?customer=${customer.id}`}
            className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            <ShoppingCart className="h-4 w-4" />
            Novo Pedido
          </Link>
        </div>
        */}
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
         <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-center relative shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex justify-between items-start">
             <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Limite de Crédito</p>
             <button onClick={() => setEditingFinance(!editingFinance)} className="text-xs text-[var(--color-primary-base)] transition-opacity dark:text-indigo-400 flex items-center gap-1 bg-[var(--color-primary-base)]/10 px-2 py-0.5 rounded">
               Editar
             </button>
          </div>
          {editingFinance ? (
             <div className="flex items-center gap-2 mt-2">
                 <CurrencyInput prefixStr="R$ " value={newLimit} onChangeValue={setNewLimit} className="w-28 bg-slate-50 border border-slate-200 text-sm px-2 py-1 rounded text-slate-900 dark:bg-slate-950 dark:border-slate-700 dark:text-white"/>
                 <button onClick={handleUpdateFinance} className="text-xs bg-[var(--color-primary-base)] text-white px-2 py-1 rounded dark:bg-indigo-500">Ok</button>
             </div>
          ) : (
            <p className="text-2xl font-bold text-emerald-600 mt-1 dark:text-emerald-400">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.credit_limit || 0)}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-5 flex flex-col justify-center relative shadow-sm dark:border-rose-900/30 dark:bg-rose-950/10">
           <div className="flex justify-between items-start">
             <p className="text-sm font-medium text-rose-600 dark:text-rose-400/80">Débitos / Financeiro Extra</p>
              <button onClick={() => setEditingFinance(!editingFinance)} className="text-xs text-[var(--color-primary-base)] transition-opacity dark:text-indigo-400 flex items-center gap-1 bg-[var(--color-primary-base)]/10 px-2 py-0.5 rounded">
               % Desconto
             </button>
          </div>
          {editingFinance ? (
             <div className="flex items-center gap-2 mt-2">
                 <CurrencyInput suffixStr="%" value={newDiscount} onChangeValue={setNewDiscount} className="w-24 bg-white border border-rose-200 text-sm px-2 py-1 rounded text-rose-700 placeholder:text-rose-300 dark:bg-slate-950 dark:border-slate-700 dark:text-white" placeholder="%"/>
                 <span className="text-xs text-rose-500 dark:text-slate-400">% de desconto padrão</span>
             </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold text-rose-600 mt-1 dark:text-rose-400">
                 {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.open_debts || 0)}
              </p>
              {customer.discount > 0 && (
                <span className="px-2 py-0.5 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] rounded text-xs font-semibold dark:bg-indigo-500/20 dark:text-indigo-400">
                   {customer.discount}% Desc. Fixo
                </span>
              )}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 flex flex-col justify-center shadow-sm dark:border-emerald-900/30 dark:bg-emerald-950/10">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400/80">Crédito Disponível (Saldo)</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1 dark:text-emerald-400">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((customer.credit_limit || 0) - (customer.open_debts || 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-center shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Último Pedido</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 dark:text-white">
            {ordersLoading ? (
              <span className="text-sm text-slate-400">Carregando...</span>
            ) : orders && orders.length > 0 ? (
              new Date(orders[0].created_at).toLocaleDateString('pt-BR')
            ) : (
              '-'
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Content Area */}
        <div className="lg:w-2/3 space-y-6">
          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-1 dark:border-slate-800">
            {[
              { id: 'overview', label: 'Visão Geral', icon: Building2 },
              { id: 'interactions', label: 'Interações', icon: MessageSquare },
              { id: 'orders', label: 'Pedidos Recentes', icon: ShoppingCart },
              { id: 'contacts', label: 'Contatos & Locais', icon: Users },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 px-4 font-medium transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-[var(--color-primary-base)] text-slate-900 dark:text-white' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="min-h-[400px]"
          >
            {activeTab === 'overview' && (
              <div className="space-y-6">
                 {/* Basic Info */}
                 <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-medium text-slate-900 dark:text-white">Dados Cadastrais</h3>
                      
                      {/* Horus Integration Status / Sync Button */}
                      {customer.customer_type === 'PJ' && (!customer.id_guid || !customer.id_doc) && (
                        <button
                          onClick={handleSyncHorus}
                          disabled={syncingHorus}
                          className="text-xs flex items-center gap-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 dark:border-indigo-500/20 disabled:opacity-50"
                        >
                          {syncingHorus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Buscar credenciais no Horus
                        </button>
                      )}
                      
                      {customer.id_guid && customer.id_doc && (
                         <div className="flex gap-2 items-center">
                           <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1.5 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-medium whitespace-nowrap">
                             <CheckCircle className="w-3.5 h-3.5" /> Integrado ao Horus
                           </span>
                           <button 
                             onClick={handleSyncHorus}
                             disabled={syncingHorus}
                             title="Sincronizar dados financeiros e cadastrais com o Horus"
                             className="text-slate-400 hover:text-emerald-600 transition-colors bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 p-1 rounded-full dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-emerald-500/20 dark:hover:border-emerald-500/30 dark:hover:text-emerald-400 disabled:opacity-50"
                           >
                              {syncingHorus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                           </button>
                           {customer.consignment_status === 'ACTIVE' && (
                             <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-1.5 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 font-medium whitespace-nowrap">
                               Consignação Aceita
                             </span>
                           )}
                         </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-y-6 gap-x-4 mt-6">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">E-mail Principal</p>
                        <p className="text-sm text-slate-900 dark:text-slate-300">{customer.email || 'Não informado'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Telefone Principal</p>
                        <p className="text-sm text-slate-900 dark:text-slate-300">{customer.phone || 'Não informado'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Inscrição Estadual</p>
                        <p className="text-sm text-slate-900 dark:text-slate-300">{customer.state_registration || 'Isento'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Cadastrado Em</p>
                        <p className="text-sm text-slate-900 dark:text-slate-300">{new Date(customer.created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Método de Pagamento B2B</p>
                        <div className="inline-flex items-center mt-1 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-medium dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400">
                          {customer.default_payment_method === 'EFI_PIX_CREDIT' ? 'Pix Automático / Cartão (EFI)' :
                           customer.default_payment_method === 'PIX_MANUAL' ? 'Depósito / PIX Manual' :
                           'Faturamento Padrão (Duplicata/ERP)'}
                        </div>
                      </div>
                    </div>
                 </div>
                 
                 {/* Main Address Spotlight */}
                 {customer.addresses && customer.addresses.length > 0 && (
                   <div className="rounded-2xl border border-slate-200 bg-indigo-50 flex gap-4 p-6 dark:border-slate-800 dark:bg-slate-900/40">
                     <div className="h-10 w-10 rounded-full bg-[var(--color-primary-base)]/10 flex items-center justify-center shrink-0 dark:bg-indigo-500/10">
                       <MapPin className="h-5 w-5 text-[var(--color-primary-base)] dark:text-indigo-400" />
                     </div>
                     <div>
                       <h3 className="text-sm font-medium text-slate-900 mb-1 dark:text-white">Endereço Principal</h3>
                       <p className="text-sm text-slate-600 cursor-pointer hover:text-[var(--color-primary-base)] transition-colors dark:text-slate-400 dark:hover:text-indigo-400">
                         {customer.addresses[0].street}, {customer.addresses[0].number} - {customer.addresses[0].neighborhood} <br/>
                         {customer.addresses[0].city}/{customer.addresses[0].state} - CEP: {customer.addresses[0].zip_code}
                       </p>
                     </div>
                   </div>
                 )}
              </div>
            )}

            {activeTab === 'interactions' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <input 
                    type="text" 
                    value={interactionContent}
                    onChange={e => setInteractionContent(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddInteraction()}
                    placeholder="Registar uma nova nota, ligação, ou negociação..." 
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all shadow-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:focus:border-indigo-500/50 dark:placeholder:text-slate-500" 
                  />
                  <button onClick={handleAddInteraction} disabled={savingInteraction} className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white p-3 rounded-xl transition-all shadow-sm shadow-[var(--color-primary-base)]/20 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700 dark:shadow-none">
                    {savingInteraction ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                  </button>
                </div>
                
                <div className="relative pl-6 border-l-2 border-slate-200 space-y-8 mt-8 dark:border-slate-800">
                   {interactions.length === 0 ? (
                     <div className="text-slate-500 text-sm ml-4">Nenhuma interação registrada para este cliente.</div>
                   ) : (
                     interactions.map((interaction: any, idx) => (
                       <div key={idx} className="relative">
                         <div className="absolute -left-[35px] h-8 w-8 rounded-full bg-slate-50 border-2 border-slate-200 flex items-center justify-center dark:bg-slate-900 dark:border-slate-800">
                           <StickyNote className="h-3.5 w-3.5 text-slate-400" />
                         </div>
                         <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm dark:bg-slate-900/60 dark:border-slate-800/80 dark:shadow-none">
                           <div className="flex justify-between items-start mb-2">
                             <span className="text-xs font-semibold text-[var(--color-primary-base)] dark:text-indigo-400">Vendedor (Você)</span>
                             <span className="text-xs text-slate-500">{new Date(interaction.created_at).toLocaleDateString('pt-BR')}</span>
                           </div>
                           <p className="text-sm text-slate-700 dark:text-slate-300">{interaction.content}</p>
                         </div>
                       </div>
                     ))
                   )}
                </div>
              </div>
            )}

            {activeTab === 'orders' && (
              <div className="space-y-4">
                {ordersLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                ) : orders && orders.length > 0 ? (
                  <div className="grid gap-4">
                    {orders.map((order: any) => (
                      <div key={order.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between dark:bg-slate-900/40 dark:border-slate-800">
                        <div>
                          <p className="font-semibold text-slate-900 border-b border-transparent inline-flex hover:border-slate-300 cursor-pointer dark:text-white pb-0.5 mb-1" onClick={() => router.push(`/orders/${order.id}`)}>Pedido #{order.id}</p>
                          <div className="flex gap-4 text-xs text-slate-500 font-medium">
                            <span>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                            <span className="text-[var(--color-primary-base)] dark:text-indigo-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount || 0)}</span>
                          </div>
                        </div>
                        <div>
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold dark:bg-slate-800 dark:text-slate-400">{order.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 dark:border-slate-800 dark:bg-transparent">
                    <ShoppingCart className="h-12 w-12 text-slate-400 mx-auto mb-4 dark:text-slate-600" />
                    <h3 className="text-lg font-medium text-slate-900 mb-1 dark:text-white">Nenhum pedido recente</h3>
                    <p className="text-sm text-slate-500 mb-4 dark:text-slate-400">Este cliente ainda não possui histórico de faturamento.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contacts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-slate-500 uppercase tracking-widest dark:text-slate-400">Contatos Nomeados ({customer.contacts?.length || 0})</h3>
                  <button onClick={() => setIsContactModalOpen(true)} className="text-xs flex items-center gap-1 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/20 px-3 py-1.5 rounded-lg transition-colors border border-[var(--color-primary-base)]/20 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 dark:border-indigo-500/20">
                    <Plus className="h-3.5 w-3.5" /> Adicionar Contato
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customer.contacts?.map((contact: any, idx: number) => (
                    <div key={idx} className="p-4 border border-slate-200 bg-white rounded-xl relative group shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-none">
                      <button onClick={() => handleDeleteContact(contact.id)} className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all bg-slate-50 p-1.5 rounded-md dark:text-slate-500 dark:hover:text-rose-400 dark:bg-slate-950/50" title="Excluir Contato">
                         <X className="h-4 w-4" />
                      </button>
                      <p className="font-medium text-slate-900 text-sm mb-1 dark:text-white">{contact.name}</p>
                      <p className="text-xs font-semibold text-[var(--color-primary-base)] mb-3 dark:text-indigo-400">{contact.role || 'Sem cargo definido'}</p>
                      <div className="space-y-2">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <Mail className="h-3.5 w-3.5"/> {contact.email}
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <Phone className="h-3.5 w-3.5"/> {contact.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-widest mt-8 pt-6 border-t border-slate-200 dark:text-slate-400 dark:border-slate-800">Endereços ({customer.addresses?.length || 0})</h3>
                <div className="space-y-3">
                  {customer.addresses?.map((addr: any, idx: number) => (
                     <div key={idx} className="p-4 border border-slate-200 bg-white rounded-xl flex items-start gap-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-none">
                        <MapPin className="h-5 w-5 text-slate-400 shrink-0 mt-0.5 dark:text-slate-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-2 dark:text-slate-300">
                            {addr.type === 'MAIN' ? 'Matriz' : addr.type === 'BILLING' ? 'Cobrança' : 'Entrega'}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{addr.street}, {addr.number} {addr.complement ? `- ${addr.complement}` : ''}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{addr.neighborhood} - {addr.city}/{addr.state} - CEP: {addr.zip_code}</p>
                        </div>
                     </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Sidebar Panel for B2B Portal Login Context */}
        <div className="lg:w-1/3">
          <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-none">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-2 dark:text-white">
              <ExternalLink className="h-5 w-5 text-[var(--color-primary-base)] dark:text-[var(--color-primary-base)]" />
              Acesso ao Portal
            </h3>
            <p className="text-sm text-slate-500 mb-6 dark:text-slate-400">
              O cliente acessa o B2B para auto-atendimento usando o E-mail de acesso.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center dark:bg-slate-950/50 dark:border-slate-800">
              {customerUser ? (
                 <>
                   <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-xs font-medium mb-3 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                     Login Ativo
                   </span>
                   <p className="text-sm font-medium text-slate-900 mb-1 dark:text-white">{customerUser.email}</p>
                   <p className="text-xs text-slate-500 mb-4 dark:text-slate-400">Senha criptografada no banco</p>
                   <button onClick={openAuthModal} className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-transparent dark:text-white">
                     Editar Acesso / Senha
                   </button>
                 </>
              ) : (
                 <>
                   <span className="inline-block px-3 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-full text-xs font-medium mb-3 dark:bg-amber-500/10 dark:text-amber-500 dark:border-amber-500/20">
                     Login Inativo
                   </span>
                   <p className="text-sm text-slate-600 mb-4 dark:text-slate-300">
                     Gere uma credencial de senha para o cliente explorar o catálogo online.
                   </p>
                   <button onClick={openAuthModal} className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm">
                     Criar Acesso B2B
                   </button>
                 </>
              )}
            </div>
            
            <hr className="border-slate-200 my-6 dark:border-slate-800" />
            
            <h4 className="text-sm font-medium text-slate-700 mb-3 dark:text-slate-300">Assistência Rápida</h4>
            <div className="space-y-2">
              <button className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 dark:hover:border-slate-800">
                <Mail className="h-4 w-4" /> Enviar Catálogo por E-mail
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium rounded-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-200 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 dark:hover:border-emerald-500/20">
                <MessageSquare className="h-4 w-4" /> Chamar no WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>

           {/* General Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/80">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl dark:bg-slate-900 dark:border-slate-800"
          >
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Editar Cliente</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors dark:text-slate-500 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveGeneralEdit} className="p-6 space-y-4">
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Nome Fantasia / Apelido</label>
                  <input type="text" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Razão Social / Nome Completo</label>
                  <input type="text" value={editFormData.corporate_name} onChange={e => setEditFormData({...editFormData, corporate_name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Documento (CNPJ/CPF)</label>
                    <input type="text" value={editFormData.document} onChange={e => setEditFormData({...editFormData, document: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] font-mono dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
                 </div>
                 <div>
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Inscrição Estadual</label>
                    <input type="text" value={editFormData.state_registration} onChange={e => setEditFormData({...editFormData, state_registration: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] font-mono dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">E-mail Principal</label>
                    <input type="email" value={editFormData.email} onChange={e => setEditFormData({...editFormData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
                 </div>
                 <div>
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Telefone</label>
                    <input type="text" value={editFormData.phone} onChange={e => setEditFormData({...editFormData, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
                 </div>
               </div>
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Método de Pagamento B2B</label>
                  <select 
                    value={editFormData.default_payment_method} 
                    onChange={e => setEditFormData({...editFormData, default_payment_method: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500"
                  >
                    <option value="ERP_STANDARD">Faturamento Padrão (Duplicata/ERP)</option>
                    <option value="EFI_PIX_CREDIT">Pix Automático / Cartão (EFI)</option>
                    <option value="PIX_MANUAL">Depósito / PIX Manual</option>
                  </select>
               </div>
               <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 mt-6 dark:border-slate-800">
                 <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 transition-colors dark:text-slate-400 dark:hover:text-white">Cancelar</button>
                 <button type="submit" disabled={savingEdit} className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50">
                    {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                 </button>
               </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Auth Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/80">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl dark:bg-slate-900 dark:border-slate-800"
          >
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{authMode === 'create' ? 'Criar Acesso B2B' : 'Editar Acesso'}</h3>
              <button onClick={() => setIsAuthModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors dark:text-slate-500 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAuth} className="p-6 space-y-4">
              {authMode === 'edit' && <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-200 mb-4 dark:text-amber-400/80 dark:bg-amber-500/10 dark:border-amber-500/20">Atenção: Apenas altere a senha se o cliente solicitou. A senha original não pode ser recuperada, apenas substituída.</p>}
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">E-mail de Login</label>
                  <input type="email" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">
                    {authMode === 'create' ? 'Senha Provisória' : 'Nova Senha (Opcional)'}
                  </label>
                  <input type="password" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} required={authMode === 'create'} minLength={6} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 mt-6 dark:border-slate-800">
                 <button type="button" onClick={() => setIsAuthModalOpen(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 transition-colors text-sm dark:text-slate-400 dark:hover:text-white">Cancelar</button>
                 <button type="submit" disabled={savingAuth} className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50 text-sm font-medium">
                    {savingAuth ? 'Salvando...' : 'Salvar Credenciais'}
                 </button>
               </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Contact Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm dark:bg-slate-950/80">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl dark:bg-slate-900 dark:border-slate-800"
          >
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Novo Contato</h3>
              <button onClick={() => setIsContactModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors dark:text-slate-500 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddContact} className="p-6 space-y-4">
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Nome do Contato</label>
                  <input type="text" value={newContact.name} onChange={e => setNewContact({...newContact, name: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Cargo / Setor (Opcional)</label>
                  <input type="text" value={newContact.role} onChange={e => setNewContact({...newContact, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">E-mail (Opcional)</label>
                  <input type="email" value={newContact.email} onChange={e => setNewContact({...newContact, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div>
                  <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Telefone (Opcional)</label>
                  <input type="text" value={newContact.phone} onChange={e => setNewContact({...newContact, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white dark:focus:border-indigo-500" />
               </div>
               <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 mt-6 dark:border-slate-800">
                 <button type="button" onClick={() => setIsContactModalOpen(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 transition-colors text-sm dark:text-slate-400 dark:hover:text-white">Cancelar</button>
                 <button type="submit" disabled={savingContact} className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-6 py-2 rounded-xl transition-colors disabled:opacity-50 text-sm font-medium">
                    {savingContact ? 'Salvando...' : 'Adicionar'}
                 </button>
               </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
