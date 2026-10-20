'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  BookOpen, 
  FileSpreadsheet, 
  Upload, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Calculator, 
  DollarSign, 
  Send, 
  Trash2, 
  Check, 
  Sparkles, 
  Building2, 
  Search, 
  ShieldCheck, 
  Info, 
  AlertCircle,
  FileCheck,
  CheckCheck,
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  Lock,
  Filter,
  Pencil,
  ShieldAlert
} from 'lucide-react';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';
import { CurrencyInput } from '@/components/CurrencyInput';
import { getToken } from '@/lib/auth';

interface PearsonItem {
  id: string;
  row: number;
  isbn: string;
  title_pearson: string;
  pageviews: number;
  percentage: number;
  original_value: number;
  quantity: number;
  liquid_value: number;
  subtotal: number;
  selected_for_rateio: boolean;
  in_horus: boolean;
  horus_cod_item?: string;
  horus_title?: string;
  horus_cover_price?: number;
  horus_stock?: number;
  is_ebook?: boolean;
  api_message?: string;
}

interface PearsonPreviewData {
  period?: string;
  receipt_month?: string;
  receipt_number?: string;
  suggested_reference: string;
  total_items: number;
  total_original_value: number;
  total_found_in_horus?: number;
  total_not_found?: number;
  not_found_isbns?: string[];
  total_zero_cover?: number;
  zero_cover_isbns?: string[];
  total_physical_books?: number;
  physical_book_isbns?: string[];
  has_critical_errors?: boolean;
  filename: string;
}

function extractFriendlyErrorMessage(errJson: any, fallback: string): string {
  if (!errJson) return fallback;
  if (typeof errJson.detail === 'string') return errJson.detail;
  if (Array.isArray(errJson.detail)) {
    return errJson.detail.map((e: any) => e.msg || e.detail || JSON.stringify(e)).join('; ');
  }
  if (typeof errJson.message === 'string') return errJson.message;
  return fallback;
}

export default function EbookPearsonPage() {
  // ── Estado do Cliente / Empresa ──────────────────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: number;
    name: string;
    corporate_name?: string;
    document?: string;
    horus_cod_cli?: number | string;
    id_guid?: string;
    payment_condition?: string;
  } | null>(null);

  // ── Estado de Upload e Leitura da Planilha ─────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<PearsonPreviewData | null>(null);

  // ── Itens da Grade e Conciliação ──────────────────────────────────────────
  const [items, setItems] = useState<PearsonItem[]>([]);
  const [targetReceivedTotal, setTargetReceivedTotal] = useState<number>(0);
  const [reference, setReference] = useState<string>('');
  const [paymentCondition, setPaymentCondition] = useState<string>('30 DDL');
  const [paymentMethod, setPaymentMethod] = useState<string>('Boleto Bancário');
  const [obsPedido, setObsPedido] = useState<string>('REPASSE E-BOOK BIBLIOTECA VIRTUAL PEARSON');
  const [skipExpedition, setSkipExpedition] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');
  
  // ── Filtros e Ajustes de Erros Críticos / Itens Não Localizados ──────────
  const [showOnlyUnlocated, setShowOnlyUnlocated] = useState<boolean>(false);
  const [showOnlyZeroCover, setShowOnlyZeroCover] = useState<boolean>(false);
  const [showOnlyPhysical, setShowOnlyPhysical] = useState<boolean>(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editIsbnMap, setEditIsbnMap] = useState<Record<string, string>>({});
  const [editManualCodMap, setEditManualCodMap] = useState<Record<string, string>>({});
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [recheckSuccessMsg, setRecheckSuccessMsg] = useState<string | null>(null);

  // ── Envio e Sucesso ───────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    order_id: number;
    horus_pedido_venda?: string;
    total_liquido: number;
    total_items: number;
    reference: string;
    message: string;
  } | null>(null);

  // ── Cálculos e Totais Derivados ───────────────────────────────────────────
  const originalTotal = useMemo(() => {
    return round2(items.reduce((acc, it) => acc + (it.original_value || 0), 0));
  }, [items]);

  const currentTotal = useMemo(() => {
    return round2(items.reduce((acc, it) => acc + (it.liquid_value * it.quantity), 0));
  }, [items]);

  const difference = useMemo(() => {
    return round2(targetReceivedTotal - currentTotal);
  }, [targetReceivedTotal, currentTotal]);

  const isMatched = useMemo(() => {
    return targetReceivedTotal > 0 && Math.abs(difference) < 0.005;
  }, [targetReceivedTotal, difference]);

  const selectedForRateioCount = useMemo(() => {
    return items.filter(it => it.selected_for_rateio).length;
  }, [items]);

  // Itens não localizados no Horus (Bloqueadores Críticos de Faturamento)
  const unlocatedItems = useMemo(() => {
    return items.filter(it => !it.in_horus || !it.horus_cod_item);
  }, [items]);

  const unlocatedCount = unlocatedItems.length;
  const hasCriticalBlocker = unlocatedCount > 0;

  // Itens cadastrados no Horus como Livro Físico (Bloqueadores Críticos na Rotina de E-Book)
  const physicalItems = useMemo(() => {
    return items.filter(it => it.in_horus && it.is_ebook === false);
  }, [items]);

  const physicalCount = physicalItems.length;
  const hasPhysicalBlocker = physicalCount > 0;

  // Itens com Preço de Capa zerado no Horus (Bloqueadores Críticos)
  const zeroCoverItems = useMemo(() => {
    return items.filter(it => it.in_horus && (!it.horus_cover_price || it.horus_cover_price <= 0));
  }, [items]);

  const zeroCoverCount = zeroCoverItems.length;
  const hasZeroCover = zeroCoverCount > 0;

  // Itens cujo valor unitário excede o Preço de Capa do Horus
  const exceedingCoverItems = useMemo(() => {
    return items.filter(it => (it.horus_cover_price || 0) > 0 && it.liquid_value > (it.horus_cover_price || 0) + 0.005);
  }, [items]);
  const hasExceedingCover = exceedingCoverItems.length > 0;

  const filteredItems = useMemo(() => {
    let list = items;
    if (showOnlyUnlocated) {
      list = list.filter(it => !it.in_horus || !it.horus_cod_item);
    } else if (showOnlyZeroCover) {
      list = list.filter(it => it.in_horus && (!it.horus_cover_price || it.horus_cover_price <= 0));
    } else if (showOnlyPhysical) {
      list = list.filter(it => it.in_horus && it.is_ebook === false);
    }
    if (!searchFilter.trim()) return list;
    const q = searchFilter.toLowerCase().trim();
    return list.filter(it => 
      it.isbn.toLowerCase().includes(q) ||
      it.title_pearson.toLowerCase().includes(q) ||
      (it.horus_title && it.horus_title.toLowerCase().includes(q)) ||
      (it.horus_cod_item && String(it.horus_cod_item).toLowerCase().includes(q))
    );
  }, [items, showOnlyUnlocated, showOnlyZeroCover, showOnlyPhysical, searchFilter]);

  function round2(val: number): number {
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  // Inteligência de Decomposição (Quantidade x Preço de Capa e Quebra em Q=1)
  function decomposeAndReconcileItems(
    itemsList: PearsonItem[],
    targetTotal?: number
  ): PearsonItem[] {
    if (!itemsList || itemsList.length === 0) return itemsList;

    const target = targetTotal !== undefined 
      ? round2(targetTotal) 
      : round2(itemsList.reduce((acc, it) => acc + it.subtotal, 0));

    const results: PearsonItem[] = [];

    // Passo 1: Determinar Q e Pu preliminar para cada item respeitando Preço de Capa
    for (const it of itemsList) {
      const targetS = round2(it.subtotal);
      const cover = it.horus_cover_price || 0;

      let q = 1;
      let pu = targetS;

      if (cover > 0 && targetS > cover) {
        const qMin = Math.max(1, Math.ceil(targetS / cover));
        let bestQ = qMin;
        const cents = Math.round(targetS * 100);

        // Tenta achar Q em [qMin, qMin + 3] que divida exatamente em centavos
        for (let qCand = qMin; qCand <= qMin + 3; qCand++) {
          if (cents % qCand === 0) {
            bestQ = qCand;
            break;
          }
        }

        q = bestQ;
        pu = round2(targetS / q);
        while (pu > cover) {
          q += 1;
          pu = round2(targetS / q);
        }
      } else {
        q = Math.max(1, it.quantity);
        pu = round2(targetS / q);
      }

      const sub = round2(q * pu);
      results.push({
        ...it,
        quantity: q,
        liquid_value: pu,
        subtotal: sub
      });
    }

    // Passo 2: Calcular a Quebra (diferença residual de centavos vs total desejado)
    const currentSum = round2(results.reduce((acc, it) => acc + it.subtotal, 0));
    let diffCents = Math.round((target - currentSum) * 100);

    // Passo 3: Atribuir a Quebra exclusivamente a itens com quantidade == 1
    if (diffCents !== 0) {
      const q1Items = results.filter(it => it.quantity === 1);
      const step = diffCents > 0 ? 1 : -1;
      let idx = 0;
      const maxLoops = Math.abs(diffCents) * 4;
      let loops = 0;

      while (diffCents !== 0 && loops < maxLoops) {
        loops++;
        if (q1Items.length > 0) {
          const targetItem = q1Items[idx % q1Items.length];
          idx++;
          const cover = targetItem.horus_cover_price || 0;
          const newPu = round2(targetItem.liquid_value + (step * 0.01));

          if (newPu > 0 && (cover <= 0 || newPu <= cover)) {
            targetItem.liquid_value = newPu;
            targetItem.subtotal = newPu; // pois Q == 1
            diffCents -= step;
          }
        } else {
          // Se nenhum item tiver Q == 1, usa o item de menor quantidade
          const sortedItems = [...results].sort((a, b) => a.quantity - b.quantity);
          const targetItem = sortedItems[0];
          const newPu = round2(targetItem.liquid_value + (step * 0.01));
          const cover = targetItem.horus_cover_price || 0;

          if (newPu > 0 && (cover <= 0 || newPu <= cover)) {
            targetItem.liquid_value = newPu;
            targetItem.subtotal = round2(targetItem.quantity * newPu);
            const nowSum = round2(results.reduce((acc, it) => acc + it.subtotal, 0));
            diffCents = Math.round((target - nowSum) * 100);
          } else {
            break;
          }
        }
      }
    }

    return results;
  }

  // ── Ações de Reconsulta Individual e Ajuste Manual ────────────────────────

  const handleRecheckSingleItem = async (item: PearsonItem) => {
    setRecheckingId(item.id);
    setRecheckSuccessMsg(null);
    setSubmitError(null);
    try {
      const isbnToQuery = (editIsbnMap[item.id] || item.isbn).trim();
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/orders/ebook-pearson/lookup-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          isbn: isbnToQuery,
          title: item.title_pearson
        })
      });

      if (!res.ok) {
        throw new Error('Falha de conexão ao reconsultar item no Horus.');
      }

      const data = await res.json();
      if (data.found) {
        setItems(prev => prev.map(it => {
          if (it.id === item.id) {
            return {
              ...it,
              isbn: data.isbn || it.isbn,
              in_horus: true,
              horus_cod_item: data.horus_cod_item,
              horus_title: data.horus_title,
              horus_cover_price: data.horus_cover_price ?? it.horus_cover_price,
              horus_stock: data.horus_stock ?? it.horus_stock,
              is_ebook: data.is_ebook,
              api_message: data.api_message
            };
          }
          return it;
        }));
        setEditingRowId(null);
        setRecheckSuccessMsg(`✓ Item ${item.isbn} localizado com sucesso no Horus (Cód: #${data.horus_cod_item})!`);
      } else {
        alert(`O item com ISBN "${isbnToQuery}" ainda não foi localizado no Horus ERP nem no catálogo.`);
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao reconsultar item.');
    } finally {
      setRecheckingId(null);
    }
  };

  const handleManualApplyCode = (itemId: string) => {
    const cod = (editManualCodMap[itemId] || '').trim();
    if (!cod) {
      alert('Informe o Código Horus numérico do item.');
      return;
    }
    setItems(prev => prev.map(it => {
      if (it.id === itemId) {
        return {
          ...it,
          in_horus: true,
          horus_cod_item: cod,
          is_ebook: true,
          api_message: `✓ Vinculado Manualmente (Cód: #${cod})`
        };
      }
      return it;
    }));
    setEditingRowId(null);
    setRecheckSuccessMsg(`✓ Código #${cod} vinculado manualmente ao item!`);
  };

  // ── Ações de Leitura e Envio ──────────────────────────────────────────────

  const handleProcessFile = async () => {
    if (!file) {
      setParseError('Selecione o arquivo da planilha Pearson (.xlsx ou .csv) antes de prosseguir.');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setSubmitError(null);
    setSuccessResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedCustomerId) {
        formData.append('customer_id', String(selectedCustomerId));
      }

      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/orders/ebook-pearson/parse-and-preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const defaultMsg = res.status === 413
          ? 'O arquivo excede o limite máximo permitido de 10 MB.'
          : `Erro ao processar planilha (${res.status}). Verifique o formato do arquivo.`;
        throw new Error(extractFriendlyErrorMessage(errJson, defaultMsg));
      }

      const data = await res.json();
      setPreviewMeta({
        period: data.period,
        receipt_month: data.receipt_month,
        receipt_number: data.receipt_number,
        suggested_reference: data.suggested_reference,
        total_items: data.total_items,
        total_original_value: data.total_original_value,
        total_found_in_horus: data.total_found_in_horus,
        total_not_found: data.total_not_found,
        not_found_isbns: data.not_found_isbns,
        total_zero_cover: data.total_zero_cover,
        zero_cover_isbns: data.zero_cover_isbns,
        total_physical_books: data.total_physical_books,
        physical_book_isbns: data.physical_book_isbns,
        has_critical_errors: data.has_critical_errors,
        filename: data.filename
      });

      setReference(data.suggested_reference || `BV-${Date.now()}`);
      setTargetReceivedTotal(0); // Sempre zerado: obriga o preenchimento manual do valor recebido
      setItems(data.items || []);

      if (data.receipt_month || data.receipt_number) {
        setObsPedido(`REPASSE E-BOOK BIBLIOTECA VIRTUAL PEARSON - REF ${data.suggested_reference}`);
      }
    } catch (err: any) {
      setParseError(err.message || 'Falha de comunicação ao processar planilha da Pearson.');
    } finally {
      setIsParsing(false);
    }
  };

  // ── Algoritmo de Rateio Exato com Inteligência de Preço de Capa ───────────

  const handleApplyRateio = () => {
    if (items.length === 0) return;

    if (targetReceivedTotal <= 0) {
      alert('É obrigatório informar o Valor Total Recebido (Pearson) antes de efetuar o rateio.');
      return;
    }

    if (targetReceivedTotal < currentTotal) {
      alert(
        `O Valor Total Recebido (${targetReceivedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) precisa ser igual ou maior que o total líquido dos itens (${currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`
      );
      return;
    }

    if (hasCriticalBlocker) {
      alert(`BLOQUEIO CRÍTICO: Existem ${unlocatedCount} item(ns) não localizados no Horus ERP. Corrija o ISBN antes de prosseguir com o rateio.`);
      return;
    }

    if (hasPhysicalBlocker) {
      alert(`BLOQUEIO CRÍTICO: Existem ${physicalCount} item(ns) identificados no Horus ERP como Livro Físico. Esta rotina é exclusiva para E-Books. Corrija o ISBN na planilha para o da versão digital antes de prosseguir com o rateio.`);
      return;
    }

    const selectedIndices = items
      .map((it, idx) => it.selected_for_rateio ? idx : -1)
      .filter(idx => idx !== -1);

    if (selectedIndices.length === 0) {
      alert('Selecione ao menos 1 item na caixa de seleção para ratear a diferença.');
      return;
    }

    const diff = round2(targetReceivedTotal - currentTotal);
    if (Math.abs(diff) < 0.005) {
      return;
    }

    const selectedWeight = selectedIndices.reduce(
      (sum, idx) => sum + items[idx].subtotal, 
      0
    );

    const useEqual = selectedWeight <= 0;
    const updated = items.map(it => ({ ...it }));

    // 1. Distribui proporcionalmente para calcular o subtotal alvo de cada item selecionado
    selectedIndices.forEach(idx => {
      const it = updated[idx];
      let share = 0;
      if (useEqual) {
        share = diff / selectedIndices.length;
      } else {
        share = diff * (it.subtotal / selectedWeight);
      }
      it.subtotal = round2(it.subtotal + share);
    });

    // 2. Aplica inteligência de decomposição (Quantidade x Preço de Capa e Quebra em Q=1)
    const reconciled = decomposeAndReconcileItems(updated, targetReceivedTotal);
    setItems(reconciled);
  };

  const handleRestoreOriginals = () => {
    const reset = items.map(it => ({
      ...it,
      subtotal: it.original_value
    }));
    const reconciled = decomposeAndReconcileItems(reset, targetReceivedTotal > 0 ? targetReceivedTotal : undefined);
    setItems(reconciled);
  };

  const handleAutoAdjustCoverPrices = () => {
    const adjusted = decomposeAndReconcileItems(items, targetReceivedTotal > 0 ? targetReceivedTotal : undefined);
    setItems(adjusted);
  };

  const handleToggleSelectAll = (checked: boolean) => {
    setItems(prev => prev.map(it => ({ ...it, selected_for_rateio: checked })));
  };

  const handleToggleSingleItem = (id: string) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, selected_for_rateio: !it.selected_for_rateio } : it));
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  // ── Transmissão do Pedido ao Horus ERP ────────────────────────────────────

  const handleCreateAndSendOrder = async () => {
    if (!selectedCustomerId) {
      alert('Por favor, selecione o Cliente (Empresa) responsável pelo pedido.');
      return;
    }
    if (items.length === 0) {
      alert('Nenhum item carregado para gerar pedido.');
      return;
    }

    if (targetReceivedTotal <= 0) {
      setSubmitError('Obrigatório informar o Valor Total Recebido (Pearson) antes de gerar o pedido.');
      return;
    }

    if (targetReceivedTotal < currentTotal) {
      setSubmitError(
        `O Valor Total Recebido (${targetReceivedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) não pode ser menor que o total líquido dos itens (${currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Ele precisa ser igual ou maior.`
      );
      return;
    }

    if (!isMatched) {
      setSubmitError(
        `Atenção: O total atual dos itens (${currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) difere do Valor Total Recebido informado (${targetReceivedTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Aplique o Rateio na grade antes de enviar.`
      );
      return;
    }

    if (hasCriticalBlocker) {
      setSubmitError(
        `BLOQUEIO CRÍTICO DE FATURAMENTO: Existem ${unlocatedCount} item(ns) não localizados no Horus ERP. O pedido está bloqueado para transmissão. Todos os itens devem estar devidamente vinculados ao Horus ou removidos da grade antes de gerar o pedido.`
      );
      return;
    }

    if (hasZeroCover) {
      setSubmitError(
        `BLOQUEIO CRÍTICO DE FATURAMENTO: Existem ${zeroCoverCount} item(ns) com Preço de Capa zerado ou não cadastrado no Horus ERP. O Horus ERP rejeita itens sem preço de tabela ativo. Ajuste o preço de capa no Horus para poder prosseguir.`
      );
      return;
    }

    if (hasPhysicalBlocker) {
      setSubmitError(
        `BLOQUEIO CRÍTICO DE FATURAMENTO: Existem ${physicalCount} item(ns) cadastrados no Horus ERP como Livro Físico (esperado E-Book). O repasse Pearson aceita exclusivamente a versão digital. Corrija o ISBN na planilha para o ISBN do E-book correspondente antes de gerar o pedido.`
      );
      return;
    }

    if (hasExceedingCover) {
      setSubmitError(
        `BLOQUEIO DE TRANSMISSÃO: Existem ${exceedingCoverItems.length} item(ns) com valor unitário superior ao Preço de Capa no Horus ERP. O Horus rejeita itens com preço unitário maior que a capa. Clique em 'Adequar ao Preço de Capa' na grade antes de enviar.`
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        customer_id: selectedCustomerId,
        reference: reference.trim() || `BV-${Date.now()}`,
        target_received_total: targetReceivedTotal,
        payment_condition: paymentCondition,
        payment_method: paymentMethod,
        obs_pedido: obsPedido,
        skip_expedition: skipExpedition,
        items: items.map(it => ({
          isbn: it.isbn,
          title: it.title_pearson,
          quantity: it.quantity,
          liquid_unit_price: it.liquid_value,
          original_value: it.original_value,
          pageviews: it.pageviews,
          horus_cod_item: it.horus_cod_item,
          horus_cover_price: it.horus_cover_price,
          is_ebook: it.is_ebook
        }))
      };

      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/orders/ebook-pearson/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(extractFriendlyErrorMessage(errJson, `Erro ao gerar pedido de E-book (${res.status}).`));
      }

      const result = await res.json();
      if (!result.horus_pedido_venda) {
        throw new Error('O Horus ERP não confirmou o número do Pedido de Venda. O pedido não foi processado.');
      }
      setSuccessResult(result);
    } catch (err: any) {
      setSubmitError(err.message || 'Falha ao transmitir pedido para o Horus ERP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 p-2 sm:p-4 space-y-3 font-sans">
      
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1. BARRA SUPERIOR DE COMANDO                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <Link 
            href="/dbm"
            title="Voltar ao DBM Menu Central"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block leading-none">
                Horus Direct • Gestão de Vendas DBM
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                E-book Pearson (BV)
              </span>
            </div>
            <h1 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
              Importação & Rateio de Repasses E-book
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/horus-direct/pedidos"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
            <span>Pedidos Horus</span>
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 2. PASSO 1: SELEÇÃO DO CLIENTE & CARREGAMENTO DA PLANILHA           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        
        {/* Painel do Cliente / Empresa */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              1. Selecionar Cliente / Empresa Faturada
            </span>
            <span className="text-[10px] text-slate-400">Obrigatório para o Horus</span>
          </div>

          <CustomerAutocomplete
            value={selectedCustomerId}
            onChange={(id, cust) => {
              setSelectedCustomerId(id);
              if (cust) {
                setSelectedCustomer({
                  id: cust.id,
                  name: cust.name,
                  corporate_name: cust.corporate_name || cust.name,
                  document: cust.document || '',
                  horus_cod_cli: cust.horus_cod_cli,
                  id_guid: cust.id_guid,
                  payment_condition: cust.payment_condition || '30 DDL'
                });
                if (cust.payment_condition) {
                  setPaymentCondition(cust.payment_condition);
                }
              } else {
                setSelectedCustomer(null);
              }
            }}
            placeholder="🔍 Digite Nome, Razão Social ou CNPJ do Cliente (ex: Pearson)..."
          />

          {selectedCustomer ? (
            <div className="p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  {selectedCustomer.corporate_name || selectedCustomer.name}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  CNPJ: {selectedCustomer.document || 'Não cadastrado'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedCustomer.id_guid ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <ShieldCheck className="h-3 w-3" />
                    Horus ID_GUID Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    Sem ID_GUID (Horus)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 italic">
              Selecione o cadastro da Pearson ou cliente correspondente para emitir o pedido de venda de e-books.
            </p>
          )}
        </div>

        {/* Upload da Planilha Pearson */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                2. Planilha de Repasse Pearson (.xlsx / .csv)
              </span>
              <span className="text-[10px] text-slate-400">Relatório BV por ISBN</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-lg cursor-pointer bg-slate-50/50 dark:bg-slate-850/50 transition-all text-xs">
                <Upload className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                  {file ? file.name : "Clique para selecionar a planilha de repasse..."}
                </span>
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                      setParseError(null);
                    }
                  }} 
                />
              </label>

              <button
                type="button"
                onClick={handleProcessFile}
                disabled={!file || isParsing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-all disabled:opacity-50 shrink-0"
              >
                {isParsing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Lendo API...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Processar Planilha</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {parseError && (
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {previewMeta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-mono pt-1">
              <span>Período: <strong className="text-slate-800 dark:text-slate-200">{previewMeta.period || 'BV'}</strong></span>
              <span>Mês: <strong className="text-slate-800 dark:text-slate-200">{previewMeta.receipt_month || '-'}</strong></span>
              <span>Nº: <strong className="text-indigo-600">{previewMeta.receipt_number || '-'}</strong></span>
              <span>Títulos: <strong className="text-slate-800 dark:text-slate-200">{previewMeta.total_items}</strong></span>
            </div>
          )}
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 3. MESA DE CONFERÊNCIA, VALOR RECEBIDO E RATEIO DINÂMICO           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {items.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-0">
          
          {/* BANNER CRÍTICO DE BLOQUEIO DE TRANSMISSÃO */}
          {hasCriticalBlocker && (
            <div className="p-3.5 sm:p-4 bg-rose-50 dark:bg-rose-950/50 border-b-2 border-rose-500 text-rose-900 dark:text-rose-100 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-600 text-white shrink-0 shadow-sm">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black uppercase tracking-wide text-rose-900 dark:text-rose-200">
                        BLOQUEIO CRÍTICO: {unlocatedCount} {unlocatedCount === 1 ? 'item não localizado' : 'itens não localizados'} no Horus ERP
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                        Transmissão Travada
                      </span>
                    </div>
                    <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                      O Horus ERP rejeita pedidos que contenham itens sem código ativo no cadastro. Ajuste o ISBN, reconsulte ou vincule o código Horus manualmente na grade abaixo antes de enviar.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowOnlyUnlocated(prev => !prev)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                      showOnlyUnlocated 
                        ? 'bg-rose-700 text-white hover:bg-rose-800' 
                        : 'bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span>{showOnlyUnlocated ? 'Exibindo Apenas Pendentes' : `Ver Apenas os ${unlocatedCount} Pendentes`}</span>
                  </button>
                </div>
              </div>

              {/* Lista em chips dos ISBNs pendentes */}
              <div className="pt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-bold text-[11px] text-rose-800 dark:text-rose-300">ISBNs com Bloqueio:</span>
                {unlocatedItems.map(it => (
                  <button 
                    key={it.id} 
                    type="button"
                    onClick={() => {
                      setSearchFilter(it.isbn);
                      setShowOnlyUnlocated(false);
                      setEditingRowId(it.id);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 hover:border-rose-500 cursor-pointer shadow-2xs"
                    title={`Clique para focar e ajustar o item: ${it.title_pearson}`}
                  >
                    <span>{it.isbn}</span>
                    <span className="text-[9px] text-rose-500 max-w-[140px] truncate">({it.title_pearson})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BANNER CRÍTICO: PREÇO DE CAPA ZERADO NO HORUS */}
          {hasZeroCover && (
            <div className="p-3.5 sm:p-4 bg-amber-500/10 dark:bg-amber-950/40 border-b-2 border-amber-500 text-amber-900 dark:text-amber-100 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-600 text-white shrink-0 shadow-sm">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black uppercase tracking-wide text-amber-900 dark:text-amber-200">
                        BLOQUEIO CRÍTICO: {zeroCoverCount} {zeroCoverCount === 1 ? 'item com Preço de Capa zerado' : 'itens com Preço de Capa zerado'} no Horus ERP
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                        Transmissão Travada
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                      O Horus ERP rejeita faturamento de itens sem Preço de Capa ativo na tabela de preços. Ajuste no Horus o preço de capa do item para poder prosseguir.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOnlyZeroCover(prev => !prev);
                      setShowOnlyUnlocated(false);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                      showOnlyZeroCover 
                        ? 'bg-amber-700 text-white hover:bg-amber-800' 
                        : 'bg-white dark:bg-slate-900 border border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span>{showOnlyZeroCover ? 'Exibindo Apenas Capa Zerada' : `Ver Apenas os ${zeroCoverCount} com Capa Zerada`}</span>
                  </button>
                </div>
              </div>

              {/* Lista em chips dos ISBNs com Capa Zerada */}
              <div className="pt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-bold text-[11px] text-amber-900 dark:text-amber-300">ISBNs com Capa Zerada:</span>
                {zeroCoverItems.map(it => (
                  <button 
                    key={it.id} 
                    type="button"
                    onClick={() => {
                      setSearchFilter(it.isbn);
                      setShowOnlyZeroCover(false);
                      setShowOnlyUnlocated(false);
                      setShowOnlyPhysical(false);
                      setEditingRowId(it.id);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:border-amber-500 cursor-pointer shadow-2xs"
                    title={`Clique para focar no item: ${it.title_pearson}`}
                  >
                    <span>{it.isbn}</span>
                    <span className="text-[9px] text-amber-700 dark:text-amber-400 max-w-[140px] truncate">({it.title_pearson})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BANNER CRÍTICO: LIVRO FÍSICO NO HORUS (ROTINA EXCLUSIVA DE E-BOOKS) */}
          {hasPhysicalBlocker && (
            <div className="p-3.5 sm:p-4 bg-purple-50 dark:bg-purple-950/50 border-b-2 border-purple-600 text-purple-900 dark:text-purple-100 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-600 text-white shrink-0 shadow-sm">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black uppercase tracking-wide text-purple-900 dark:text-purple-200">
                        BLOQUEIO CRÍTICO: {physicalCount} {physicalCount === 1 ? 'item é Livro Físico' : 'itens são Livros Físicos'} no Horus ERP
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-200">
                        Transmissão Travada • Apenas E-Books
                      </span>
                    </div>
                    <p className="text-xs text-purple-800 dark:text-purple-300 mt-0.5 font-medium">
                      Esta rotina é exclusiva para repasses de <strong>E-Books</strong> da Biblioteca Virtual Pearson. O ISBN informado na planilha pertence ao exemplar físico/impresso (identificado no Horus com EBOOK: N). Corrija na planilha para o ISBN da versão digital antes de prosseguir.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOnlyPhysical(prev => !prev);
                      setShowOnlyUnlocated(false);
                      setShowOnlyZeroCover(false);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                      showOnlyPhysical 
                        ? 'bg-purple-700 text-white hover:bg-purple-800' 
                        : 'bg-white dark:bg-slate-900 border border-purple-400 dark:border-purple-700 text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50'
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span>{showOnlyPhysical ? 'Exibindo Apenas Livros Físicos' : `Ver Apenas os ${physicalCount} Livros Físicos`}</span>
                  </button>
                </div>
              </div>

              {/* Lista em chips dos ISBNs de livros físicos */}
              <div className="pt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-bold text-[11px] text-purple-900 dark:text-purple-300">ISBNs Físicos a Corrigir:</span>
                {physicalItems.map(it => (
                  <button 
                    key={it.id} 
                    type="button"
                    onClick={() => {
                      setSearchFilter(it.isbn);
                      setShowOnlyPhysical(false);
                      setShowOnlyUnlocated(false);
                      setShowOnlyZeroCover(false);
                      setEditingRowId(it.id);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200 hover:border-purple-600 cursor-pointer shadow-2xs"
                    title={`Clique para focar e ver o item físico: ${it.title_pearson}`}
                  >
                    <span>{it.isbn}</span>
                    <span className="text-[9px] text-purple-600 dark:text-purple-400 max-w-[140px] truncate">({it.title_pearson})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BANNER DE SUCESSO DE RECONSULTA/AJUSTE MANUAL */}
          {recheckSuccessMsg && (
            <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{recheckSuccessMsg}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setRecheckSuccessMsg(null)}
                className="text-emerald-700 dark:text-emerald-400 hover:underline text-[11px] font-bold"
              >
                Dispensar
              </button>
            </div>
          )}
          
          {/* Header Financeiro de Rateio e Validação */}
          <div className="p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-850/60 border-b border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              {/* Card 1: Soma da Planilha */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Total Planilha Pearson
                </span>
                <span className="text-lg font-mono font-black text-slate-800 dark:text-slate-200">
                  {originalTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Soma dos valores originais extraídos
                </span>
              </div>

              {/* Card 2: Valor Total Recebido (EDITÁVEL com máscara monetária) */}
              <div className={`p-3 rounded-xl border-2 shadow-2xs space-y-1 transition-all ${
                targetReceivedTotal <= 0
                  ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/30'
                  : targetReceivedTotal < currentTotal
                  ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30'
                  : 'border-indigo-500/80 bg-indigo-50/40 dark:bg-indigo-950/30'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-wider block ${
                    targetReceivedTotal <= 0
                      ? 'text-rose-700 dark:text-rose-400'
                      : targetReceivedTotal < currentTotal
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-indigo-700 dark:text-indigo-400'
                  }`}>
                    Valor Total Recebido (Pearson)
                  </span>
                  {targetReceivedTotal <= 0 ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200 uppercase">
                      Obrigatório
                    </span>
                  ) : targetReceivedTotal < currentTotal ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200 uppercase">
                      Menor que Itens
                    </span>
                  ) : null}
                </div>
                <CurrencyInput
                  value={targetReceivedTotal}
                  onChangeValue={(val) => setTargetReceivedTotal(val)}
                  prefixStr="R$ "
                  className="w-full text-lg font-mono font-black text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-lg px-2.5 py-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  title="Informe o valor exato repassado/depositado pela Pearson"
                />
                {targetReceivedTotal <= 0 ? (
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block">
                    ⚠ Preenchimento obrigatório para rateio e envio.
                  </span>
                ) : targetReceivedTotal < currentTotal ? (
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block">
                    ⚠ Deve ser ≥ {currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (total líquido dos itens).
                  </span>
                ) : (
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 block">
                    Valor depositado para conciliação e rateio
                  </span>
                )}
              </div>

              {/* Card 3: Total Atual dos Itens */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Total Líquido dos Itens
                </span>
                <span className="text-lg font-mono font-black text-slate-900 dark:text-white">
                  {currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Soma de (Qtd × Valor Líquido)
                </span>
              </div>

              {/* Card 4: Diferença / Conciliação */}
              <div className={`p-3 rounded-xl border shadow-2xs flex flex-col justify-between ${
                targetReceivedTotal <= 0
                  ? 'border-slate-300 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 text-slate-500'
                  : targetReceivedTotal < currentTotal
                  ? 'border-rose-300 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                  : isMatched 
                  ? 'border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200' 
                  : 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
              }`}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider block">
                      Diferença a Ratear
                    </span>
                    {targetReceivedTotal <= 0 ? (
                      <AlertCircle className="h-4 w-4 text-slate-400" />
                    ) : targetReceivedTotal < currentTotal ? (
                      <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    ) : isMatched ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-pulse" />
                    )}
                  </div>
                  <span className="text-lg font-mono font-black block">
                    {targetReceivedTotal <= 0 ? (
                      <span className="text-slate-400 font-sans text-sm font-semibold">Aguardando valor recebido</span>
                    ) : (
                      <>
                        {Math.abs(difference).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        {difference > 0 && <span className="text-xs font-normal"> (Acréscimo)</span>}
                        {difference < 0 && <span className="text-xs font-normal"> (Dedução)</span>}
                      </>
                    )}
                  </span>
                </div>

                <div className="pt-1">
                  {targetReceivedTotal <= 0 ? (
                    <span className="text-[10px] font-bold text-slate-400">
                      Preencha o campo ao lado.
                    </span>
                  ) : targetReceivedTotal < currentTotal ? (
                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">
                      Valor menor que o total líquido dos itens.
                    </span>
                  ) : isMatched ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      100% Conciliado! Valores batem perfeitamente.
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      Pendente de rateio nos títulos abaixo.
                    </span>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Barra de Ações de Rateio & Filtros */}
          <div className="px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Botão de Rateio Automático nos Selecionados */}
              <button
                type="button"
                onClick={handleApplyRateio}
                disabled={isMatched || selectedForRateioCount === 0 || targetReceivedTotal <= 0 || targetReceivedTotal < currentTotal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-40"
                title={
                  targetReceivedTotal <= 0
                    ? 'Preencha o Valor Total Recebido antes de ratear'
                    : targetReceivedTotal < currentTotal
                    ? 'O Valor Recebido precisa ser igual ou maior que o total líquido dos itens'
                    : 'Aplica o rateio proporcional com ajuste fino de centavos nos itens marcados'
                }
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>Ratear Diferença nos Selecionados ({selectedForRateioCount})</span>
              </button>

              {/* Botão Restaurar Originais */}
              <button
                type="button"
                onClick={handleRestoreOriginals}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Restaura os valores originais da planilha Pearson com inteligência de preço de capa"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Restaurar Originais</span>
              </button>

              {/* Botão Ajustar Quantidades ao Preço de Capa */}
              {hasExceedingCover && (
                <button
                  type="button"
                  onClick={handleAutoAdjustCoverPrices}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition-all animate-pulse"
                  title="Ajusta automaticamente a quantidade e valor unitário dos itens para ficarem abaixo do preço de capa do Horus com quebra em Q=1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Adequar ao Preço de Capa ({exceedingCoverItems.length})</span>
                </button>
              )}
            </div>

            {/* Status Horus & Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              {hasCriticalBlocker && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyUnlocated(prev => !prev);
                    setShowOnlyZeroCover(false);
                    setShowOnlyPhysical(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                    showOnlyUnlocated
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-200'
                  }`}
                  title="Clique para alternar a exibição apenas dos itens bloqueados"
                >
                  <AlertTriangle className="h-3.5 w-3.5 animate-pulse text-rose-600 dark:text-rose-400" />
                  <span>{unlocatedCount} sem Horus ({showOnlyUnlocated ? 'Exibindo' : 'Filtrar'})</span>
                </button>
              )}

              {hasZeroCover && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyZeroCover(prev => !prev);
                    setShowOnlyUnlocated(false);
                    setShowOnlyPhysical(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                    showOnlyZeroCover
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-200'
                  }`}
                  title="Clique para alternar a exibição apenas dos itens com Preço de Capa zerado no Horus"
                >
                  <AlertTriangle className="h-3.5 w-3.5 animate-pulse text-amber-600 dark:text-amber-400" />
                  <span>{zeroCoverCount} Capa Zerada ({showOnlyZeroCover ? 'Exibindo' : 'Filtrar'})</span>
                </button>
              )}

              {hasPhysicalBlocker && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyPhysical(prev => !prev);
                    setShowOnlyUnlocated(false);
                    setShowOnlyZeroCover(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                    showOnlyPhysical
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300 hover:bg-purple-200'
                  }`}
                  title="Clique para alternar a exibição apenas dos itens cadastrados como Livro Físico no Horus"
                >
                  <AlertTriangle className="h-3.5 w-3.5 animate-pulse text-purple-600 dark:text-purple-400" />
                  <span>{physicalCount} Livro Físico ({showOnlyPhysical ? 'Exibindo' : 'Filtrar'})</span>
                </button>
              )}

              {!hasCriticalBlocker && !hasZeroCover && !hasPhysicalBlocker && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>100% no Horus ({items.length} itens)</span>
                </span>
              )}

              {/* Busca Rápida na Grade */}
              <div className="relative">
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filtrar por ISBN ou título..."
                  className="w-44 sm:w-56 pl-7 pr-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-1.5" />
              </div>
            </div>
          </div>

          {/* ── TABELA DENSA ESTILO ACCESS / DBM ─────────────────────────── */}
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs select-text">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-200/90 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  <th className="py-2 px-2 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && items.every(it => it.selected_for_rateio)}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                      title="Selecionar todos para rateio"
                    />
                  </th>
                  <th className="py-2 px-2 w-9 text-center text-slate-400">#</th>
                  <th className="py-2 px-2 w-28">Status Horus API</th>
                  <th className="py-2 px-2 w-32 font-mono">ISBN</th>
                  <th className="py-2 px-2 min-w-[200px]">Título da Obra</th>
                  <th className="py-2 px-2 text-center w-20">PageViews</th>
                  <th className="py-2 px-2 text-right w-24">Preço Capa</th>
                  <th className="py-2 px-2 text-right w-24">Vlr Planilha</th>
                  <th className="py-2 px-2 text-center w-16 bg-slate-100/70 dark:bg-slate-800/60" title="Quantidade bloqueada: gerenciada pela inteligência de Preço de Capa e Rateio">Qtd</th>
                  <th className="py-2 px-2 text-right w-28 bg-slate-100/70 dark:bg-slate-800/60" title="Valor líquido unitário bloqueado: determinado por rateio e Preço de Capa">Vlr Líquido</th>
                  <th className="py-2 px-2 text-right w-28 bg-indigo-50/40 dark:bg-indigo-950/20">Subtotal</th>
                  <th className="py-2 px-2 text-right w-24">Dif.</th>
                  <th className="py-2 px-2 text-center w-12">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-mono text-[11px]">
                {filteredItems.map((it, idx) => {
                  const itemDiff = round2(it.liquid_value - it.original_value);
                  const isUnlocated = !it.in_horus || !it.horus_cod_item;
                  const isZeroCover = it.in_horus && (!it.horus_cover_price || it.horus_cover_price <= 0);
                  const isPhysical = it.in_horus && it.is_ebook === false;
                  const isEditing = editingRowId === it.id;

                  return (
                    <React.Fragment key={it.id}>
                    <tr 
                      className={`transition-colors border-b ${
                        isUnlocated 
                          ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 border-l-4 border-l-rose-500'
                          : isZeroCover
                            ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 border-l-4 border-l-amber-500'
                          : isPhysical
                            ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 border-l-4 border-l-purple-600'
                          : idx % 2 === 1 
                            ? 'bg-slate-50/40 dark:bg-slate-850/20 border-slate-100 dark:border-slate-800/80' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/80'
                      } hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20`}
                    >
                      {/* Checkbox Rateio */}
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={it.selected_for_rateio}
                          onChange={() => handleToggleSingleItem(it.id)}
                          className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                          title="Marcar para participar do rateio"
                        />
                      </td>

                      {/* Índice */}
                      <td className="py-1.5 px-2 text-center text-slate-400 font-sans text-xs">
                        {idx + 1}
                      </td>

                      {/* Status Horus API */}
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {it.in_horus && it.horus_cod_item ? (
                          <div className="flex flex-col gap-0.5">
                            <span 
                              className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              title={it.api_message}
                            >
                              ✓ HORUS #{it.horus_cod_item}
                            </span>
                            {isPhysical && (
                              <span 
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[8px] font-black bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
                                title="No Horus este item está cadastrado como Livro Físico (EBOOK = N). O faturamento Pearson requer o ISBN do E-book correspondente."
                              >
                                <AlertTriangle className="h-2 w-2 text-purple-700 animate-pulse" />
                                LIVRO FÍSICO
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span 
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs"
                              title={it.api_message || 'Item não localizado no Horus ERP'}
                            >
                              <AlertTriangle className="h-2.5 w-2.5 text-rose-600 animate-pulse" />
                              NÃO LOCALIZADO
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingRowId(isEditing ? null : it.id)}
                              className="inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline text-left"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                              {isEditing ? 'Fechar ajuste' : 'Ajustar / Vincular'}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* ISBN */}
                      <td className="py-1.5 px-2 font-bold text-slate-800 dark:text-slate-200">
                        {it.isbn}
                      </td>

                      {/* Título */}
                      <td className="py-1.5 px-2 font-sans font-medium text-slate-900 dark:text-white max-w-xs" title={it.title_pearson}>
                        <span className="truncate block font-semibold">{it.title_pearson}</span>
                        {it.horus_title && it.horus_title !== it.title_pearson && (
                          <span className="text-[10px] text-slate-400 truncate block">
                            ↳ Horus: {it.horus_title}
                          </span>
                        )}
                        {isPhysical && (
                          <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 block mt-0.5 leading-tight">
                            ⚠ Item cadastrado como Livro Físico no Horus (EBOOK: N). Corrija na planilha para o ISBN do E-Book.
                          </span>
                        )}
                      </td>

                      {/* PageViews */}
                      <td className="py-1.5 px-2 text-center text-slate-500">
                        {it.pageviews}
                      </td>

                      {/* Preço Capa (Horus) */}
                      <td className="py-1.5 px-2 text-right">
                        {it.horus_cover_price != null && it.horus_cover_price > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300" title="Preço de Tabela / Capa no Horus ERP">
                              {it.horus_cover_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                            {it.liquid_value > (it.horus_cover_price || 0) + 0.005 && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 shadow-2xs" title="Valor unitário é maior que o Preço de Capa!">
                                ⚠ &gt; Capa
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-[10px]">
                              R$ 0,00
                            </span>
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 shadow-2xs" title="Preço de capa zerado ou não cadastrado no Horus ERP. Ajuste no Horus para poder emitir o pedido.">
                              ⚠ Capa Zerada
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Valor Original Planilha */}
                      <td className="py-1.5 px-2 text-right text-slate-500">
                        {it.original_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      {/* Quantidade (Bloqueada para edição) */}
                      <td className="py-1.5 px-2 text-center bg-slate-50/50 dark:bg-slate-850/30">
                        <span 
                          className="inline-block min-w-7 text-center font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 select-all"
                          title="Quantidade bloqueada: calculada pela inteligência de Preço de Capa e Rateio"
                        >
                          {it.quantity}
                        </span>
                      </td>

                      {/* Valor Líquido Unitário (Bloqueado para edição) */}
                      <td className="py-1.5 px-2 text-right bg-slate-50/50 dark:bg-slate-850/30">
                        <span 
                          className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300 select-all"
                          title="Valor líquido bloqueado: calculado pela inteligência de Preço de Capa e Rateio"
                        >
                          {it.liquid_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </td>

                      {/* Subtotal Líquido */}
                      <td className="py-1.5 px-2 text-right font-black text-slate-900 dark:text-white bg-indigo-50/30 dark:bg-indigo-950/20">
                        {it.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      {/* Diferença vs Original */}
                      <td className="py-1.5 px-2 text-right font-bold">
                        {itemDiff === 0 ? (
                          <span className="text-slate-400 font-normal">-</span>
                        ) : itemDiff > 0 ? (
                          <span className="text-emerald-600 text-[10px]">+{itemDiff.toFixed(2)}</span>
                        ) : (
                          <span className="text-rose-600 text-[10px]">{itemDiff.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="py-1.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingRowId(isEditing ? null : it.id)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                            title="Ajustar ISBN ou vincular código Horus"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(it.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Remover linha do pedido"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Linha Expansível de Ajuste / Vínculo */}
                    {isEditing && (
                      <tr className="bg-rose-50/90 dark:bg-rose-950/50 border-b border-rose-300 dark:border-rose-800">
                        <td colSpan={13} className="py-2.5 px-3">
                          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-rose-300 dark:border-rose-700 shadow-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <Pencil className="h-3.5 w-3.5 text-indigo-500" />
                                Ajustar Item: <span className="font-mono text-indigo-600">{it.isbn}</span> - {it.title_pearson}
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingRowId(null)}
                                className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold"
                              >
                                Fechar ✕
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              {/* Opção 1: Corrigir ISBN e Reconsultar */}
                              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                  Opção 1: Corrigir ISBN e Reconsultar
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <input 
                                    type="text"
                                    value={editIsbnMap[it.id] ?? it.isbn}
                                    onChange={(e) => setEditIsbnMap(prev => ({ ...prev, [it.id]: e.target.value }))}
                                    placeholder="Digite o ISBN correto..."
                                    className="flex-1 font-mono text-xs px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRecheckSingleItem(it)}
                                    disabled={recheckingId === it.id}
                                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold shrink-0 disabled:opacity-50 inline-flex items-center gap-1"
                                  >
                                    {recheckingId === it.id ? (
                                      <>
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        <span>Consultando...</span>
                                      </>
                                    ) : (
                                      <span>Reconsultar Horus</span>
                                    )}
                                  </button>
                                </div>
                                <span className="text-[10px] text-slate-400 block">
                                  Consulta a API Busca_Acervo do Horus pelo novo ISBN e título da obra.
                                </span>
                              </div>

                              {/* Opção 2: Informar Código Horus Manualmente */}
                              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                  Opção 2: Vincular Código Horus Manualmente
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <input 
                                    type="text"
                                    value={editManualCodMap[it.id] ?? ''}
                                    onChange={(e) => setEditManualCodMap(prev => ({ ...prev, [it.id]: e.target.value }))}
                                    placeholder="Ex: 504 (COD_ITEM do Horus)"
                                    className="flex-1 font-mono text-xs px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleManualApplyCode(it.id)}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold shrink-0 inline-flex items-center gap-1"
                                  >
                                    <Check className="h-3 w-3" />
                                    <span>Vincular Código</span>
                                  </button>
                                </div>
                                <span className="text-[10px] text-slate-400 block">
                                  Insira o número do COD_ITEM caso já saiba o código exato no cadastro do Horus.
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ═════════════════════════════════════════════════════════════════ */}
          {/* 4. PASSO 3: PARÂMETROS E TRANSMISSÃO DO PEDIDO AO HORUS ERP        */}
          {/* ═════════════════════════════════════════════════════════════════ */}
          <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-850/80 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              {/* Referência do Pedido Origem */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Referência / Cód. Pedido Origem
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="ex: BV-407-10/2026"
                  className="w-full text-xs font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Condição de Pagamento */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Condição de Pagamento
                </label>
                <input
                  type="text"
                  value={paymentCondition}
                  onChange={(e) => setPaymentCondition(e.target.value)}
                  placeholder="ex: 30 DDL"
                  className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Forma de Pagamento
                </label>
                <input
                  type="text"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="ex: Boleto Bancário"
                  className="w-full text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Checkbox Pular Expedição */}
              <div className="flex items-center pt-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={skipExpedition}
                    onChange={(e) => setSkipExpedition(e.target.checked)}
                    className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <span>Pular Expedição (Avançar p/ Faturamento)</span>
                </label>
              </div>

            </div>

            {/* Observação */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                Observação do Pedido (Transmitida no Horus)
              </label>
              <input
                type="text"
                value={obsPedido}
                onChange={(e) => setObsPedido(e.target.value)}
                className="w-full text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {hasCriticalBlocker && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-400 dark:border-rose-800 text-rose-900 dark:text-rose-100 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-600 text-white shrink-0">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-black block uppercase text-[11px] text-rose-900 dark:text-rose-200">
                      Transmissão Bloqueada: {unlocatedCount} {unlocatedCount === 1 ? 'item pendente' : 'itens pendentes'} no Horus ERP
                    </span>
                    <span className="text-[11px] text-rose-700 dark:text-rose-300">
                      Não é possível gerar o pedido no Horus com itens sem cadastro ativo. Corrija o ISBN, vincule o código (#) ou remova o item da grade antes de prosseguir.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyUnlocated(true);
                    setShowOnlyZeroCover(false);
                    window.scrollTo({ top: 380, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shrink-0 shadow-xs"
                >
                  Ver Itens Pendentes ({unlocatedCount})
                </button>
              </div>
            )}

            {hasZeroCover && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-600 text-white shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-black block uppercase text-[11px] text-amber-900 dark:text-amber-200">
                      Transmissão Bloqueada: {zeroCoverCount} {zeroCoverCount === 1 ? 'item com Preço de Capa zerado' : 'itens com Preço de Capa zerado'} no Horus ERP
                    </span>
                    <span className="text-[11px] text-amber-800 dark:text-amber-300">
                      O Horus ERP rejeita faturamento de itens sem preço de capa ativo na tabela de preços. Ajuste no Horus o preço de capa do item para poder prosseguir.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyZeroCover(true);
                    setShowOnlyUnlocated(false);
                    setShowOnlyPhysical(false);
                    window.scrollTo({ top: 380, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shrink-0 shadow-xs"
                >
                  Ver Itens com Capa Zerada ({zeroCoverCount})
                </button>
              </div>
            )}

            {hasPhysicalBlocker && (
              <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border-2 border-purple-400 dark:border-purple-800 text-purple-900 dark:text-purple-100 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-600 text-white shrink-0">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-black block uppercase text-[11px] text-purple-900 dark:text-purple-200">
                      Transmissão Bloqueada: {physicalCount} {physicalCount === 1 ? 'item identificado como Livro Físico' : 'itens identificados como Livro Físico'} no Horus ERP
                    </span>
                    <span className="text-[11px] text-purple-800 dark:text-purple-300">
                      O repasse Pearson destina-se exclusivamente a E-Books. O ISBN informado pertence à edição impressa (Física no Horus: EBOOK: N). Corrija na planilha para o ISBN do E-Book antes de transmitir o pedido.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOnlyPhysical(true);
                    setShowOnlyUnlocated(false);
                    setShowOnlyZeroCover(false);
                    window.scrollTo({ top: 380, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shrink-0 shadow-xs"
                >
                  Ver Itens Físicos ({physicalCount})
                </button>
              </div>
            )}

            {submitError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Botão de Transmissão */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-slate-500">
                Total do Pedido: <strong className="text-indigo-600 text-sm">{currentTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong> ({items.length} títulos)
                {targetReceivedTotal <= 0 ? (
                  <span className="ml-2 font-bold text-rose-600 dark:text-rose-400">
                    • ⚠ Aguardando Valor Recebido
                  </span>
                ) : targetReceivedTotal < currentTotal ? (
                  <span className="ml-2 font-bold text-amber-600 dark:text-amber-400">
                    • ⚠ Valor Recebido &lt; Total Líquido
                  </span>
                ) : !isMatched ? (
                  <span className="ml-2 font-bold text-amber-600 dark:text-amber-400">
                    • ⚠ Rateio Pendente
                  </span>
                ) : hasCriticalBlocker ? (
                  <span className="ml-2 font-bold text-rose-600 dark:text-rose-400">
                    • ⚠ {unlocatedCount} sem cadastro Horus
                  </span>
                ) : hasZeroCover ? (
                  <span className="ml-2 font-bold text-amber-600 dark:text-amber-400">
                    • ⚠ {zeroCoverCount} com Capa Zerada
                  </span>
                ) : hasPhysicalBlocker ? (
                  <span className="ml-2 font-bold text-purple-700 dark:text-purple-400">
                    • ⚠ {physicalCount} Livro(s) Físico(s) (Requer E-Book)
                  </span>
                ) : hasExceedingCover ? (
                  <span className="ml-2 font-bold text-amber-600 dark:text-amber-400">
                    • ⚠ {exceedingCoverItems.length} com valor &gt; Capa
                  </span>
                ) : (
                  <span className="ml-2 font-bold text-emerald-600 dark:text-emerald-400">
                    • ✓ Pronto para envio
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleCreateAndSendOrder}
                disabled={
                  isSubmitting || 
                  items.length === 0 || 
                  hasCriticalBlocker || 
                  hasZeroCover || 
                  hasPhysicalBlocker || 
                  hasExceedingCover || 
                  targetReceivedTotal <= 0 || 
                  targetReceivedTotal < currentTotal || 
                  !isMatched
                }
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all ${
                  hasCriticalBlocker || hasZeroCover || hasPhysicalBlocker || hasExceedingCover || targetReceivedTotal <= 0 || targetReceivedTotal < currentTotal || !isMatched
                    ? 'bg-rose-600/80 text-white cursor-not-allowed opacity-90'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50'
                }`}
                title={
                  targetReceivedTotal <= 0
                    ? 'Bloqueado: Preencha o Valor Total Recebido (Pearson)'
                    : targetReceivedTotal < currentTotal
                    ? 'Bloqueado: Valor Total Recebido não pode ser menor que o total líquido dos itens'
                    : !isMatched
                    ? 'Bloqueado: Aplique o Rateio na grade para conciliar os valores'
                    : hasCriticalBlocker 
                    ? `Bloqueado: Existem ${unlocatedCount} itens não vinculados ao Horus ERP` 
                    : hasZeroCover
                    ? `Bloqueado: Existem ${zeroCoverCount} itens com Preço de Capa zerado no Horus ERP`
                    : hasPhysicalBlocker
                    ? `Bloqueado: Existem ${physicalCount} itens cadastrados como Livro Físico no Horus (necessário E-book)`
                    : hasExceedingCover
                    ? `Bloqueado: Existem ${exceedingCoverItems.length} itens com valor unitário acima do Preço de Capa`
                    : 'Transmitir pedido ao Horus'
                }
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Transmitindo ao Horus ERP...</span>
                  </>
                ) : targetReceivedTotal <= 0 ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Preencha o Valor Recebido</span>
                  </>
                ) : targetReceivedTotal < currentTotal ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Valor Recebido &lt; Total Líquido</span>
                  </>
                ) : !isMatched ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Bloqueado (Pendente de Rateio)</span>
                  </>
                ) : hasCriticalBlocker ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Bloqueado ({unlocatedCount} {unlocatedCount === 1 ? 'sem Horus' : 'sem Horus'})</span>
                  </>
                ) : hasZeroCover ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Bloqueado ({zeroCoverCount} {zeroCoverCount === 1 ? 'Capa Zerada' : 'Capas Zeradas'})</span>
                  </>
                ) : hasPhysicalBlocker ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Bloqueado ({physicalCount} {physicalCount === 1 ? 'Livro Físico' : 'Livros Físicos'})</span>
                  </>
                ) : hasExceedingCover ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Bloqueado ({exceedingCoverItems.length} &gt; Capa)</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Gerar e Enviar Pedido para o Horus ERP</span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 5. MODAL DE SUCESSO DO PEDIDO GERADO                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {successResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="text-center space-y-2">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCheck className="h-6 w-6" />
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Pedido de E-book Gerado com Sucesso!
              </h3>
              <p className="text-xs text-slate-500">
                {successResult.message}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Pedido Cronuz:</span>
                <strong className="text-slate-900 dark:text-white">#{successResult.order_id}</strong>
              </div>
              {successResult.horus_pedido_venda && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Pedido Horus ERP:</span>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-mono">
                    #{successResult.horus_pedido_venda}
                  </strong>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Referência:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{successResult.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Faturado:</span>
                <strong className="text-emerald-600 font-mono">
                  {successResult.total_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total de Títulos:</span>
                <span className="text-slate-700 dark:text-slate-300">{successResult.total_items} e-books</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSuccessResult(null);
                  setFile(null);
                  setItems([]);
                  setPreviewMeta(null);
                }}
                className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Novo Pedido E-book
              </button>

              <Link
                href="/horus-direct/pedidos"
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold text-center shadow transition-colors inline-flex items-center justify-center gap-1"
              >
                <span>Ver Pedidos</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
