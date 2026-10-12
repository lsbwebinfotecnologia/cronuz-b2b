'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Package,
  Trash2,
  Plus,
  Minus,
  Search,
  User,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  Truck,
  Store,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

export interface EncomendaCartItem {
  isbn: string;
  title: string;
  publisher?: string;
  author?: string;
  cover_url?: string;
  quantity: number;
  unit_price: number;
  horus_cod_item?: number;
  suggested_supplier_id?: number;
}

interface CustomerOption {
  id: number;
  name: string;
  document: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  addresses?: Array<{
    zip_code?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  }>;
}

interface CustomerEncomendaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: EncomendaCartItem[];
  onUpdateQuantity: (isbn: string, newQty: number) => void;
  onUpdatePrice: (isbn: string, newPrice: number) => void;
  onRemoveItem: (isbn: string) => void;
  onClearCart: () => void;
  onOrderCreated?: (encomendaNumber: string) => void;
  branches?: string[];
}

export default function CustomerEncomendaDrawer({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onUpdatePrice,
  onRemoveItem,
  onClearCart,
  onOrderCreated,
  branches = ['Loja Principal (Balcão)']
}: CustomerEncomendaDrawerProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // ── Identificação do Cliente ──
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  // ── Formulário Cadastro Rápido de Cliente ──
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerType, setNewCustomerType] = useState<'PF' | 'PJ'>('PF');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerDoc, setNewCustomerDoc] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // ── Logística de Entrega ──
  const [deliveryType, setDeliveryType] = useState<'BALCAO' | 'ENTREGA'>('BALCAO');
  const [pickupBranch, setPickupBranch] = useState(branches[0] || 'Loja Principal (Balcão)');

  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [searchingCep, setSearchingCep] = useState(false);

  // ── Notas e Submissão ──
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Busca de Cliente com Debounce ──
  useEffect(() => {
    const q = customerSearchQuery.trim();
    if (q.length < 2) {
      setCustomerList([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const token = localStorage.getItem('access_token') || sessionStorage.getItem('token');
        const res = await fetch(`${apiUrl}/customers?search=${encodeURIComponent(q)}&limit=8`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCustomerList(Array.isArray(data) ? data : []);
        }
      } catch {
        // silencioso
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearchQuery, apiUrl]);

  // Atualiza filial padrão se a lista de filiais mudar
  useEffect(() => {
    if (branches && branches.length > 0 && !branches.includes(pickupBranch)) {
      setPickupBranch(branches[0]);
    }
  }, [branches]);

  // ── Seleção de Cliente ──
  const handleSelectCustomer = (c: CustomerOption) => {
    setSelectedCustomer(c);
    setCustomerSearchQuery('');
    setCustomerList([]);
    setShowNewCustomerForm(false);

    // Se tiver endereço cadastrado, preenche automaticamente se for entrega
    if (c.addresses && c.addresses.length > 0) {
      const addr = c.addresses[0];
      if (addr.zip_code) setZipCode(addr.zip_code);
      if (addr.street) setStreet(addr.street);
      if (addr.number) setNumber(addr.number);
      if (addr.complement) setComplement(addr.complement);
      if (addr.neighborhood) setNeighborhood(addr.neighborhood);
      if (addr.city) setCity(addr.city);
      if (addr.state) setState(addr.state);
    }
    toast.success(`Cliente ${c.name} selecionado para a encomenda!`);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
  };

  // ── Busca de CEP ViaCEP ──
  const handleLookupCep = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, '');
    if (clean.length !== 8) return;

    setSearchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setStreet(data.logradouro || '');
        setNeighborhood(data.bairro || '');
        setCity(data.localidade || '');
        setState(data.uf || '');
        toast.success(`Endereço localizado: ${data.bairro}, ${data.localidade}-${data.uf}`);
      } else {
        toast.warning('CEP não encontrado na base dos Correios.');
      }
    } catch {
      toast.error('Erro ao consultar CEP.');
    } finally {
      setSearchingCep(false);
    }
  };

  // ── Cadastro Rápido de Cliente ──
  const handleSaveQuickCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) {
      toast.warning('Informe o nome do cliente.');
      return;
    }
    const cleanDoc = newCustomerDoc.replace(/\D/g, '');
    if (cleanDoc.length < 11) {
      toast.warning('Informe um CPF ou CNPJ válido.');
      return;
    }

    setSavingCustomer(true);
    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('token');
      const payload: any = {
        name: newCustomerName.trim(),
        document: cleanDoc,
        customer_type: newCustomerType,
        phone: newCustomerPhone.trim() || undefined,
        email: newCustomerEmail.trim() || undefined
      };

      const res = await fetch(`${apiUrl}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Falha ao cadastrar cliente.');
      }

      const createdCust: CustomerOption = await res.json();
      toast.success(`Cliente ${createdCust.name} cadastrado e vinculado com sucesso!`);
      setSelectedCustomer(createdCust);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerDoc('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar cliente.');
    } finally {
      setSavingCustomer(false);
    }
  };

  // ── Totais ──
  const totalQuantity = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const totalAmount = items.reduce((acc, it) => acc + (it.unit_price * (it.quantity || 1)), 0);

  // ── Finalização da Encomenda ──
  const handleCreateEncomenda = async () => {
    if (items.length === 0) {
      toast.warning('Adicione ao menos um título à encomenda.');
      return;
    }

    if (!selectedCustomer && !newCustomerName.trim()) {
      toast.warning('Selecione ou informe os dados do cliente solicitante.');
      return;
    }

    if (deliveryType === 'ENTREGA' && (!street.trim() || !city.trim())) {
      toast.warning('Para entrega no endereço, preencha o logradouro e cidade.');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('token');

      const payload = {
        customer_id: selectedCustomer?.id || undefined,
        customer_name: (selectedCustomer ? selectedCustomer.name : newCustomerName).trim(),
        customer_document: (selectedCustomer ? selectedCustomer.document : newCustomerDoc).replace(/\D/g, '') || undefined,
        customer_phone: (selectedCustomer ? selectedCustomer.phone : newCustomerPhone)?.trim() || undefined,
        customer_email: (selectedCustomer ? selectedCustomer.email : newCustomerEmail)?.trim() || undefined,
        delivery_type: deliveryType,
        pickup_branch_name: deliveryType === 'BALCAO' ? pickupBranch : undefined,
        shipping_zip_code: deliveryType === 'ENTREGA' ? zipCode : undefined,
        shipping_street: deliveryType === 'ENTREGA' ? street : undefined,
        shipping_number: deliveryType === 'ENTREGA' ? number : undefined,
        shipping_complement: deliveryType === 'ENTREGA' ? complement : undefined,
        shipping_neighborhood: deliveryType === 'ENTREGA' ? neighborhood : undefined,
        shipping_city: deliveryType === 'ENTREGA' ? city : undefined,
        shipping_state: deliveryType === 'ENTREGA' ? state : undefined,
        notes: notes.trim() || undefined,
        items: items.map(it => ({
          isbn: it.isbn,
          title: it.title,
          publisher: it.publisher || undefined,
          author: it.author || undefined,
          cover_url: it.cover_url || undefined,
          quantity: it.quantity,
          unit_price: it.unit_price,
          horus_cod_item: it.horus_cod_item || undefined,
          suggested_supplier_id: it.suggested_supplier_id || undefined
        }))
      };

      const res = await fetch(`${apiUrl}/encomendas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Falha ao registrar encomenda.');
      }

      const createdOrder = await res.json();
      toast.success(`Encomenda ${createdOrder.encomenda_number} gerada com sucesso! (${totalQuantity} itens)`);

      onClearCart();
      onClose();
      if (onOrderCreated) {
        onOrderCreated(createdOrder.encomenda_number);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar encomenda.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* ── Topo do Drawer ── */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xs">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                  Encomenda do Cliente
                </h2>
                <span className="text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Sob Demanda
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5">
                {items.length} {items.length === 1 ? 'título selecionado' : 'títulos selecionados'} • {totalQuantity} unidades
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Banner Informativo: Diferenciação Encomenda Cliente vs Compra Fornecedor ── */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/60 px-5 py-2.5 flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <p>
            <strong>Atenção ao Operador:</strong> Esta é a encomenda do seu cliente. Após a confirmação, o pedido fica registrado e você poderá gerar as solicitações de compra com os fornecedores parceiros ou no Pedido de Compra do Hórus.
          </p>
        </div>

        {/* ── Conteúdo Rolável ── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

          {/* 1. LISTA DE TÍTULOS ENCOMENDADOS */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-600" />
                1. Títulos Selecionados ({items.length})
              </h3>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={onClearCart}
                  className="text-xs text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                >
                  Limpar lista
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-400">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">Nenhum título adicionado ainda.</p>
                <p className="text-xs mt-1 text-slate-500">
                  Pesquise no Busca Preço ou Bookinfo e clique em "Adicionar à Encomenda".
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((it) => (
                  <div
                    key={it.isbn}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-start gap-3 transition-all hover:border-slate-300"
                  >
                    {it.cover_url ? (
                      <img
                        src={it.cover_url}
                        alt=""
                        className="w-12 h-16 object-contain rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 text-slate-400">
                        <Package className="w-5 h-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
                        {it.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 font-medium">
                        <span>ISBN: <strong className="font-mono text-slate-700 dark:text-slate-300">{it.isbn}</strong></span>
                        {it.publisher && <span>Ed: {it.publisher}</span>}
                        {it.author && <span>Aut: {it.author}</span>}
                      </div>

                      {/* Controles de Quantidade e Preço Unitário */}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(it.isbn, Math.max(1, it.quantity - 1))}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center font-bold text-xs text-slate-800 dark:text-slate-100">
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(it.isbn, it.quantity + 1)}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block leading-none">Preço Unit.</span>
                            <div className="flex items-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              <span>R$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.unit_price}
                                onChange={(e) => onUpdatePrice(it.isbn, parseFloat(e.target.value) || 0)}
                                className="w-20 px-1 py-0.5 text-right font-bold text-xs rounded border border-transparent hover:border-slate-300 focus:border-emerald-500 bg-transparent"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveItem(it.isbn)}
                            className="p-2 text-slate-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                            title="Remover item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. IDENTIFICAÇÃO E DADOS DO CLIENTE */}
          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              2. Cliente Solicitante
            </h3>

            {selectedCustomer ? (
              /* Card de Cliente Selecionado */
              <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 relative">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Cliente Vinculado
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {selectedCustomer.name}
                    </h4>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {selectedCustomer.document && (
                        <span>Doc: <strong className="font-mono text-slate-700 dark:text-slate-200">{selectedCustomer.document}</strong></span>
                      )}
                      {selectedCustomer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-600" /> {selectedCustomer.phone}
                        </span>
                      )}
                      {selectedCustomer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-emerald-600" /> {selectedCustomer.email}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearCustomer}
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 hover:underline cursor-pointer"
                  >
                    Trocar
                  </button>
                </div>
              </div>
            ) : showNewCustomerForm ? (
              /* Formulário de Cadastro Rápido Inline */
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-emerald-600" />
                    Novo Cadastro de Cliente
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="flex gap-4 text-xs font-semibold">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={newCustomerType === 'PF'}
                      onChange={() => setNewCustomerType('PF')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    Pessoa Física (CPF)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={newCustomerType === 'PJ'}
                      onChange={() => setNewCustomerType('PJ')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    Pessoa Jurídica (CNPJ)
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Nome Completo / Razão Social *
                    </label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Ex: Maria das Graças ou Escola Futuro"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {newCustomerType === 'PF' ? 'CPF *' : 'CNPJ *'}
                    </label>
                    <input
                      type="text"
                      value={newCustomerDoc}
                      onChange={(e) => setNewCustomerDoc(e.target.value)}
                      placeholder="Somente números"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      E-mail do Cliente
                    </label>
                    <input
                      type="email"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                      placeholder="cliente@exemplo.com.br"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveQuickCustomer}
                    disabled={savingCustomer}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-all shadow-xs"
                  >
                    {savingCustomer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Salvar e Vincular Cliente
                  </button>
                </div>
              </div>
            ) : (
              /* Campo de Pesquisa de Cliente com Autocomplete */
              <div className="space-y-2 relative">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Pesquisar cliente por CPF/CNPJ, Nome ou Telefone..."
                    className="w-full pl-10 pr-24 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                  {customerSearching && (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-24 top-3" />
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(true)}
                    className="absolute right-2 top-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    + Novo
                  </button>
                </div>

                {/* Dropdown de sugestões */}
                {customerList.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {customerList.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {c.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Doc: {c.document} {c.phone && `• Tel: ${c.phone}`}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 3. MODALIDADE DE ENTREGA / LOGÍSTICA */}
          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              3. Modalidade de Entrega / Logística
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryType('BALCAO')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  deliveryType === 'BALCAO'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <Store className="w-4 h-4" />
                Retirada no Balcão
              </button>

              <button
                type="button"
                onClick={() => setDeliveryType('ENTREGA')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  deliveryType === 'ENTREGA'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                <Truck className="w-4 h-4" />
                Entrega no Endereço
              </button>
            </div>

            {deliveryType === 'BALCAO' ? (
              /* Retirada na Loja */
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Selecione a Filial / Loja de Retirada:
                </label>
                <select
                  value={pickupBranch}
                  onChange={(e) => setPickupBranch(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium text-slate-800 dark:text-slate-100"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  O cliente será informado via WhatsApp ou E-mail assim que as obras chegarem nesta filial.
                </p>
              </div>
            ) : (
              /* Endereço de Entrega */
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      CEP
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        onBlur={(e) => handleLookupCep(e.target.value)}
                        placeholder="00000-000"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      {searchingCep && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-2.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Logradouro / Rua *
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Ex: Av. Paulista, Rua das Flores"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Número *
                    </label>
                    <input
                      type="text"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="123"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Apto 42"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Bairro"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Cidade / UF
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Cidade"
                        className="w-full px-2 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <input
                        type="text"
                        maxLength={2}
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase())}
                        placeholder="UF"
                        className="w-12 text-center uppercase px-1 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 4. OBSERVAÇÕES */}
          <section className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Observações Internas ou da Encomenda
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Cliente tem urgência, avisar assim que chegar do fornecedor..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500"
            />
          </section>
        </div>

        {/* ── Rodapé / Resumo e Confirmação ── */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 shrink-0 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Total de Itens:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{totalQuantity} unidade(s)</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Total Estimado da Encomenda:
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              Continuar Pesquisando
            </button>

            <button
              type="button"
              onClick={handleCreateEncomenda}
              disabled={submitting || items.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando Encomenda...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Gerar Encomenda ({totalQuantity})
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
