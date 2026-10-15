'use client';

import React, { useState, useMemo } from 'react';
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
  Info,
  Maximize2,
  Minimize2,
  Search,
  Scale,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Percent,
  RotateCcw,
  BookOpen
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
  subject?: string;
  requested_qty: number;
  approved_qty: number;
  unit_price: number;
  discount_percent: number;
  final_unit_price: number;
  total_price: number;
  available_stock: number;
  consigned_balance: number;
  box_units?: number;
  general_sales_365?: number;
  general_sales_x?: number;
  situation: 'OK' | 'PARTIAL' | 'OUT_OF_STOCK' | 'CONSIGN_BLOCKED' | 'NOT_FOUND';
  situation_label: string;
  tab_category?: 'pedido' | 'novidades' | 'reposicao' | 'fundo';
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

  // Step 2: Intake Source Tabs & Drawer (Inicia fechada com foco na grade como no DBM)
  const [isIntakeOpen, setIsIntakeOpen] = useState(false);
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

  // Access Grid UI Controls
  const [activeCommercialTab, setActiveCommercialTab] = useState<'pedido' | 'novidades' | 'reposicao' | 'fundo'>('pedido');
  const [clientSalesDays, setClientSalesDays] = useState<number>(30);
  const [generalSalesDays, setGeneralSalesDays] = useState<number>(90);
  const [isGridMaximized, setIsGridMaximized] = useState(false);
  const [selectedRowEan, setSelectedRowEan] = useState<string | null>(null);
  const [gridSearch, setGridSearch] = useState('');
  const [situationFilter, setSituationFilter] = useState<'ALL' | 'OK' | 'PARTIAL' | 'OUT_OF_STOCK'>('ALL');
  const [showDiscountInGrid, setShowDiscountInGrid] = useState<boolean>(true);

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
      if (data.items && data.items.length > 0) {
        setSelectedRowEan(data.items[0].ean);
      }
      setIsIntakeOpen(false); // Recolhe para dar foco total à grade Access
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

  const handleUpdateDiscount = (ean: string, newDiscount: number) => {
    if (!analysisResult) return;
    const safeDisc = Math.min(100, Math.max(0, newDiscount));
    setAnalysisResult(prev => {
      if (!prev) return null;
      const updated = prev.items.map(it => {
        if (it.ean === ean) {
          const finalUnit = it.unit_price * (1 - safeDisc / 100);
          const tot = it.approved_qty * finalUnit;
          return { 
            ...it, 
            discount_percent: safeDisc, 
            final_unit_price: finalUnit, 
            total_price: tot 
          };
        }
        return it;
      });

      const subtotal = updated.reduce((acc, i) => acc + i.total_price, 0);

      return {
        ...prev,
        items: updated,
        summary: {
          ...prev.summary,
          subtotal_estimated: subtotal
        }
      };
    });
  };

  const handleApplyGlobalDiscount = (discount: number) => {
    const clamped = Math.min(100, Math.max(0, discount));
    setGlobalDiscount(clamped);
    if (!analysisResult) return;

    setAnalysisResult(prev => {
      if (!prev) return null;
      const updated = prev.items.map(it => {
        const finalUnit = it.unit_price * (1 - clamped / 100);
        const tot = it.approved_qty * finalUnit;
        return {
          ...it,
          discount_percent: clamped,
          final_unit_price: finalUnit,
          total_price: tot
        };
      });
      const subtotal = updated.reduce((acc, i) => acc + i.total_price, 0);
      return {
        ...prev,
        items: updated,
        summary: {
          ...prev.summary,
          subtotal_estimated: subtotal
        }
      };
    });
  };

  // Keyboard Navigation estilo Access: Setas Up/Down, Enter e Tab
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: 'discount' | 'qty',
    totalRows: number
  ) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextIndex = (rowIndex + 1) % totalRows;
      const nextInput = document.getElementById(`cell-${field}-${nextIndex}`) as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (rowIndex - 1 + totalRows) % totalRows;
      const prevInput = document.getElementById(`cell-${field}-${prevIndex}`) as HTMLInputElement | null;
      if (prevInput) {
        prevInput.focus();
        prevInput.select();
      }
    } else if (e.key === 'ArrowRight' && field === 'discount') {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        const qtyInput = document.getElementById(`cell-qty-${rowIndex}`) as HTMLInputElement | null;
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }
    } else if (e.key === 'ArrowLeft' && field === 'qty') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        const discountInput = document.getElementById(`cell-discount-${rowIndex}`) as HTMLInputElement | null;
        if (discountInput) {
          discountInput.focus();
          discountInput.select();
        }
      }
    }
  };

  // ── 4 Abas Comerciais: Mock e Catálogo Complementar (Idêntico ao DBM) ────
  const [catalogItems, setCatalogItems] = useState<AnalysedItem[]>([
    // Novidades
    {
      ean: '9786588439128',
      title: 'Lançamento: O Algoritmo da Consciência Humana',
      publisher: 'Editora Cronuz Books',
      subject: 'Tecnologia / Filosofia',
      unit_price: 69.90,
      discount_percent: 50.0,
      final_unit_price: 34.95,
      requested_qty: 0,
      approved_qty: 0,
      total_price: 0,
      available_stock: 400,
      consigned_balance: 0,
      box_units: 20,
      general_sales_365: 640,
      general_sales_x: 180,
      situation: 'OK',
      situation_label: 'Disponível',
      tab_category: 'novidades',
      notes: 'Lançamento com alto giro de mercado',
      customer_last_60d_sold: 0,
      customer_last_60d_returned: 0,
      customer_last_sale_date: null
    },
    {
      ean: '9786588439135',
      title: 'Lançamento: Guia Prático de Gestão Editorial 2026',
      publisher: 'Editora Cronuz Books',
      subject: 'Negócios / Editorial',
      unit_price: 84.00,
      discount_percent: 50.0,
      final_unit_price: 42.00,
      requested_qty: 0,
      approved_qty: 0,
      total_price: 0,
      available_stock: 180,
      consigned_balance: 0,
      box_units: 15,
      general_sales_365: 320,
      general_sales_x: 95,
      situation: 'OK',
      situation_label: 'Disponível',
      tab_category: 'novidades',
      notes: 'Lançamento editorial recente',
      customer_last_60d_sold: 0,
      customer_last_60d_returned: 0,
      customer_last_sale_date: null
    },
    {
      ean: '9786559210459',
      title: 'Inteligência Artificial Aplicada ao Varejo',
      publisher: 'Alta Books',
      subject: 'Negócios / IA',
      unit_price: 92.00,
      discount_percent: 50.0,
      final_unit_price: 46.00,
      requested_qty: 0,
      approved_qty: 0,
      total_price: 0,
      available_stock: 120,
      consigned_balance: 0,
      box_units: 12,
      general_sales_365: 890,
      general_sales_x: 240,
      situation: 'OK',
      situation_label: 'Disponível',
      tab_category: 'novidades',
      notes: 'Tendência de mercado e vendas',
      customer_last_60d_sold: 0,
      customer_last_60d_returned: 0,
      customer_last_sale_date: null
    },
    // Reposição
    {
      ean: '9788576572008',
      title: 'Duna (Edição Especial)',
      publisher: 'Aleph',
      subject: 'Ficção Científica',
      unit_price: 119.00,
      discount_percent: 50.0,
      final_unit_price: 59.50,
      requested_qty: 0,
      approved_qty: 0,
      total_price: 0,
      available_stock: 95,
      consigned_balance: 18,
      box_units: 10,
      general_sales_365: 1420,
      general_sales_x: 310,
      situation: 'OK',
      situation_label: 'Disponível',
      tab_category: 'reposicao',
      notes: 'Cliente vendeu 35 un nos últimos dias configurados',
      customer_last_60d_sold: 35,
      customer_last_60d_returned: 0,
      customer_last_sale_date: '05/10/2026'
    },
    {
      ean: '9788535914848',
      title: '1984 (Edição Comemorativa)',
      publisher: 'Companhia das Letras',
      subject: 'Ficção / Distopia',
      unit_price: 64.90,
      discount_percent: 50.0,
      final_unit_price: 32.45,
      requested_qty: 0,
      approved_qty: 0,
      total_price: 0,
      available_stock: 210,
      consigned_balance: 10,
      box_units: 25,
      general_sales_365: 2950,
      general_sales_x: 580,
      situation: 'OK',
      situation_label: 'Disponível',
      tab_category: 'reposicao',
      notes: 'Giro alto recorrente no cliente',
      customer_last_60d_sold: 28,
      customer_last_60d_returned: 0,
      customer_last_sale_date: '02/10/2026'
    },
    // Fundo de Catálogo
    {
      ean: '9788520921004',
      title: 'Grande Sertão: Veredas',
      publisher: 'Companhia das Letras',
      subject: 'Literatura Brasileira',
      unit_price: 94.90,
      discount_percent: 45.0,
      final_unit_price: 52.19,
      requested_qty: 0,
      approved_qty: 0,
      total_price: 0,
      available_stock: 64,
      consigned_balance: 4,
      box_units: 12,
      general_sales_365: 820,
      general_sales_x: 140,
      situation: 'OK',
      situation_label: 'Disponível',
      tab_category: 'fundo',
      notes: 'Clássico fundamental de acervo',
      customer_last_60d_sold: 6,
      customer_last_60d_returned: 0,
      customer_last_sale_date: '15/09/2026'
    },
    {
      ean: '9788535908053',
      title: 'Dom Casmurro (Edição Crítica de Bolso)',
      publisher: 'Companhia das Letras',
      subject: 'Literatura Brasileira',
      unit_price: 49.90,
      discount_percent: 50.0,
      final_unit_price: 24.95,
      requested_qty: 0,
      approved_qty: 0,
      total_price: 0,
      available_stock: 310,
      consigned_balance: 0,
      box_units: 30,
      general_sales_365: 3800,
      general_sales_x: 720,
      situation: 'OK',
      situation_label: 'Disponível',
      tab_category: 'fundo',
      notes: 'Indicação perene em vestibulares',
      customer_last_60d_sold: 14,
      customer_last_60d_returned: 0,
      customer_last_sale_date: '20/09/2026'
    }
  ]);

  const handleAddCatalogItemToOrder = (item: AnalysedItem) => {
    const existingInAnalysis = analysisResult?.items.some(i => i.ean === item.ean);
    const approved = Math.min(5, item.available_stock);
    const unitPrice = item.unit_price;
    const disc = item.discount_percent || 0;
    const finalUnit = unitPrice * (1 - disc / 100);
    const tot = approved * finalUnit;

    const newItem: AnalysedItem = {
      ...item,
      requested_qty: 5,
      approved_qty: approved,
      total_price: tot,
      situation: approved === 0 ? 'OUT_OF_STOCK' : approved < 5 ? 'PARTIAL' : 'OK',
      situation_label: approved === 0 ? 'Sem Estoque' : approved < 5 ? 'Atendimento Parcial' : 'Reservado Total',
      tab_category: 'pedido'
    };

    if (analysisResult) {
      setAnalysisResult(prev => {
        if (!prev) return null;
        const exists = prev.items.some(i => i.ean === item.ean);
        const updated = exists 
          ? prev.items.map(i => i.ean === item.ean ? { ...i, requested_qty: i.requested_qty + 5, approved_qty: i.approved_qty + approved, total_price: (i.approved_qty + approved) * i.final_unit_price } : i)
          : [...prev.items, newItem];
        
        const totalReq = updated.reduce((acc, i) => acc + i.requested_qty, 0);
        const totalFul = updated.reduce((acc, i) => acc + i.approved_qty, 0);
        const subtotal = updated.reduce((acc, i) => acc + i.total_price, 0);

        return {
          ...prev,
          items: updated,
          summary: {
            ...prev.summary,
            total_requested_units: totalReq,
            total_fulfilled_units: totalFul,
            subtotal_estimated: subtotal,
            fill_rate_percent: totalReq > 0 ? Math.round((totalFul / totalReq) * 100) : 100
          }
        };
      });
    } else {
      setDraftItems(prev => {
        const exists = prev.find(i => i.ean === item.ean);
        if (exists) {
          return prev.map(i => i.ean === item.ean ? { ...i, quantity: i.quantity + 5 } : i);
        }
        return [...prev, { ean: item.ean, quantity: 5 }];
      });
    }

    toast.success(`"${item.title.substring(0, 30)}..." adicionado ao pedido!`);
    setActiveCommercialTab('pedido');
  };

  const tabItemCount = (tab: 'pedido' | 'novidades' | 'reposicao' | 'fundo') => {
    if (tab === 'pedido') {
      return analysisResult?.items ? analysisResult.items.length : draftItems.length;
    }
    return catalogItems.filter(i => i.tab_category === tab).length;
  };

  // Filtered Items for Access Grid (Baseado na aba selecionada)
  const filteredAnalysisItems = useMemo(() => {
    let sourceItems: AnalysedItem[] = [];
    if (activeCommercialTab === 'pedido') {
      sourceItems = analysisResult?.items || [];
    } else {
      sourceItems = catalogItems.filter(i => i.tab_category === activeCommercialTab);
    }

    return sourceItems.filter(item => {
      if (situationFilter !== 'ALL') {
        if (situationFilter === 'OK' && item.situation !== 'OK') return false;
        if (situationFilter === 'PARTIAL' && item.situation !== 'PARTIAL') return false;
        if (situationFilter === 'OUT_OF_STOCK' && (item.situation !== 'OUT_OF_STOCK' && item.situation !== 'NOT_FOUND')) return false;
      }
      if (gridSearch.trim()) {
        const q = gridSearch.toLowerCase();
        return item.title.toLowerCase().includes(q) ||
               item.ean.includes(q) ||
               item.publisher.toLowerCase().includes(q);
      }
      return true;
    });
  }, [analysisResult, catalogItems, activeCommercialTab, situationFilter, gridSearch]);

  const minOrderValue = customer?.min_order_total || customer?.minOrderValue || 0;
  const subtotalNet = analysisResult?.summary.subtotal_estimated || 0;
  const isMinOrderReached = minOrderValue > 0 ? subtotalNet >= minOrderValue : true;
  const diffToMin = Math.max(0, minOrderValue - subtotalNet);

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
    <div className="w-full max-w-full space-y-2.5 font-sans">
      
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1. BARRA DE COMANDO SUPERIOR ESTILO ACCESS (Compacta e Direta)        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        
        {/* Esquerda: Voltar + Título + Autocomplete de Cliente */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Link 
            href="/orders" 
            title="Voltar para Central de Pedidos"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          
          <div className="shrink-0">
            <h1 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
              Análise de Pedidos
            </h1>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block shrink-0" />

          {/* Autocomplete do Cliente em formato compacto de barra */}
          <div className="flex-1 max-w-md min-w-[240px]">
            <CustomerAutocomplete
              value={selectedCustomerId}
              onChange={handleCustomerChange}
              placeholder="🔍 Selecione o Cliente (Nome, Razão Social ou CNPJ)..."
            />
          </div>
        </div>

        {/* Direita: Tipo Movimentação + Toggle Entrada + Sugestões */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          
          {/* Seletor Compacto Venda Direta / Consignação */}
          <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => { setOperationType('V'); setAnalysisResult(null); }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                operationType === 'V'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Venda</span>
            </button>
            <button
              type="button"
              onClick={() => { setOperationType('C'); setAnalysisResult(null); }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                operationType === 'C'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Consignação</span>
            </button>
          </div>

          {/* Botão de Toggle da Gaveta de Ingestão de Itens */}
          <button
            type="button"
            onClick={() => setIsIntakeOpen(!isIntakeOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs ${
              isIntakeOpen 
                ? 'bg-indigo-600 text-white border-indigo-600' 
                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Origem Pedido</span>
            <span className="text-[10px] font-mono opacity-80">({draftItems.length})</span>
            {isIntakeOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {/* Botão Sugestões Inteligentes */}
          <button
            type="button"
            onClick={handleFetchSuggestions}
            disabled={!selectedCustomerId || loadingSuggestions}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs hover:brightness-105 active:scale-95 transition-all disabled:opacity-50"
            title="Sugestões de giro e lançamentos no BI"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sugestões BI</span>
          </button>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 2. BARRA DE STATUS DO CLIENTE (Faixa Densa Estilo ERP)                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {customer && (
        <div className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cliente:</span>
              <span className="truncate max-w-[200px] sm:max-w-xs">{customer.corporate_name || customer.name}</span>
            </div>

            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
              <span className="text-[10px] uppercase font-bold text-slate-400 font-sans">Doc:</span>
              <span>{customer.document || 'Não informado'}</span>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-[10px] uppercase font-bold text-slate-400">Limite:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.credit_limit || customer.creditLimit || 0)}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-[10px] uppercase font-bold text-slate-400">Débitos:</span>
              <span className={`font-mono font-bold ${(customer.open_debts || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.open_debts || 0)}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-[10px] uppercase font-bold text-slate-400">Desc. Base:</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {customer.discount || 0}%
              </span>
            </div>

            {minOrderValue > 0 && (
              <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                <Scale className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[10px] font-bold uppercase text-indigo-900 dark:text-indigo-300">Ped. Mín:</span>
                <span className="font-bold text-indigo-950 dark:text-white font-mono">
                  {minOrderValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className={`text-[9px] font-black px-1 rounded ${
                  isMinOrderReached ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {isMinOrderReached ? '✓ OK' : 'PENDENTE'}
                </span>
              </div>
            )}
          </div>

          <div className="text-[10px] font-mono text-slate-400">
            {customer.horus_id || customer.id_guid ? '✓ Horus ERP Conectado' : 'Base Local'}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 3. GAVETA RETRÁTIL DE IMPORTAÇÃO INTELIGENTE (EXCEL, PDF, TEXTO)     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isIntakeOpen && (
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 shadow-md animate-in slide-in-from-top-2 duration-150 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Importar Itens do Pedido (Captura Automática de ISBNs & Quantidades)</span>
            </div>

            {/* Alternador de Origem */}
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIntakeTab('text')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeTab === 'text' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ✉️ E-mail / Texto
              </button>
              <button
                type="button"
                onClick={() => setIntakeTab('file')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeTab === 'file' ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📊 Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setIntakeTab('manual')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeTab === 'manual' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ✍️ Digitação Manual
              </button>
            </div>
          </div>

          {/* Tab 1: Texto / WhatsApp / E-mail */}
          {intakeTab === 'text' && (
            <textarea
              rows={3}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Cole aqui o e-mail, mensagem de WhatsApp ou tabela copiada com ISBNs e quantidades..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          )}

          {/* Tab 2: Excel / PDF */}
          {intakeTab === 'file' && (
            <div className="border border-dashed border-emerald-300 dark:border-emerald-800 rounded-lg p-3 text-center bg-emerald-50/20">
              <input type="file" accept=".xlsx,.xls,.csv,.pdf" id="excel-file-intake" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              <label htmlFor="excel-file-intake" className="cursor-pointer text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)` : 'Clique para selecionar arquivo de pedido (Excel ou PDF)'}
              </label>
            </div>
          )}

          {/* Tab 3: Digitação Manual */}
          {intakeTab === 'manual' && (
            <div className="flex flex-col sm:flex-row items-end gap-2.5 bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex-1 space-y-1 w-full">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  ISBN / Código de Barras
                </label>
                <input
                  type="text"
                  value={manualEan}
                  onChange={(e) => setManualEan(e.target.value)}
                  placeholder="Ex: 9788535902778"
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <div className="w-full sm:w-28 space-y-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Qtd
                </label>
                <input
                  type="number"
                  min={1}
                  value={manualQty}
                  onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
              <button
                type="button"
                onClick={handleAddManualItem}
                className="w-full sm:w-auto px-4 py-2 rounded-lg font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </div>
          )}

          {/* Lista de Itens Carregados (exibida apenas quando houver itens) */}
          {draftItems.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Itens na Entrada ({draftItems.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraftItems([]);
                    setAnalysisResult(null);
                  }}
                  className="text-[11px] text-rose-500 hover:text-rose-700 font-semibold"
                >
                  Limpar Todos
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-slate-50 dark:bg-slate-950/40 rounded-lg border border-slate-100 dark:border-slate-800">
                {draftItems.map(item => (
                  <span
                    key={item.ean}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs"
                  >
                    <span className="font-bold">{item.ean}</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">x{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDraftItem(item.ean)}
                      className="text-slate-400 hover:text-rose-500 ml-1 text-xs"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              A inteligência analisa os ISBNs, consulta estoque físico no Horus, vendas do cliente e vendas gerais.
            </span>
            <div className="flex items-center gap-2">
              {intakeTab === 'file' && selectedFile && (
                <button
                  type="button"
                  onClick={handleParseFile}
                  disabled={parsing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all disabled:opacity-50"
                >
                  {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Processar Arquivo
                </button>
              )}
              {intakeTab === 'text' && rawText.trim() && (
                <button
                  type="button"
                  onClick={handleParseText}
                  disabled={parsing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Extrair ISBNs
                </button>
              )}
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={isAnalysing || !selectedCustomerId || (draftItems.length === 0 && !rawText.trim())}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-all disabled:opacity-50"
              >
                {isAnalysing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                ⚡ Analisar e Carregar na Grade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 4. A GRADE COMERCIAL ESTILO ACCESS (HERO / PROTAGONISTA DA TELA)     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className={`bg-white dark:bg-slate-900 border transition-all duration-150 overflow-hidden flex flex-col ${
        isGridMaximized 
          ? 'fixed inset-2 sm:inset-3 z-50 rounded-xl border-indigo-500 shadow-2xl' 
          : 'rounded-xl border-slate-200 dark:border-slate-800 shadow-sm'
      }`}>
        
        {/* Barra 1: Toolbar de Filtros, Parâmetros e Ferramentas (Linha Superior) */}
        <div className="px-3 py-2 bg-slate-50/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          
          {/* Esquerda: Busca rápida e Filtros de Situação */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
                placeholder="Filtrar por ISBN, título, editora..."
                className="w-44 sm:w-56 pl-7 pr-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-1.5" />
            </div>

            <div className="inline-flex rounded-md p-0.5 bg-slate-200/60 dark:bg-slate-800 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setSituationFilter('ALL')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'ALL' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
              >
                Todos ({tabItemCount(activeCommercialTab)})
              </button>
              <button
                type="button"
                onClick={() => setSituationFilter('OK')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'OK' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Atendidos
              </button>
              <button
                type="button"
                onClick={() => setSituationFilter('PARTIAL')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'PARTIAL' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Parciais
              </button>
              <button
                type="button"
                onClick={() => setSituationFilter('OUT_OF_STOCK')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'OUT_OF_STOCK' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Faltas
              </button>
            </div>
          </div>

          {/* Direita da Toolbar: Parametrizações de Dias + Segurança Desconto + Maximizar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Parametrização Rápida de Vendas na Grade */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs shadow-2xs">
              <div className="flex items-center gap-1" title="Dias de histórico para vendas deste cliente">
                <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[10px] uppercase font-bold text-slate-500">VdsCli:</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={clientSalesDays}
                  onChange={(e) => setClientSalesDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-13 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1 py-0.5 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400">d</span>
              </div>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <div className="flex items-center gap-1" title="Dias de histórico para vendas gerais da distribuidora">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] uppercase font-bold text-slate-500">VdsGeral:</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={generalSalesDays}
                  onChange={(e) => setGeneralSalesDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-13 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1 py-0.5 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400">d</span>
              </div>
            </div>

            {/* Alternador de Segurança: Desconto no Grid */}
            <button
              type="button"
              onClick={() => setShowDiscountInGrid(!showDiscountInGrid)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all border shadow-2xs ${
                showDiscountInGrid 
                  ? 'bg-white hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700' 
                  : 'bg-amber-100 hover:bg-amber-200/80 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
              }`}
              title={showDiscountInGrid ? "Ocultar colunas de desconto e preço líquido no grid" : "Exibir desconto e preço líquido no grid"}
            >
              {showDiscountInGrid ? <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <EyeOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
              <span>{showDiscountInGrid ? "Desc. no Grid: Ativo" : "Desc. no Grid: Oculto"}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGridMaximized(!isGridMaximized)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all border shadow-2xs shrink-0 ${
                isGridMaximized 
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500' 
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
              }`}
              title={isGridMaximized ? "Sair da tela cheia" : "Maximizar grade estilo Access"}
            >
              {isGridMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span>{isGridMaximized ? "Sair Tela Cheia" : "Tela Cheia"}</span>
            </button>
          </div>

        </div>

        {/* Barra 2: Abas Comerciais (Idêntico ao DBM: pedido, novidades, reposição, fundo de catálogo) */}
        <div className="px-3 pt-2 bg-slate-100/70 dark:bg-slate-850/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Aba 1: pedido */}
            <button
              type="button"
              onClick={() => setActiveCommercialTab('pedido')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeCommercialTab === 'pedido'
                  ? 'bg-white dark:bg-slate-900 border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>pedido</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-mono font-black">
                {tabItemCount('pedido')}
              </span>
            </button>

            {/* Aba 2: novidades */}
            <button
              type="button"
              onClick={() => setActiveCommercialTab('novidades')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeCommercialTab === 'novidades'
                  ? 'bg-white dark:bg-slate-900 border-amber-500 dark:border-amber-400 text-amber-800 dark:text-amber-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>novidades</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono font-black">
                {tabItemCount('novidades')}
              </span>
            </button>

            {/* Aba 3: reposição */}
            <button
              type="button"
              onClick={() => setActiveCommercialTab('reposicao')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeCommercialTab === 'reposicao'
                  ? 'bg-white dark:bg-slate-900 border-emerald-600 dark:border-emerald-400 text-emerald-800 dark:text-emerald-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-emerald-500" />
              <span>reposição</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-black">
                {tabItemCount('reposicao')}
              </span>
            </button>

            {/* Aba 4: fundo de catálogo */}
            <button
              type="button"
              onClick={() => setActiveCommercialTab('fundo')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeCommercialTab === 'fundo'
                  ? 'bg-white dark:bg-slate-900 border-sky-600 dark:border-sky-400 text-sky-800 dark:text-sky-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-sky-500" />
              <span>fundo de catálogo</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-mono font-black">
                {tabItemCount('fundo')}
              </span>
            </button>
          </div>
        </div>

        {/* Tabela Densa Estilo Access com Navegação por Teclado e Seletores de Linha */}
        <div className={`overflow-x-auto overflow-y-auto transition-all ${
          isGridMaximized 
            ? 'flex-1 min-h-0' 
            : 'max-h-[calc(100vh-270px)] min-h-[380px]'
        }`}>
          <table className="w-full text-left border-collapse text-xs select-text">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-slate-200/90 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                <th className="py-2 px-2 w-9 text-center text-slate-400">#</th>
                <th className="py-2 px-2 w-20">Situação</th>
                <th className="py-2 px-2 w-32 font-mono">EAN / ISBN</th>
                <th className="py-2 px-2 min-w-[180px]">Título da Obra</th>
                <th className="py-2 px-2 w-28">Assunto</th>

                {/* Bloco Comercial Compacto */}
                <th className="py-2 px-2 text-right w-22 bg-indigo-50/40 dark:bg-indigo-950/20">Preço Capa</th>
                {showDiscountInGrid && (
                  <th className="py-2 px-2 text-right w-16 bg-indigo-50/40 dark:bg-indigo-950/20">Desc %</th>
                )}
                {showDiscountInGrid && (
                  <th className="py-2 px-2 text-right w-22 bg-indigo-50/40 dark:bg-indigo-950/20">Preço Líq.</th>
                )}
                <th className="py-2 px-2 text-center w-16 bg-indigo-50/40 dark:bg-indigo-950/20">
                  {activeCommercialTab === 'pedido' ? 'Pedida' : 'Pedir'}
                </th>
                {activeCommercialTab === 'pedido' && (
                  <th className="py-2 px-2 text-center w-20 bg-indigo-50/60 dark:bg-indigo-950/30">Aprovada</th>
                )}
                {showDiscountInGrid && (
                  <th className="py-2 px-2 text-right w-24 bg-indigo-50/40 dark:bg-indigo-950/20">Subtotal</th>
                )}

                {/* Bloco Analítico / Logístico */}
                <th className="py-2 px-2 text-center w-20">Consignado</th>
                <th className="py-2 px-2 text-center w-24 text-indigo-700 dark:text-indigo-400">
                  VdsCli ({clientSalesDays}d)
                </th>
                <th className="py-2 px-2 text-right w-20">Disponível</th>
                <th className="py-2 px-2 text-center w-16">Unid(CX)</th>
                <th className="py-2 px-2 text-center w-24">VdsGeral 365d</th>
                <th className="py-2 px-2 text-center w-24 text-emerald-700 dark:text-emerald-400">
                  VdsGeral ({generalSalesDays}d)
                </th>
                <th className="py-2 px-2 text-center w-12">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-mono text-[11px]">
              {filteredAnalysisItems.length === 0 ? (
                <tr>
                  <td colSpan={showDiscountInGrid ? 17 : 14} className="py-16 text-center text-slate-400 font-sans text-xs">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Sparkles className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                      <p className="font-semibold text-slate-600 dark:text-slate-300">
                        {activeCommercialTab === 'pedido' 
                          ? 'Nenhum pedido analisado na mesa ainda' 
                          : `Nenhum item localizado na aba ${activeCommercialTab}`}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {activeCommercialTab === 'pedido' 
                          ? 'Selecione o cliente, adicione itens na aba "Origem Pedido" acima e clique em Analisar e Carregar na Grade.' 
                          : 'Utilize os filtros acima ou altere os termos de busca.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAnalysisItems.map((item, idx) => {
                  const isSelected = selectedRowEan === item.ean;
                  const situationBadge = {
                    OK: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                    PARTIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                    OUT_OF_STOCK: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
                    CONSIGN_BLOCKED: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
                    NOT_FOUND: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                  }[item.situation] || 'bg-slate-100 text-slate-800';

                  const netPrice = item.unit_price * (1 - item.discount_percent / 100);
                  const subtotal = netPrice * (activeCommercialTab === 'pedido' ? item.approved_qty : 1);

                  return (
                    <tr
                      key={item.ean}
                      onClick={() => setSelectedRowEan(item.ean)}
                      className={`transition-colors border-b border-slate-100 dark:border-slate-800/80 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/60 ring-1 ring-inset ring-indigo-400 dark:ring-indigo-600'
                          : item.situation === 'OUT_OF_STOCK' || item.situation === 'NOT_FOUND'
                            ? 'bg-rose-50/30 dark:bg-rose-950/15 hover:bg-rose-50/60'
                            : idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-850/20 hover:bg-indigo-50/30' : 'hover:bg-indigo-50/30'
                      }`}
                    >
                      {/* Seletor de Linha Estilo Microsoft Access (▶) */}
                      <td
                        onClick={() => setSelectedRowEan(item.ean)}
                        className={`py-1.5 px-2 text-center text-xs font-sans w-9 select-none cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-indigo-600 text-white font-black' 
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title="Linha ativa (Estilo Access)"
                      >
                        {isSelected ? '▶' : idx + 1}
                      </td>

                      {/* Situação */}
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black ${situationBadge}`}>
                          {item.situation === 'OK' ? '✓ DISP.' : item.situation === 'PARTIAL' ? '⚠ PARCIAL' : item.situation === 'OUT_OF_STOCK' ? '✗ FALTA' : item.situation_label}
                        </span>
                      </td>

                      {/* EAN / ISBN */}
                      <td className="py-1.5 px-2 font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {item.ean}
                      </td>

                      {/* Título da Obra */}
                      <td className="py-1.5 px-2 font-sans font-medium text-slate-900 dark:text-white max-w-xs truncate" title={item.title}>
                        <span className="truncate block font-semibold">{item.title}</span>
                        {item.notes ? (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-mono truncate">
                            ↳ {item.notes}
                          </span>
                        ) : (
                          <span className="block text-[10px] text-slate-500 font-mono truncate">
                            {item.publisher}
                          </span>
                        )}
                      </td>

                      {/* Assunto */}
                      <td className="py-1.5 px-2 font-sans text-[11px] truncate max-w-[120px]" title={item.subject || 'Geral'}>
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-full">
                          {item.subject || 'Catálogo'}
                        </span>
                      </td>

                      {/* Preço Capa */}
                      <td className="py-1.5 px-2 text-right text-slate-600 dark:text-slate-400 font-mono bg-indigo-50/20 dark:bg-indigo-950/10">
                        {item.unit_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      {/* Desconto % Editável com atalho de teclado */}
                      {showDiscountInGrid && (
                        <td className="py-1.5 px-2 text-right bg-indigo-50/20 dark:bg-indigo-950/10">
                          {activeCommercialTab === 'pedido' ? (
                            <input
                              id={`cell-discount-${idx}`}
                              type="number"
                              value={item.discount_percent}
                              min={0}
                              max={100}
                              step={0.5}
                              onFocus={(e) => {
                                e.currentTarget.select();
                                setSelectedRowEan(item.ean);
                              }}
                              onKeyDown={(e) => handleCellKeyDown(e, idx, 'discount', filteredAnalysisItems.length)}
                              onChange={(e) => handleUpdateDiscount(item.ean, parseFloat(e.target.value) || 0)}
                              className="w-14 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-0.5 text-right text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                            />
                          ) : (
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{item.discount_percent}%</span>
                          )}
                        </td>
                      )}

                      {/* Preço Líquido */}
                      {showDiscountInGrid && (
                        <td className="py-1.5 px-2 text-right font-bold text-slate-900 dark:text-white font-mono bg-indigo-50/20 dark:bg-indigo-950/10">
                          {netPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      )}

                      {/* Qtd Pedida / Botão Pedir */}
                      <td className="py-1.5 px-2 text-center bg-indigo-50/20 dark:bg-indigo-950/10">
                        {activeCommercialTab === 'pedido' ? (
                          <span className="font-bold text-slate-900 dark:text-white">{item.requested_qty}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddCatalogItemToOrder(item)}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border dark:border-indigo-800 text-[11px] font-bold transition-all shadow-2xs"
                            title="Adicionar à proposta/pedido"
                          >
                            + Pedir
                          </button>
                        )}
                      </td>

                      {/* Qtd Aprovada Editável com atalho de teclado */}
                      {activeCommercialTab === 'pedido' && (
                        <td className="py-1.5 px-2 text-center bg-indigo-50/30 dark:bg-indigo-950/20">
                          <input
                            id={`cell-qty-${idx}`}
                            type="number"
                            value={item.approved_qty}
                            min={0}
                            onFocus={(e) => {
                              e.currentTarget.select();
                              setSelectedRowEan(item.ean);
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, 'qty', filteredAnalysisItems.length)}
                            onChange={(e) => handleUpdateApprovedQty(item.ean, parseInt(e.target.value) || 0)}
                            className="w-14 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 px-1 py-0.5 text-center text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                          />
                        </td>
                      )}

                      {/* Subtotal */}
                      {showDiscountInGrid && (
                        <td className="py-1.5 px-2 text-right font-black text-slate-900 dark:text-white font-mono bg-indigo-50/30 dark:bg-indigo-950/20">
                          {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      )}

                      {/* Consignado */}
                      <td className="py-1.5 px-2 text-center font-mono">
                        {item.consigned_balance > 0 ? (
                          <span 
                            className="inline-block px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-bold text-[10px]" 
                            title={`${item.consigned_balance} unidades em consignação com o cliente`}
                          >
                            {item.consigned_balance}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">0</span>
                        )}
                      </td>

                      {/* VdsCli {x}d */}
                      <td className="py-1.5 px-2 text-center font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 text-[11px] font-bold text-indigo-700 dark:text-indigo-400" title={`Vendas do cliente nos últimos ${clientSalesDays} dias`}>
                          {item.customer_last_60d_sold || 0}
                        </span>
                      </td>

                      {/* Saldo Horus / Disponível */}
                      <td className={`py-1.5 px-2 text-right font-mono font-bold ${
                        item.available_stock === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {item.available_stock}
                      </td>

                      {/* Unid(CX) */}
                      <td className="py-1.5 px-2 text-center font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                        {item.box_units || 20}
                      </td>

                      {/* VdsGeral 365d */}
                      <td className="py-1.5 px-2 text-center font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                        {(item.general_sales_365 || (item.customer_last_60d_sold * 12) || 120).toLocaleString('pt-BR')}
                      </td>

                      {/* VdsGeral {x}d */}
                      <td className="py-1.5 px-2 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-[11px]" title={`Vendas gerais da distribuidora nos últimos ${generalSalesDays} dias`}>
                          {(item.general_sales_x || (item.customer_last_60d_sold * 3) || 45).toLocaleString('pt-BR')}
                        </span>
                      </td>

                      {/* Ação */}
                      <td className="py-1.5 px-2 text-center">
                        {activeCommercialTab === 'pedido' ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftItem(item.ean)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Remover item da mesa"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddCatalogItemToOrder(item)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 text-[10px] font-bold shadow-2xs"
                            title="Adicionar item ao Pedido Comercial"
                          >
                            <Plus className="h-3 w-3" />
                            Pedir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── RODAPÉ TOTALIZADOR ESTILO ACCESS (Sempre Visível) ─────────────── */}
        <div className="p-2.5 bg-slate-100 dark:bg-slate-850 border-t border-slate-300 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          
          {/* Termômetro de Pedido Mínimo */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 shrink-0">
              <Scale className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Pedido Mínimo: {minOrderValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>

            {minOrderValue > 0 && (
              <>
                <div className="w-32 sm:w-40 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${isMinOrderReached ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (subtotalNet / (minOrderValue || 1)) * 100)}%` }}
                  />
                </div>

                <span className={`text-[11px] font-bold shrink-0 ${isMinOrderReached ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {isMinOrderReached 
                    ? '✓ Atingido!' 
                    : `Faltam ${diffToMin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                  }
                </span>
              </>
            )}
          </div>

          {/* Totais Gerais & Entrada de Desconto Global no Rodapé */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-5 shrink-0 text-right">
            <div>
              <span className="text-[10px] uppercase text-slate-400 block font-bold">Peças</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {analysisResult?.summary.total_fulfilled_units || 0} / {analysisResult?.summary.total_requested_units || 0}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase text-slate-400 block font-bold">Fill Rate</span>
              <span className={`font-mono font-bold ${
                (analysisResult?.summary.fill_rate_percent || 0) === 100 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {analysisResult?.summary.fill_rate_percent || 0}%
              </span>
            </div>

            {/* Desconto Global Rápido no Rodapé */}
            <div className="flex flex-col items-end pl-2 border-l border-slate-300 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                <Percent className="h-3 w-3" />
                Desconto Geral
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={globalDiscount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    handleApplyGlobalDiscount(val);
                  }}
                  className="w-16 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-right font-mono font-black text-xs text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  title="Digite o desconto geral para aplicar a todos os itens"
                />
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 font-mono">%</span>
              </div>
            </div>

            <div className="pl-4 border-l border-slate-300 dark:border-slate-700">
              <span className="text-[10px] uppercase text-slate-400 block font-bold">Subtotal Líquido</span>
              <span className="text-base font-mono font-black text-emerald-600 dark:text-emerald-400">
                {subtotalNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 5. FECHAMENTO COMERCIAL & DESTINO DO PEDIDO                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {analysisResult && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>Condições de Pagamento & Conclusão do Pedido</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
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
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Desconto Adicional (%)
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
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-900 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              >
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto Bancário</option>
                <option value="CARTAO">Cartão de Crédito</option>
                <option value="FATURADO">Faturado / Prazo</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Condição de Pagamento
              </label>
              <input
                type="text"
                value={paymentCondition}
                onChange={(e) => setPaymentCondition(e.target.value)}
                placeholder="Ex: 30/60 DDL"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-900 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Observações do Pedido / Proposta
            </label>
            <textarea
              rows={2}
              value={proposalNotes}
              onChange={(e) => setProposalNotes(e.target.value)}
              placeholder="Observações internas ou recado para o cliente..."
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => handleFinalize('PROPOSAL')}
              disabled={isFinalizing}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg font-bold text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <FileSignature className="w-4 h-4" />
              <span>Converter em Proposta Comercial</span>
            </button>

            <button
              type="button"
              onClick={() => handleFinalize('HORUS_ORDER')}
              disabled={isFinalizing}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Aprovar & Transmitir Pedido para o Horus ERP</span>
            </button>
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