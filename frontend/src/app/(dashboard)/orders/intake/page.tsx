'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Package, 
  ArrowLeft, 
  Upload, 
  FileSpreadsheet, 
  MessageSquare, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Send, 
  FileSignature, 
  Plus, 
  Trash2, 
  RefreshCw, 
  TrendingUp, 
  DollarSign, 
  Info
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';
import { CurrencyInput } from '@/components/CurrencyInput';

interface AnalysedItem {
  ean: string;
  title: string;
  publisher: string;
  requested_qty: number;
  approved_qty: number;
  unit_price: number;
  discount_percent: number;
  final_unit_price: number;
  total_price: number;
  available_stock: number;
  consigned_balance: number;
  situation: 'OK' | 'PARTIAL' | 'OUT_OF_STOCK' | 'CONSIGN_BLOCKED' | 'NOT_FOUND';
  situation_label: string;
  notes: string;
  customer_last_60d_sold: number;
  customer_last_60d_returned: number;
  customer_last_sale_date: string | null;
}

interface SuggestionItem {
  ean: string;
  title: string;
  publisher: string;
  genre?: string;
  price: number;
  available_stock: number;
  sold_last_60d?: number;
  last_sold_date?: string | null;
  reason: string;
}

export default function OrderIntakePage() {
  const router = useRouter();

  // Step 1: Customer & Configuration
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | number>('');
  const [customer, setCustomer] = useState<any>(null);
  const [operationType, setOperationType] = useState<'V' | 'C'>('V'); // V = Venda, C = Consignação

  // Step 2: Intake Source Tabs
  const [intakeTab, setIntakeTab] = useState<'text' | 'file' | 'manual'>('text');
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);

  // Manual Item input
  const [manualEan, setManualEan] = useState('');
  const [manualQty, setManualQty] = useState(1);

  // Draft Items (raw ISBNs and requested quantities)
  const [draftItems, setDraftItems] = useState<Array<{ ean: string; quantity: number }>>([]);

  // Step 3: Analysis Results
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    items: AnalysedItem[];
    summary: {
      total_requested_units: number;
      total_fulfilled_units: number;
      subtotal_estimated: number;
      fill_rate_percent: number;
      has_unfulfilled_items: boolean;
      consign_blocked_count: number;
    };
    customer: {
      id: number;
      name: string;
      credit_limit: number;
      open_debts: number;
      discount_percent: number;
    };
  } | null>(null);

  // Step 4: Smart Suggestions Drawer / Modal
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<{
    replacement_suggestions: SuggestionItem[];
    new_releases: SuggestionItem[];
  }>({ replacement_suggestions: [], new_releases: [] });

  // Final Action Settings
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [paymentCondition, setPaymentCondition] = useState('A Vista');
  const [proposalNotes, setProposalNotes] = useState('');

  // Handle Customer Selection
  const handleCustomerChange = (id: string, cust: any) => {
    setSelectedCustomerId(id);
    setCustomer(cust);
    setAnalysisResult(null);
  };

  // Parser: Text / WhatsApp
  const handleParseText = async () => {
    if (!rawText.trim()) {
      toast.error('Cole um texto contendo ISBNs ou códigos de barras.');
      return;
    }

    setParsing(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/intake/parse-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ raw_text: rawText })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao processar texto.');
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        toast.warning('Nenhum ISBN/código de barras válido foi identificado no texto.');
        return;
      }

      mergeIntoDraft(data.items);
      toast.success(`${data.total_items} item(ns) identificado(s) com sucesso!`);
      setRawText('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao processar texto.');
    } finally {
      setParsing(false);
    }
  };

  // Parser: File (XLSX, CSV, PDF)
  const handleParseFile = async () => {
    if (!selectedFile) {
      toast.error('Selecione uma planilha (XLSX/CSV) ou PDF de pedido.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('O arquivo excede o limite máximo permitido de 10 MB.');
      return;
    }

    setParsing(true);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/intake/parse-file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao processar arquivo.');
      }

      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        toast.warning('Nenhum ISBN/item foi extraído do arquivo enviado.');
        return;
      }

      mergeIntoDraft(data.items);
      toast.success(`${data.total_items} item(ns) importado(s) do arquivo!`);
      setSelectedFile(null);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao importar arquivo.');
    } finally {
      setParsing(false);
    }
  };

  const mergeIntoDraft = (newItems: Array<{ ean: string; quantity: number }>) => {
    setDraftItems(prev => {
      const map = new Map<string, number>();
      for (const item of prev) {
        map.set(item.ean, (map.get(item.ean) || 0) + item.quantity);
      }
      for (const item of newItems) {
        map.set(item.ean, (map.get(item.ean) || 0) + item.quantity);
      }
      return Array.from(map.entries()).map(([ean, quantity]) => ({ ean, quantity }));
    });
    setAnalysisResult(null);
  };

  const handleAddManualItem = () => {
    const cleanEan = manualEan.trim().replace(/[^0-9X]/gi, '');
    if (!cleanEan || cleanEan.length < 10) {
      toast.error('Informe um ISBN ou código de barras válido.');
      return;
    }
    if (manualQty < 1) {
      toast.error('A quantidade deve ser maior ou igual a 1.');
      return;
    }

    mergeIntoDraft([{ ean: cleanEan, quantity: manualQty }]);
    setManualEan('');
    setManualQty(1);
    toast.success('Item adicionado à lista preliminar!');
  };

  const handleRemoveDraftItem = (ean: string) => {
    setDraftItems(prev => prev.filter(i => i.ean !== ean));
    if (analysisResult) {
      setAnalysisResult(prev => prev ? {
        ...prev,
        items: prev.items.filter(i => i.ean !== ean)
      } : null);
    }
  };

  const handleRunAnalysis = async () => {
    if (!selectedCustomerId) {
      toast.error('Selecione primeiro o Cliente / Razão Social.');
      return;
    }
    if (draftItems.length === 0) {
      toast.error('Adicione pelo menos um item à lista para analisar.');
      return;
    }

    setIsAnalysing(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/intake/analyse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          customer_id: Number(selectedCustomerId),
          operation_type: operationType,
          items: draftItems
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao analisar pedido.');
      }

      const data = await res.json();
      setAnalysisResult(data);
      toast.success('Análise de estoque e histórico concluída com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Erro durante a análise do pedido.');
    } finally {
      setIsAnalysing(false);
    }
  };

  const handleFetchSuggestions = async () => {
    if (!selectedCustomerId) {
      toast.error('Selecione um cliente para carregar sugestões personalizadas de BI.');
      return;
    }

    setLoadingSuggestions(true);
    setSuggestionsOpen(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/intake/suggestions?customer_id=${selectedCustomerId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      } else {
        toast.error('Não foi possível carregar sugestões no momento.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao carregar sugestões.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = (item: SuggestionItem) => {
    mergeIntoDraft([{ ean: item.ean, quantity: 1 }]);
    toast.success(`"${item.title.substring(0, 30)}..." adicionado ao pedido!`);
  };

  const handleUpdateApprovedQty = (ean: string, newQty: number) => {
    if (!analysisResult) return;
    const safeQty = Math.max(0, newQty);
    setAnalysisResult(prev => {
      if (!prev) return null;
      const updated = prev.items.map(it => {
        if (it.ean === ean) {
          const tot = safeQty * it.final_unit_price;
          return { ...it, approved_qty: safeQty, total_price: tot };
        }
        return it;
      });

      const totalReq = updated.reduce((acc, i) => acc + i.requested_qty, 0);
      const totalFul = updated.reduce((acc, i) => acc + i.approved_qty, 0);
      const subtotal = updated.reduce((acc, i) => acc + i.total_price, 0);

      return {
        ...prev,
        items: updated,
        summary: {
          ...prev.summary,
          total_fulfilled_units: totalFul,
          subtotal_estimated: subtotal,
          fill_rate_percent: totalReq > 0 ? Math.round((totalFul / totalReq) * 100) : 100
        }
      };
    });
  };

  const handleFinalize = async (action: 'HORUS_ORDER' | 'PROPOSAL') => {
    if (!selectedCustomerId) {
      toast.error('Cliente não selecionado.');
      return;
    }

    const itemsToSubmit = (analysisResult?.items || draftItems).map(it => ({
      ean: it.ean,
      quantity: 'approved_qty' in it ? it.approved_qty : it.quantity,
      custom_price: 'unit_price' in it ? it.unit_price : undefined,
      custom_discount: 'discount_percent' in it ? it.discount_percent : undefined
    })).filter(i => i.quantity > 0);

    if (itemsToSubmit.length === 0) {
      toast.error('Nenhum item com quantidade aprovada para finalizar.');
      return;
    }

    setIsFinalizing(true);
    const loadingToast = toast.loading(
      action === 'HORUS_ORDER' 
        ? 'Transmitindo pedido de venda/consignação para o Horus ERP...' 
        : 'Gerando proposta comercial com assinatura digital...'
    );

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/intake/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action,
          customer_id: Number(selectedCustomerId),
          operation_type: operationType,
          items: itemsToSubmit,
          title: `Orçamento Mesa Comercial - ${customer?.corporate_name || customer?.name || 'Cliente'}`,
          payment_method: paymentMethod,
          payment_condition: paymentCondition,
          shipping_cost: shippingCost,
          global_discount: globalDiscount,
          notes: proposalNotes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Falha ao finalizar.');
      }

      toast.success(data.message, { id: loadingToast });

      if (action === 'PROPOSAL' && data.redirect_url) {
        router.push(data.redirect_url);
      } else if (action === 'HORUS_ORDER' && data.order_id) {
        router.push(`/orders/${data.order_id}`);
      } else {
        router.push('/orders');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao finalizar pedido.', { id: loadingToast });
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link 
              href="/orders" 
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-xs font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              Mesa de Entrada & Análise
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            Mesa de Análise de Pedidos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Ingestão multicanal (Planilhas, PDFs, WhatsApp/E-mails), checagem em tempo real no Hórus ERP e sugestões de giro.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleFetchSuggestions}
            disabled={!selectedCustomerId || loadingSuggestions}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/20 hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>Sugestões Inteligentes</span>
          </button>
        </div>
      </div>

      {/* Grid: Cliente & Tipo de Operação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card Cliente */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600" />
              1. Seleção do Cliente & Vínculo ERP
            </h2>
            {customer && (
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                CNPJ/CPF: {customer.document || 'Não informado'}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Cliente (Razão Social ou Nome Fantasia)
            </label>
            <CustomerAutocomplete
              value={selectedCustomerId}
              onChange={handleCustomerChange}
              placeholder="Digite o nome, razão social ou CNPJ..."
            />
          </div>

          {customer && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase font-semibold block">Limite Crédito</span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.credit_limit || 0)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase font-semibold block">Débitos em Aberto</span>
                <span className={`text-sm font-bold ${(customer.open_debts || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.open_debts || 0)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase font-semibold block">Desconto Base</span>
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  {customer.discount || 0}%
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 uppercase font-semibold block">Código Horus</span>
                <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
                  {customer.horus_id || customer.id_guid ? 'Sincronizado' : 'Não vinculado'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Card Tipo de Operação */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-3">
              Tipo de Movimentação
            </h2>
            <p className="text-xs text-slate-500 mt-2">
              Determina se os itens faturam estoque definitivo ou alimentam o saldo de consignação do cliente.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setOperationType('V');
                  setAnalysisResult(null);
                }}
                className={`p-3 rounded-xl border text-center transition-all ${
                  operationType === 'V'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-500 font-bold ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <DollarSign className="w-5 h-5 mx-auto mb-1 text-indigo-600" />
                <span className="text-xs block font-bold">Venda Direta</span>
                <span className="text-[10px] text-slate-400">Faturamento Real</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOperationType('C');
                  setAnalysisResult(null);
                }}
                className={`p-3 rounded-xl border text-center transition-all ${
                  operationType === 'C'
                    ? 'border-amber-600 bg-amber-50/70 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-500 font-bold ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Package className="w-5 h-5 mx-auto mb-1 text-amber-600" />
                <span className="text-xs block font-bold">Consignação</span>
                <span className="text-[10px] text-slate-400">Remessa em Posse</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
            {operationType === 'V'
              ? '✔️ Regras de Venda: valida estoque livre e gera faturamento.'
              : '⚠️ Regras de Consignação: bloqueia títulos com estoque crítico se configurado.'}
          </div>
        </div>
      </div>

      {/* Step 2: Intake Hub (Tabs de Origem) */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              2. Origem dos Pedidos (Ingestão Inteligente)
            </h2>
            <p className="text-xs text-slate-500">
              Escolha de onde importar os itens do cliente. O sistema detecta ISBNs e quantidades automaticamente.
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIntakeTab('text')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                intakeTab === 'text'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp / E-mail
            </button>
            <button
              type="button"
              onClick={() => setIntakeTab('file')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                intakeTab === 'file'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Planilha / PDF
            </button>
            <button
              type="button"
              onClick={() => setIntakeTab('manual')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                intakeTab === 'manual'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Manual
            </button>
          </div>
        </div>

        {/* Tab 1: Text / WhatsApp Paste */}
        {intakeTab === 'text' && (
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Cole o corpo do e-mail ou mensagem de WhatsApp (ex: &quot;9788535902778 - 5 un&quot; ou &quot;ISBN 9786555600000 qtd 10&quot;):
            </label>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Cole aqui a mensagem recebida pelo cliente..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleParseText}
                disabled={parsing || !rawText.trim()}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Extrair e Adicionar Itens
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: File Upload (Excel or PDF) */}
        {intakeTab === 'file' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-indigo-400 transition-colors bg-slate-50/50 dark:bg-slate-950/30">
              <Upload className="w-10 h-10 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Arraste ou clique para selecionar a Planilha (.xlsx, .csv) ou Pedido (.pdf)
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Limite máximo permitido: <strong>10 MB</strong> por arquivo.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="mt-4 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/30 dark:file:text-indigo-300"
              />
            </div>
            {selectedFile && (
              <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-3 rounded-xl">
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={handleParseFile}
                  disabled={parsing}
                  className="px-4 py-2 rounded-lg font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Processar Arquivo
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Manual Input */}
        {intakeTab === 'manual' && (
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 space-y-1 w-full">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                ISBN / Código de Barras
              </label>
              <input
                type="text"
                value={manualEan}
                onChange={(e) => setManualEan(e.target.value)}
                placeholder="Ex: 9788535902778"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
            <div className="w-full sm:w-32 space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Qtd
              </label>
              <input
                type="number"
                min={1}
                value={manualQty}
                onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
            <button
              type="button"
              onClick={handleAddManualItem}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
          </div>
        )}

        {/* Preview da Lista Preliminar */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Itens Carregados ({draftItems.length})
            </span>
            {draftItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDraftItems([]);
                  setAnalysisResult(null);
                }}
                className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
              >
                Limpar Todos
              </button>
            )}
          </div>

          {draftItems.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20">
              Nenhum item carregado ainda. Use uma das abas acima para importar.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
              {draftItems.map(item => (
                <span
                  key={item.ean}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xs"
                >
                  <span className="font-bold">{item.ean}</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">x{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDraftItem(item.ean)}
                    className="text-slate-400 hover:text-rose-500 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Trigger Full Analysis Button */}
          {draftItems.length > 0 && (
            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={isAnalysing || !selectedCustomerId}
                className="px-6 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 active:scale-98 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isAnalysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>Executar Análise Comercial & Checar Estoque ERP</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Analysis Results Table & Diagnostics */}
      {analysisResult && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Unidades Pedidas</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">
                {analysisResult.summary.total_requested_units}
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Unidades Aprovadas</span>
              <span className={`text-2xl font-black mt-1 block ${
                analysisResult.summary.fill_rate_percent === 100 
                  ? 'text-emerald-600 dark:text-emerald-400' 
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {analysisResult.summary.total_fulfilled_units}
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Fill Rate (Atendimento)</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {analysisResult.summary.fill_rate_percent}%
                </span>
                {analysisResult.summary.fill_rate_percent === 100 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Subtotal Estimado</span>
              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(analysisResult.summary.subtotal_estimated)}
              </span>
            </div>
          </div>

          {/* Table Container (Mobile First Overflow-X) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Itens Analisados ({analysisResult.items.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Verifique os saldos no Hórus, histórico de vendas do cliente e ajuste as quantidades aprovadas.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Diagnóstico</th>
                    <th className="py-3 px-4">Título / ISBN</th>
                    <th className="py-3 px-4 text-center">Saldo ERP</th>
                    <th className="py-3 px-4 text-center">Giro 60d</th>
                    <th className="py-3 px-4 text-center">Pedida</th>
                    <th className="py-3 px-4 text-center">Aprovada</th>
                    <th className="py-3 px-4 text-right">Unitário</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analysisResult.items.map(item => {
                    const badgeStyles = {
                      OK: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
                      PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
                      OUT_OF_STOCK: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
                      CONSIGN_BLOCKED: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
                      NOT_FOUND: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                    }[item.situation] || 'bg-slate-100 text-slate-700';

                    return (
                      <tr key={item.ean} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeStyles}`}>
                            {item.situation_label}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-bold text-slate-900 dark:text-white truncate" title={item.title}>
                            {item.title}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                            <span>{item.ean}</span>
                            <span>•</span>
                            <span className="truncate max-w-[120px]">{item.publisher}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className={`font-bold ${item.available_stock > 0 ? 'text-slate-800 dark:text-slate-200' : 'text-rose-600 font-extrabold'}`}>
                            {item.available_stock}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            {item.customer_last_60d_sold} un
                          </div>
                          {item.customer_last_sale_date && (
                            <div className="text-[10px] text-slate-400">
                              {item.customer_last_sale_date}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-bold font-mono text-slate-600 dark:text-slate-300">
                          {item.requested_qty}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="number"
                            min={0}
                            value={item.approved_qty}
                            onChange={(e) => handleUpdateApprovedQty(item.ean, parseInt(e.target.value) || 0)}
                            className="w-16 text-center rounded-lg border border-slate-200 bg-white py-1 px-2 font-mono font-bold text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.final_unit_price)}
                          </div>
                          {item.discount_percent > 0 && (
                            <div className="text-[10px] text-indigo-600 font-semibold">
                              -{item.discount_percent}%
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftItem(item.ean)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                            title="Remover Item"
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
          </div>

          {/* Decision & Finalization Action Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-600" />
              4. Fechamento Comercial & Destino do Pedido
            </h3>

            {/* Financial Adjustments with CurrencyInput */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Frete (R$)
                </label>
                <CurrencyInput
                  value={shippingCost}
                  onChangeValue={(val) => setShippingCost(val || 0)}
                  prefixStr="R$ "
                  placeholder="R$ 0,00"
                  className="w-full text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Desconto Global (%)
                </label>
                <CurrencyInput
                  value={globalDiscount}
                  onChangeValue={(val) => setGlobalDiscount(val || 0)}
                  suffixStr="%"
                  max={100}
                  placeholder="0,00%"
                  className="w-full text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Forma de Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto Bancário</option>
                  <option value="CARTAO">Cartão de Crédito</option>
                  <option value="FATURADO">Faturado / Prazo</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Condição de Pagamento
                </label>
                <input
                  type="text"
                  value={paymentCondition}
                  onChange={(e) => setPaymentCondition(e.target.value)}
                  placeholder="Ex: 30/60 DDL"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Proposal Notes */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Observações do Pedido / Proposta
              </label>
              <textarea
                rows={2}
                value={proposalNotes}
                onChange={(e) => setProposalNotes(e.target.value)}
                placeholder="Observações internas ou recado para o cliente..."
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>

            {/* Action Buttons: Horus ERP Direct or Commercial Proposal */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleFinalize('PROPOSAL')}
                disabled={isFinalizing}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <FileSignature className="w-4 h-4" />
                <span>Converter em Proposta Comercial (Assinatura Digital)</span>
              </button>

              <button
                type="button"
                onClick={() => handleFinalize('HORUS_ORDER')}
                disabled={isFinalizing}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Aprovar & Transmitir Pedido para o Horus ERP</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer / Modal: Smart Suggestions */}
      {suggestionsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-orange-600">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Sugestões Inteligentes de Venda (BI Horus)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Itens que o cliente vendeu recentemente nos últimos 60 dias ou lançamentos com estoque.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSuggestionsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {loadingSuggestions ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                <span className="text-xs text-slate-500">Minerando histórico de compras no BI...</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 1. O que o cliente esqueceu de pedir */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Mais Vendidos pelo Cliente (Últimos 60 dias)
                  </h4>
                  {suggestions.replacement_suggestions.length === 0 ? (
                    <div className="text-xs text-slate-400 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                      Nenhum histórico recente de compras encontrado para este cliente.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.replacement_suggestions.map(sug => (
                        <div
                          key={sug.ean}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:border-orange-400 transition-colors"
                        >
                          <div className="flex-1 pr-3">
                            <span className="font-bold text-xs text-slate-900 dark:text-white block truncate">
                              {sug.title}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                              <span>ISBN: {sug.ean}</span>
                              <span>•</span>
                              <span>Estoque ERP: <strong>{sug.available_stock}</strong></span>
                              <span>•</span>
                              <span className="text-emerald-600 font-bold">{sug.reason}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddSuggestion(sug)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-1 shadow-xs transition-colors shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Lançamentos com Estoque */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Lançamentos Recentes no Catálogo
                  </h4>
                  {suggestions.new_releases.length === 0 ? (
                    <div className="text-xs text-slate-400 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                      Nenhum lançamento em destaque encontrado no momento.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.new_releases.map(rel => (
                        <div
                          key={rel.ean}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:border-indigo-400 transition-colors"
                        >
                          <div className="flex-1 pr-3">
                            <span className="font-bold text-xs text-slate-900 dark:text-white block truncate">
                              {rel.title}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                              <span>ISBN: {rel.ean}</span>
                              <span>•</span>
                              <span>Estoque: <strong>{rel.available_stock}</strong></span>
                              <span>•</span>
                              <span>R$ {rel.price.toFixed(2)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddSuggestion(rel)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1 shadow-xs transition-colors shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}