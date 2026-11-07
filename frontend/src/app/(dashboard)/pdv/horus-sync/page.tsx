'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Send,
  Loader2,
  Search,
  Package,
  UserCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MonitorSmartphone,
  ArrowLeft,
  ShieldAlert,
  Calendar,
  Store,
  CreditCard,
  Layers,
  Sparkles,
  Save,
} from 'lucide-react';

import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { POSSessionData } from '@/components/pdv/POSSessionModal';

interface POSSaleRow {
  id: number;
  client_sale_uuid: string;
  sale_number: string;
  session_id?: number;
  customer_name: string;
  customer_document?: string;
  payment_method: string;
  payment_display?: string;
  payment_details?: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  items_count: number;
  sold_at: string;
  sold_at_brt?: string;
  status: string;
  notes?: string;
  items: {
    barcode: string;
    sku?: string;
    horus_item_code?: string;
    title: string;
    publisher?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
}

interface SynthesizedItemLine {
  barcode: string;
  sku: string;
  title: string;
  qty: number;
  unit_price: number;
  total_price: number;
  sales_count: number;
}

interface PreviewBatch {
  batch_number: number;
  total_qty: number;
  total_amount: number;
  items: {
    barcode: string;
    title: string;
    qty: number;
    unit_price: number;
    total_price: number;
  }[];
}

const MAX_HORUS_ORDER_AMOUNT = 10000.0;

export default function PDVHorusSyncPage() {
  const [mounted, setMounted] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean>(true);

  const [sessions, setSessions] = useState<POSSessionData[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [loadingSales, setLoadingSales] = useState(false);
  const [sales, setSales] = useState<POSSaleRow[]>([]);
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<number>>(new Set());
  const [activeViewTab, setActiveViewTab] = useState<'synthesized' | 'sales'>('synthesized');

  // Parâmetros Horus
  const [codCli, setCodCli] = useState('');
  const [clientSearchDoc, setClientSearchDoc] = useState('');
  const [lookingUpClient, setLookingUpClient] = useState(false);
  const [lookedUpClientName, setLookedUpClientName] = useState<string | null>(null);

  const [codTransp, setCodTransp] = useState('');
  const [codParamFiscal, setCodParamFiscal] = useState('1');
  const [tipoPedido, setTipoPedido] = useState('L');
  const [codMetodo, setCodMetodo] = useState('');
  const [codTpoEnd, setCodTpoEnd] = useState('1');
  const [freteEmitDest, setFreteEmitDest] = useState('E');
  const [statusEnvioErp, setStatusEnvioErp] = useState('');
  const [obsExtra, setObsExtra] = useState('');
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const [sending, setSending] = useState(false);

  const [lastResultOrders, setLastResultOrders] = useState<any[] | null>(null);

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  useEffect(() => {
    setMounted(true);
    if (
      currentUser?.type === 'SELLER' &&
      Array.isArray(currentUser?.allowed_modules) &&
      currentUser.allowed_modules.length > 0
    ) {
      const allowed = currentUser.allowed_modules.includes('pdv_horus_sync');
      setHasPermission(allowed);
      if (!allowed) return;
    }

    if (companyId) {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      setStartDate(today);
      setEndDate(today);

      fetchSessions();
      fetchHorusDefaults('');
      loadSalesData({
        session_id: '',
        start_date: today,
        end_date: today,
      });
    }
  }, [companyId]);

  async function fetchSessions() {
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchHorusDefaults(sessId?: string) {
    try {
      const token = getToken();
      const q = sessId ? `?session_id=${sessId}` : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/horus-sync/defaults${q}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.horus_sync_enabled === false) {
          setHasPermission(false);
          return;
        }
        if (cfg.cod_cli !== undefined) setCodCli(cfg.cod_cli || '');
        if (cfg.client_name) setLookedUpClientName(cfg.client_name);
        else if (cfg.cod_cli === '') setLookedUpClientName(null);
        if (cfg.cod_param_fiscal) setCodParamFiscal(cfg.cod_param_fiscal);
        if (cfg.tipo_pedido) setTipoPedido(cfg.tipo_pedido);
        if (cfg.cod_metodo !== undefined) setCodMetodo(cfg.cod_metodo || '');
        if (cfg.cod_tpo_end) setCodTpoEnd(cfg.cod_tpo_end);
        if (cfg.cod_transp !== undefined) setCodTransp(cfg.cod_transp || '');
        if (cfg.frete_emit_dest) setFreteEmitDest(cfg.frete_emit_dest);
        if (cfg.status_envio_erp !== undefined) setStatusEnvioErp(cfg.status_envio_erp || '');
        if (cfg.obs_extra !== undefined) setObsExtra(cfg.obs_extra || '');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSaveDefaults() {
    try {
      setSavingDefaults(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/horus-sync/defaults`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: selectedSessionId ? Number(selectedSessionId) : undefined,
            cod_cli: codCli.trim(),
            client_name: lookedUpClientName || '',
            cod_transp: codTransp.trim(),
            cod_param_fiscal: codParamFiscal.trim() || '1',
            tipo_pedido: tipoPedido || 'L',
            cod_metodo: codMetodo.trim(),
            cod_tpo_end: codTpoEnd.trim() || '1',
            frete_emit_dest: freteEmitDest.trim() || 'E',
            status_envio_erp: statusEnvioErp.trim(),
            obs_extra: obsExtra.trim(),
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Não foi possível salvar os parâmetros padrão.');
      }
      toast.success(
        selectedSessionId
          ? 'Parâmetros padrão salvos para esta sessão e para o seller!'
          : 'Parâmetros padrão salvos e guardados para o seller!'
      );
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar parâmetros padrão');
    } finally {
      setSavingDefaults(false);
    }
  }


  async function loadSalesData(custom?: { session_id?: string; start_date?: string; end_date?: string }) {
    try {
      setLoadingSales(true);
      const token = getToken();
      const sId = custom?.session_id !== undefined ? custom.session_id : selectedSessionId;
      const sDate = custom?.start_date !== undefined ? custom.start_date : startDate;
      const eDate = custom?.end_date !== undefined ? custom.end_date : endDate;

      const params = new URLSearchParams();
      if (sId) params.append('session_id', sId);
      if (sDate) params.append('start_date', sDate);
      if (eDate) params.append('end_date', eDate);
      params.append('status', 'COMPLETED');
      params.append('limit', '500');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sales?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        throw new Error('Falha ao buscar vendas do período');
      }
      const data = await res.json();
      const list: POSSaleRow[] = Array.isArray(data?.sales) ? data.sales : Array.isArray(data) ? data : [];
      setSales(list);

      const initialIds = new Set<number>();
      for (const s of list) {
        const alreadySent = (s.notes || '').includes('[HORUS_PED:');
        if (!alreadySent) {
          initialIds.add(s.id);
        }
      }
      if (initialIds.size === 0 && list.length > 0) {
        for (const s of list) initialIds.add(s.id);
      }
      setSelectedSaleIds(initialIds);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao buscar vendas');
    } finally {
      setLoadingSales(false);
    }
  }

  async function handleLookupClient() {
    const q = (clientSearchDoc || codCli).trim();
    if (!q) {
      toast.error('Informe um CPF, CNPJ ou Código de Cliente para consultar no Horus.');
      return;
    }
    try {
      setLookingUpClient(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/horus-sync/lookup-client?query=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Cliente não localizado no Horus.');
      }
      const data = await res.json();
      if (data.cod_cli) {
        setCodCli(String(data.cod_cli));
        setLookedUpClientName(`${data.name} (${data.document || 'Sem doc'})`);
        toast.success(`Cliente localizado no Horus: #${data.cod_cli} — ${data.name}`);
      }
    } catch (e: any) {
      setLookedUpClientName(null);
      toast.error(e.message || 'Falha ao consultar cliente no Horus');
    } finally {
      setLookingUpClient(false);
    }
  }

  function toggleSaleSelection(id: number) {
    setSelectedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll(onlyUnsent = false) {
    if (!onlyUnsent && selectedSaleIds.size === sales.length) {
      setSelectedSaleIds(new Set());
      return;
    }
    const next = new Set<number>();
    for (const s of sales) {
      if (onlyUnsent && (s.notes || '').includes('[HORUS_PED:')) continue;
      next.add(s.id);
    }
    setSelectedSaleIds(next);
  }

  const selectedSales = useMemo(
    () => sales.filter((s) => selectedSaleIds.has(s.id)),
    [sales, selectedSaleIds]
  );

  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {
      DINHEIRO: 0,
      PIX: 0,
      DEBITO: 0,
      CREDITO: 0,
    };
    for (const s of selectedSales) {
      const method = (s.payment_method || 'DINHEIRO').toUpperCase();
      if (method === 'MISTO' && s.payment_details) {
        try {
          const parsed = typeof s.payment_details === 'string' ? JSON.parse(s.payment_details) : s.payment_details;
          if (Array.isArray(parsed?.payments) && parsed.payments.length > 0) {
            for (const p of parsed.payments) {
              const subM = String(p.method || 'OUTROS').toUpperCase();
              map[subM] = (map[subM] || 0) + Number(p.amount || 0);
            }
            continue;
          }
        } catch {
          // fallback
        }
      }
      map[method] = (map[method] || 0) + Number(s.total_amount || 0);
    }
    return map;
  }, [selectedSales]);

  const { synthesizedItems, previewBatches, totalSelectedAmount, totalSelectedQty } = useMemo(() => {
    const byBarcode = new Map<
      string,
      {
        barcode: string;
        sku: string;
        title: string;
        qty: number;
        total_price: number;
        sales_ids: Set<number>;
      }
    >();

    let sumSalesAmount = 0;
    let sumQty = 0;

    for (const s of selectedSales) {
      const saleTotal = Math.round(Number(s.total_amount || 0) * 100) / 100;
      sumSalesAmount = Math.round((sumSalesAmount + saleTotal) * 100) / 100;
      const items = s.items || [];
      if (items.length === 0) continue;

      const rawItemsSum = Math.round(items.reduce((acc, it) => acc + Number(it.total_price || 0), 0) * 100) / 100;
      const ratio = rawItemsSum > 0 && Math.abs(rawItemsSum - saleTotal) >= 0.01 ? saleTotal / rawItemsSum : 1.0;

      let remSaleVal = saleTotal;
      items.forEach((it, idx) => {
        const q = Math.max(1, Math.round(Number(it.quantity || 1)));
        sumQty += q;
        let netItemTotal: number;
        if (idx === items.length - 1 && ratio !== 1.0) {
          netItemTotal = Math.max(0.01, Math.round(remSaleVal * 100) / 100);
        } else {
          netItemTotal = Math.round(Number(it.total_price || 0) * ratio * 100) / 100;
          remSaleVal = Math.round((remSaleVal - netItemTotal) * 100) / 100;
        }

        const bcode = String(it.barcode || it.sku || it.horus_item_code || `ITEM-${idx}`).trim().toUpperCase();
        const existing = byBarcode.get(bcode);
        if (existing) {
          existing.qty += q;
          existing.total_price = Math.round((existing.total_price + netItemTotal) * 100) / 100;
          existing.sales_ids.add(s.id);
        } else {
          byBarcode.set(bcode, {
            barcode: bcode,
            sku: String(it.horus_item_code || it.sku || bcode),
            title: it.title || 'Item sem título',
            qty: q,
            total_price: netItemTotal,
            sales_ids: new Set([s.id]),
          });
        }
      });
    }

    const synthList: SynthesizedItemLine[] = [];
    const linesForBatching: SynthesizedItemLine[] = [];

    for (const g of byBarcode.values()) {
      const baseUnit = Math.round((g.total_price / g.qty) * 100) / 100;
      const reconstructed = Math.round(baseUnit * g.qty * 100) / 100;
      const diff = Math.round((g.total_price - reconstructed) * 100) / 100;

      synthList.push({
        barcode: g.barcode,
        sku: g.sku,
        title: g.title,
        qty: g.qty,
        unit_price: baseUnit,
        total_price: g.total_price,
        sales_count: g.sales_ids.size,
      });

      if (Math.abs(diff) < 0.005 || g.qty === 1) {
        linesForBatching.push({
          barcode: g.barcode,
          sku: g.sku,
          title: g.title,
          qty: g.qty,
          unit_price: baseUnit,
          total_price: reconstructed,
          sales_count: g.sales_ids.size,
        });
      } else {
        const mainQty = g.qty - 1;
        const adjUnit = Math.round((baseUnit + diff) * 100) / 100;
        if (adjUnit > 0) {
          linesForBatching.push({
            barcode: g.barcode,
            sku: g.sku,
            title: g.title,
            qty: mainQty,
            unit_price: baseUnit,
            total_price: Math.round(baseUnit * mainQty * 100) / 100,
            sales_count: g.sales_ids.size,
          });
          linesForBatching.push({
            barcode: g.barcode,
            sku: g.sku,
            title: g.title,
            qty: 1,
            unit_price: adjUnit,
            total_price: adjUnit,
            sales_count: g.sales_ids.size,
          });
        } else {
          linesForBatching.push({
            barcode: g.barcode,
            sku: g.sku,
            title: g.title,
            qty: g.qty,
            unit_price: baseUnit,
            total_price: reconstructed,
            sales_count: g.sales_ids.size,
          });
        }
      }
    }

    const batches: PreviewBatch[] = [];
    let curItems: PreviewBatch['items'] = [];
    let curTotal = 0;

    for (const line of linesForBatching) {
      let remQty = line.qty;
      const uPrice = line.unit_price;

      while (remQty > 0) {
        const spaceLeft = Math.round((MAX_HORUS_ORDER_AMOUNT - curTotal) * 100) / 100;
        const fitQty = uPrice <= 0 ? remQty : Math.floor((spaceLeft + 1e-6) / uPrice);

        if (fitQty <= 0) {
          if (curItems.length > 0) {
            batches.push({
              batch_number: batches.length + 1,
              total_qty: curItems.reduce((a, i) => a + i.qty, 0),
              total_amount: Math.round(curTotal * 100) / 100,
              items: curItems,
            });
            curItems = [];
            curTotal = 0;
            continue;
          }
        }

        const takeQty = Math.min(remQty, Math.max(1, fitQty));
        const partTotal = Math.round(takeQty * uPrice * 100) / 100;
        curItems.push({
          barcode: line.barcode,
          title: line.title,
          qty: takeQty,
          unit_price: uPrice,
          total_price: partTotal,
        });
        curTotal = Math.round((curTotal + partTotal) * 100) / 100;
        remQty -= takeQty;

        if (remQty > 0) {
          batches.push({
            batch_number: batches.length + 1,
            total_qty: curItems.reduce((a, i) => a + i.qty, 0),
            total_amount: Math.round(curTotal * 100) / 100,
            items: curItems,
          });
          curItems = [];
          curTotal = 0;
        }
      }
    }

    if (curItems.length > 0) {
      batches.push({
        batch_number: batches.length + 1,
        total_qty: curItems.reduce((a, i) => a + i.qty, 0),
        total_amount: Math.round(curTotal * 100) / 100,
        items: curItems,
      });
    }

    return {
      synthesizedItems: synthList,
      previewBatches: batches,
      totalSelectedAmount: sumSalesAmount,
      totalSelectedQty: sumQty,
    };
  }, [selectedSales]);

  async function handleSendToHorus() {
    if (!codCli.trim()) {
      toast.error('Informe o Código do Cliente no Horus (COD_CLI) antes de enviar.');
      return;
    }
    if (selectedSaleIds.size === 0) {
      toast.error('Selecione ao menos uma venda para sintetizar e enviar ao Horus.');
      return;
    }

    try {
      setSending(true);
      setLastResultOrders(null);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/horus-sync/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sale_ids: Array.from(selectedSaleIds),
            session_id: selectedSessionId ? Number(selectedSessionId) : undefined,
            cod_cli: codCli.trim(),
            cod_transp: codTransp.trim() || undefined,
            cod_param_fiscal: codParamFiscal.trim() || undefined,
            tipo_pedido: tipoPedido || 'L',
            cod_metodo: codMetodo.trim() || undefined,
            cod_tpo_end: codTpoEnd.trim() || undefined,
            frete_emit_dest: freteEmitDest.trim() || undefined,
            status_envio_erp: statusEnvioErp.trim() || undefined,
            max_order_amount: MAX_HORUS_ORDER_AMOUNT,
            obs_extra: obsExtra.trim() || undefined,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível enviar os pedidos para o Horus.');
      }

      toast.success(data.message || 'Pedido(s) enviado(s) ao Horus com sucesso!');
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        toast.warning(`Atenção em ${data.warnings.length} item(ns): ${data.warnings[0]}`);
      }
      setLastResultOrders(data.orders || []);
      await loadSalesData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao integrar vendas com o Horus ERP');
    } finally {
      setSending(false);
    }
  }

  if (!mounted) return null;

  if (!hasPermission) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-12">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Acesso Restrito
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Seu usuário não possui permissão liberada para acessar a rotina de Envio de Vendas do PDV para o Horus ERP. Solicite a liberação ao administrador da sua organização.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">
                Sincronizar Vendas PDV com Horus ERP
              </h1>

              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                Teto R$ 10.000,00 / Pedido
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Selecione a sessão e o período, visualize o resumo financeiro por forma de pagamento e sintetize os itens vendidos em pedidos no Horus ERP.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Link
            href="/pdv"
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition"
          >
            <MonitorSmartphone className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Ir para Frente de Caixa
          </Link>

          <button
            type="button"
            onClick={handleSendToHorus}
            disabled={sending || selectedSales.length === 0 || !codCli.trim()}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Sintetizar e Enviar {previewBatches.length > 1 ? `${previewBatches.length} Pedidos` : 'Pedido'}
          </button>
        </div>
      </div>

      {/* 1. Barra de Filtro: Sessão e Período */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Sessão / Evento do PDV
          </label>
          <select
            value={selectedSessionId}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedSessionId(val);
              fetchHorusDefaults(val);
            }}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Todas as Sessões Disponíveis</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Data Inicial
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
            Data Final
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <button
          type="button"
          onClick={() => loadSalesData()}
          disabled={loadingSales}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 flex items-center justify-center gap-1.5 transition h-[38px]"
        >
          {loadingSales ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Buscar Vendas do Período
        </button>
      </div>

      {/* 2. Resumo Visual das Vendas Selecionadas + Formas de Pagamento + Lotes Horus */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Total Selecionado p/ Envio
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            R$ {totalSelectedAmount.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-400">
            {selectedSales.length} de {sales.length} vendas flegadas
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Itens Sintetizados (Unificados)
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">
            {synthesizedItems.length} ISBNs ({totalSelectedQty} un)
          </span>
          <span className="text-[11px] text-slate-400">
            Agrupados por código de barras e rateados
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Divisão Automática (Teto R$ 10 mil)
          </span>
          <span className="text-2xl font-black text-teal-600 dark:text-teal-400 mt-1 block">
            {previewBatches.length} {previewBatches.length === 1 ? 'Pedido Horus' : 'Pedidos Horus'}
          </span>
          <span className="text-[11px] text-teal-600/80 dark:text-teal-400/80">
            Máximo de R$ 10.000,00 por pedido enviado
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Resumo Visual por Pagamento
          </span>
          <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 mt-1.5">
            <div className="flex justify-between">
              <span>💵 Dinheiro:</span>
              <b className="font-mono">R$ {(paymentBreakdown['DINHEIRO'] || 0).toFixed(2)}</b>
            </div>
            <div className="flex justify-between">
              <span>⚡ PIX:</span>
              <b className="font-mono">R$ {(paymentBreakdown['PIX'] || 0).toFixed(2)}</b>
            </div>
            <div className="flex justify-between">
              <span>💳 Cartão (Déb/Créd):</span>
              <b className="font-mono">
                R$ {((paymentBreakdown['DEBITO'] || 0) + (paymentBreakdown['CREDITO'] || 0)).toFixed(2)}
              </b>
            </div>
          </div>
        </div>
      </div>

      {/* Resultado do último envio */}
      {lastResultOrders && lastResultOrders.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            <span>Pedidos gerados e integrados com sucesso no Horus ERP:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lastResultOrders.map((ord: any) => (
              <div
                key={ord.cod_ped_venda}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-slate-800 dark:text-slate-200 shadow-2xs"
              >
                Lote {ord.batch_number}:{' '}
                <span className="font-black text-emerald-600 dark:text-emerald-400">
                  Pedido Horus #{ord.cod_ped_venda}
                </span>{' '}
                • {ord.total_qty} un • R$ {Number(ord.total_amount).toFixed(2)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Configuração do Cliente e Transportadora no Horus */}
      <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4" />
            Destinatário do(s) Pedido(s) no Horus ERP
          </h2>
          <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowAdvancedParams((prev) => !prev)}
              className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 hover:underline flex items-center gap-1"
            >
              {showAdvancedParams ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showAdvancedParams
                ? 'Ocultar parâmetros fiscais do Horus'
                : 'Configurar parâmetros fiscais do Horus (CFOP / Tipo / Status)'}
            </button>

            <button
              type="button"
              onClick={handleSaveDefaults}
              disabled={savingDefaults}
              className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {savingDefaults ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar Padrões
            </button>
          </div>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          {/* Código do Cliente */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
              Código do Cliente no Horus (`COD_CLI`) *
            </label>
            <input
              type="text"
              placeholder="Ex: 10452"
              value={codCli}
              onChange={(e) => setCodCli(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/30 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Busca rápida por CPF/CNPJ no Horus */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Ou buscar `COD_CLI` por CPF/CNPJ no Horus
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Digite CPF, CNPJ ou Código..."
                value={clientSearchDoc}
                onChange={(e) => setClientSearchDoc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLookupClient();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={handleLookupClient}
                disabled={lookingUpClient}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50"
              >
                {lookingUpClient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Buscar
              </button>
            </div>
          </div>

          {/* Código da Transportadora (Opcional) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Código da Transportadora (`COD_TRANSP` - Opcional)
            </label>
            <input
              type="text"
              placeholder="Deixe vazio para enviar sem transportadora"
              value={codTransp}
              onChange={(e) => setCodTransp(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {lookedUpClientName && (
          <div className="text-xs font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1.5 bg-teal-50/60 dark:bg-teal-950/30 px-3 py-2 rounded-xl border border-teal-200/70 dark:border-teal-800/60">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Cliente confirmado no Horus: <b>#{codCli} — {lookedUpClientName}</b>
            </span>
          </div>
        )}

        {/* Parâmetros avançados do Horus (recolhíveis) */}
        {showAdvancedParams && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Tipo Pedido (`L` ou `V`)
              </label>
              <select
                value={tipoPedido}
                onChange={(e) => setTipoPedido(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              >
                <option value="L">L (Logística / Padrão)</option>
                <option value="V">V (Venda Direta)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Parâm. Fiscal (`COD_PARAM_FISCAL`)
              </label>
              <input
                type="text"
                value={codParamFiscal}
                onChange={(e) => setCodParamFiscal(e.target.value)}
                placeholder="Ex: 1"
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Tipo Endereço (`COD_TPO_END`)
              </label>
              <input
                type="text"
                value={codTpoEnd}
                onChange={(e) => setCodTpoEnd(e.target.value)}
                placeholder="Ex: 1"
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Status ERP (`AltStatus`)
              </label>
              <input
                type="text"
                value={statusEnvioErp}
                onChange={(e) => setStatusEnvioErp(e.target.value)}
                placeholder="Ex: LEX ou LAP (opcional)"
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Observação Extra no Pedido
              </label>
              <input
                type="text"
                value={obsExtra}
                onChange={(e) => setObsExtra(e.target.value)}
                placeholder="Opcional"
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. Abas de Visualização: Itens Sintetizados & Lotes vs Seleção de Vendas */}
      <div className="p-4 md:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveViewTab('synthesized')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeViewTab === 'synthesized'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              📦 Itens Sintetizados ({synthesizedItems.length}) & Lotes ({previewBatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('sales')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                activeViewTab === 'sales'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              🧾 Selecionar Vendas Individualmente ({selectedSales.length}/{sales.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {selectedSaleIds.size === sales.length && sales.length > 0
                ? 'Desmarcar Todas'
                : 'Marcar Todas as Vendas'}
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition"
            >
              Apenas Não Enviadas
            </button>
          </div>
        </div>

        {loadingSales ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
            <span className="text-xs font-semibold">Carregando e sintetizando vendas...</span>
          </div>
        ) : sales.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            Nenhuma venda concluída encontrada para a sessão e período selecionados.
          </div>
        ) : activeViewTab === 'synthesized' ? (
          <div className="space-y-4">
            {/* Preview dos Lotes de até R$ 10.000,00 */}
            {previewBatches.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {previewBatches.map((b) => (
                  <div
                    key={b.batch_number}
                    className="p-3.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase text-teal-700 dark:text-teal-300 block">
                        Pedido Horus #{b.batch_number} de {previewBatches.length}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {b.items.length} linhas • {b.total_qty} exemplares
                      </span>
                    </div>
                    <span className="text-sm font-black text-teal-700 dark:text-teal-300 font-mono">
                      R$ {b.total_amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Tabela de Itens Sintetizados */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">ISBN / Código</th>
                    <th className="px-4 py-3">Título do Produto</th>
                    <th className="px-4 py-3 text-center">Aparece em</th>
                    <th className="px-4 py-3 text-center">Qtd Unificada</th>
                    <th className="px-4 py-3 text-right">Vlr. Unit. Médio</th>
                    <th className="px-4 py-3 text-right">Subtotal Sintetizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {synthesizedItems.map((it) => (
                    <tr key={it.barcode} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {it.barcode}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white max-w-md truncate">
                        {it.title}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {it.sales_count} {it.sales_count === 1 ? 'venda' : 'vendas'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-black text-teal-600 dark:text-teal-400 text-sm">
                        {it.qty} un
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        R$ {it.unit_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        R$ {it.total_price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Aba de Seleção Individual de Vendas */
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3.5 py-3 text-center w-10">Enviar</th>
                  <th className="px-3.5 py-3">Data / Hora (BRT)</th>
                  <th className="px-3.5 py-3">Nº Venda</th>
                  <th className="px-3.5 py-3">Cliente na Venda</th>
                  <th className="px-3.5 py-3 text-center">Pagamento</th>
                  <th className="px-3.5 py-3 text-center">Itens</th>
                  <th className="px-3.5 py-3 text-right">Total</th>
                  <th className="px-3.5 py-3 text-center">Status Horus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {sales.map((s) => {
                  const isChecked = selectedSaleIds.has(s.id);
                  const horusMatch = (s.notes || '').match(/\[HORUS_PED:([^\]]+)\]/);
                  const horusPedStr = horusMatch ? horusMatch[1] : null;

                  return (
                    <tr
                      key={s.id}
                      onClick={() => toggleSaleSelection(s.id)}
                      className={`cursor-pointer transition ${
                        isChecked
                          ? 'bg-teal-50/40 dark:bg-teal-950/20 hover:bg-teal-50/70'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 opacity-60'
                      }`}
                    >
                      <td className="px-3.5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3.5 py-2.5 text-[11px] text-slate-500">
                        {s.sold_at_brt || new Date(s.sold_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">
                        {s.sale_number}
                      </td>
                      <td className="px-3.5 py-2.5">{s.customer_name}</td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                          {s.payment_display || s.payment_method}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-bold">{s.items_count} un</td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        R$ {Number(s.total_amount).toFixed(2)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        {horusPedStr ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            Enviado (#{horusPedStr})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                            Não enviado
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
    </div>
  );
}
