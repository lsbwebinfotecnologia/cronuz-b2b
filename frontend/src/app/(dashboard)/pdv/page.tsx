'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  ShoppingCart, 
  User, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard,
  Banknote,
  QrCode,
  Tag,
  Loader2,
  CheckCircle2,
  PackageSearch,
  Users,
  Camera,
  Pin,
  PinOff,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  BarChart3,
  Store,
  Layers,
  ArrowRight,
  Split,
  ChevronDown,
  Lock,
  ShieldAlert,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

import { 
  openPdvDb, 
  saveCatalogItems, 
  searchCatalogItems, 
  getCatalogItemByBarcode, 
  getCatalogCount, 
  savePendingSale, 
  getPendingSales, 
  markSalesAsSynced, 
  getUnsyncedSalesCount,
  setPdvSetting,
  getPdvSetting,
  playSuccessBeep, 
  playWarningBeep,
  PDVCatalogItem,
  PDVPendingSaleRecord,
  PDVSaleItemRecord
} from '@/lib/pdvIndexedDb';

import CameraBarcodeScanner from '@/components/inventory/CameraBarcodeScanner';
import POSCatalogLoadModal from '@/components/pdv/POSCatalogLoadModal';
import POSSessionModal, { POSSessionData } from '@/components/pdv/POSSessionModal';
import POSSalesHistoryModal from '@/components/pdv/POSSalesHistoryModal';
import POSReceiptModal from '@/components/pdv/POSReceiptModal';

interface CartItem extends PDVCatalogItem {
  quantity: number;
}

interface CustomerOption {
  id: number;
  name: string;
  document?: string;
  email?: string;
}

export default function PDVPage() {
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);

  // Permissão do Módulo PDV e Configurações de Saldo
  const [checkingModule, setCheckingModule] = useState(true);
  const [isModuleAllowed, setIsModuleAllowed] = useState<boolean | null>(null);
  const [validateStock, setValidateStock] = useState<boolean>(true);

  // Modais de Controle
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<PDVPendingSaleRecord | null>(null);

  // Sessão Ativa
  const [activeSession, setActiveSession] = useState<POSSessionData | null>(null);

  // Scanner Câmera & Input Físico
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Catálogo & Busca
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PDVCatalogItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Carrinho
  const [cart, setCart] = useState<CartItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);

  // Consumidor & Fixação 📌
  const [customerMode, setCustomerMode] = useState<'final' | 'manual' | 'registered'>('final');
  const [customerName, setCustomerName] = useState('Consumidor Final');
  const [customerDoc, setCustomerDoc] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isCustomerPinned, setIsCustomerPinned] = useState(false);
  
  // Busca de clientes cadastrados
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerList, setCustomerList] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  // Checkout & Pagamento
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'MISTO'>('DINHEIRO');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [splitDetails, setSplitDetails] = useState({ dinheiro: '', pix: '', cartao: '' });
  const [saleNotes, setSaleNotes] = useState('');

  // Mobile View Tabs (no celular pode alternar entre 'produtos' e 'carrinho')
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  // ─── 1. Inicialização & Verificação de Módulo/Configuração ──────────────────
  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida! Sincronizando vendas...');
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Modo Offline ativado: as vendas serão gravadas localmente.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Carregar contadores do IndexedDB e verificar permissões
    openPdvDb().then(async () => {
      const cCount = await getCatalogCount();
      setCatalogCount(cCount);
      const uCount = await getUnsyncedSalesCount();
      setUnsyncedCount(uCount);

      // Carregar cache offline de permissão e saldo
      const cachedModule = await getPdvSetting<boolean>('isModuleAllowed');
      const cachedValStock = await getPdvSetting<boolean>('validateStock');
      if (cachedModule !== null) setIsModuleAllowed(cachedModule);
      if (cachedValStock !== null) setValidateStock(cachedValStock);

      // Consulta configuração atualizada no servidor se online
      if (companyId) {
        try {
          const token = getToken();
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/config`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) {
            const cfg = await res.json();
            const allowed = currentUser?.type === 'MASTER' || !!cfg.module_pdv;
            setIsModuleAllowed(allowed);
            const valStock = cfg.validate_stock ?? !cfg.pdv_allow_out_of_stock;
            setValidateStock(valStock);
            await setPdvSetting('validateStock', valStock);
            await setPdvSetting('isModuleAllowed', allowed);
          } else if (res.status === 403) {
            setIsModuleAllowed(false);
            await setPdvSetting('isModuleAllowed', false);
          }
        } catch {
          // Se falhar rede, mantém o cache offline
        } finally {
          setCheckingModule(false);
        }
      } else {
        setCheckingModule(false);
      }

      // Se estiver online e houver pendências, sincroniza
      if (navigator.onLine && uCount > 0) {
        triggerSync();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [companyId]);

  // ─── 2. Sincronizador de Vendas Offline ─────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || !companyId || isSyncing) return;
    try {
      setIsSyncing(true);
      const pending = await getPendingSales('pending');
      if (pending.length === 0) {
        setUnsyncedCount(0);
        return;
      }

      const token = getToken();
      const payload = {
        sales: pending.map((s) => ({
          client_sale_uuid: s.client_sale_uuid,
          sale_number: s.sale_number,
          session_id: s.session_id,
          customer_name: s.customer_name,
          customer_document: s.customer_document,
          customer_id: s.customer_id,
          payment_method: s.payment_method,
          payment_details: s.payment_details,
          subtotal: s.subtotal,
          discount: s.discount,
          total_amount: s.total_amount,
          items_count: s.items_count,
          sold_at: s.sold_at,
          origin: s.origin,
          notes: s.notes,
          items: s.items.map((it) => ({
            barcode: it.barcode,
            sku: it.sku,
            title: it.title,
            publisher: it.publisher,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total_price: it.total_price,
            horus_item_code: it.horus_item_code,
            product_id: it.product_id,
          })),
        })),
        session_id: activeSession?.id || undefined,
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sync-sales`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.synced_uuids && data.synced_uuids.length > 0) {
          await markSalesAsSynced(data.synced_uuids);
          const remaining = await getUnsyncedSalesCount();
          setUnsyncedCount(remaining);
          toast.success(`${data.synced_uuids.length} vendas sincronizadas com sucesso!`);
        }
      }
    } catch (e) {
      console.error('Falha na sincronização em background', e);
    } finally {
      setIsSyncing(false);
    }
  }, [companyId, isSyncing, activeSession]);

  // ─── 3. Busca de Produtos (Local IndexedDB + Fallback) ─────────────────────
  async function performProductSearch(query: string) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // 1. Primeiro consulta banco local IndexedDB
      const localMatches = await searchCatalogItems(query, 30);
      if (localMatches.length > 0) {
        setSearchResults(localMatches);
        setSearching(false);
        return;
      }

      // 2. Se não achou localmente e está online, consulta servidor
      if (navigator.onLine && companyId) {
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products?search=${encodeURIComponent(query)}&limit=20`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const items = data.items || data || [];
          const formatted: PDVCatalogItem[] = items.map((p: any) => ({
            barcode: p.ean_gtin || p.sku || String(p.id),
            sku: p.sku || '',
            title: p.name || 'Sem nome',
            publisher: p.brand || '',
            price: Number(p.price) || 0,
            stock: Number(p.stock) || 0,
            product_id: p.id,
            source: 'ONLINE',
          }));
          setSearchResults(formatted);
        }
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  // ─── 4. Bipe Instantâneo de Código de Barras / ISBN ───────────────────────
  async function handleBarcodeSubmit(barcodeToScan?: string) {
    const code = (barcodeToScan || barcodeInput).trim();
    if (!code) return;

    // Busca exata no banco local
    let item = await getCatalogItemByBarcode(code);

    // Fallback se não achou no índice exato
    if (!item) {
      const searchRes = await searchCatalogItems(code, 1);
      if (searchRes.length > 0 && (searchRes[0].barcode === code || searchRes[0].sku === code)) {
        item = searchRes[0];
      }
    }

    if (item) {
      addToCart(item);
      playSuccessBeep();
      setBarcodeInput('');
      setSearchQuery('');
      setSearchResults([]);
    } else {
      // Se online, tenta última chance no servidor
      if (navigator.onLine && companyId) {
        try {
          const token = getToken();
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products?search=${encodeURIComponent(code)}&limit=1`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) {
            const data = await res.json();
            const found = (data.items || data || [])[0];
            if (found) {
              const formatted: PDVCatalogItem = {
                barcode: found.ean_gtin || found.sku || String(found.id),
                sku: found.sku || '',
                title: found.name || 'Sem nome',
                publisher: found.brand || '',
                price: Number(found.price) || 0,
                stock: Number(found.stock) || 0,
                product_id: found.id,
              };
              addToCart(formatted);
              playSuccessBeep();
              setBarcodeInput('');
              return;
            }
          }
        } catch {}
      }

      playWarningBeep();
      toast.error(`Produto com código ${code} não encontrado no catálogo.`);
      setBarcodeInput('');
    }

    // Refoca o input para próximos bipes de leitor
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  }

  // ─── 5. Manipulação do Carrinho (Com Validação de Saldo) ─────────────────
  function addToCart(product: PDVCatalogItem) {
    const existing = cart.find((i) => i.barcode === product.barcode);
    const currentQtyInCart = existing ? existing.quantity : 0;
    const availableStock = product.stock !== undefined ? Number(product.stock) : 0;

    // Se validação de saldo estiver ativa no cadastro do seller:
    if (validateStock) {
      if (availableStock <= 0) {
        playWarningBeep();
        toast.error(`"${product.title}" está sem estoque (${availableStock} un). A validação de saldo está ativa nas configurações.`);
        return;
      }
      if (currentQtyInCart + 1 > availableStock) {
        playWarningBeep();
        toast.warning(`Limite de estoque atingido para "${product.title}" (${availableStock} un disponíveis).`);
        return;
      }
    }

    setCart((prev) => {
      const existingItem = prev.find((i) => i.barcode === product.barcode);
      if (existingItem) {
        return prev.map((i) =>
          i.barcode === product.barcode ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function updateQuantity(barcode: string, delta: number) {
    const item = cart.find((i) => i.barcode === barcode);
    if (!item) return;

    if (delta > 0 && validateStock) {
      const availableStock = item.stock !== undefined ? Number(item.stock) : 0;
      if (item.quantity + delta > availableStock) {
        playWarningBeep();
        toast.warning(`Limite de estoque atingido (${availableStock} un disponíveis).`);
        return;
      }
    }

    setCart((prev) =>
      prev
        .map((i) => {
          if (i.barcode === barcode) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean) as CartItem[]
    );
  }

  function removeItem(barcode: string) {
    setCart((prev) => prev.filter((i) => i.barcode !== barcode));
  }

  function clearCart() {
    setCart([]);
    setGlobalDiscount(0);
    setCashReceived('');
    setSplitDetails({ dinheiro: '', pix: '', cartao: '' });
    setSaleNotes('');
  }

  // ─── 6. Totais e Cálculos ─────────────────────────────────────────────────
  const subtotal = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const totalAmount = Math.max(0, subtotal - globalDiscount);
  const itemsCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  // Troco para dinheiro
  const cashVal = parseFloat(cashReceived.replace(',', '.')) || 0;
  const changeAmount = paymentMethod === 'DINHEIRO' && cashVal > totalAmount ? cashVal - totalAmount : 0;

  // ─── 7. Finalização da Venda ──────────────────────────────────────────────
  async function handleFinalizeSale() {
    if (cart.length === 0) {
      toast.error('O carrinho está vazio');
      return;
    }

    const saleUuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const saleNumber = `PDV-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

    const itemsRecord: PDVSaleItemRecord[] = cart.map((it) => ({
      barcode: it.barcode,
      sku: it.sku,
      title: it.title,
      publisher: it.publisher,
      quantity: it.quantity,
      unit_price: it.price,
      total_price: it.price * it.quantity,
      horus_item_code: it.horus_item_code,
      product_id: it.product_id,
    }));

    // Detalhes extras de pagamento
    let pDetails = '';
    if (paymentMethod === 'DINHEIRO') {
      pDetails = JSON.stringify({ valor_recebido: cashVal, troco: changeAmount });
    } else if (paymentMethod === 'MISTO') {
      pDetails = JSON.stringify(splitDetails);
    }

    const saleRecord: PDVPendingSaleRecord = {
      client_sale_uuid: saleUuid,
      sale_number: saleNumber,
      session_id: activeSession?.id,
      customer_name: customerName.trim() || 'Consumidor Final',
      customer_document: customerDoc.trim() || undefined,
      customer_id: selectedCustomerId || undefined,
      payment_method: paymentMethod,
      payment_details: pDetails || undefined,
      subtotal,
      discount: globalDiscount,
      total_amount: totalAmount,
      items_count: itemsCount,
      sold_at: now.toISOString(),
      status: 'pending',
      origin: 'pdv_offline',
      notes: saleNotes || undefined,
      items: itemsRecord,
    };

    try {
      // 1. Salva com segurança absoluta no IndexedDB local
      await savePendingSale(saleRecord);
      playSuccessBeep();

      const newUnsynced = await getUnsyncedSalesCount();
      setUnsyncedCount(newUnsynced);

      // 2. Abre comprovante
      setCompletedSale(saleRecord);
      setIsCheckoutOpen(false);

      // 3. Regra de Fixação de Consumidor 📌
      clearCart();
      if (!isCustomerPinned) {
        setCustomerMode('final');
        setCustomerName('Consumidor Final');
        setCustomerDoc('');
        setSelectedCustomerId(null);
      } else {
        toast.info(`Consumidor "${customerName}" mantido fixado para o próximo atendimento.`);
      }

      // 4. Se online, dispara sincronização em segundo plano sem travar
      if (navigator.onLine) {
        triggerSync();
      }
    } catch (e: any) {
      console.error('Erro ao registrar venda', e);
      toast.error('Erro ao gravar venda localmente.');
    }
  }

  // ─── 8. Busca de Clientes Cadastrados ─────────────────────────────────────
  async function searchCustomers(q: string) {
    if (!q.trim() || !companyId) return;
    setSearchingCustomer(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers?search=${encodeURIComponent(q)}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setCustomerList(data.items || data || []);
      }
    } catch {}
    finally {
      setSearchingCustomer(false);
    }
  }

  if (!mounted || checkingModule) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Validando permissões do PDV...
          </span>
        </div>
      </div>
    );
  }

  // [REQUISITO] A tela do PDV só pode ser liberada para clientes que estão com módulo PDV ativo no cadastro do seller
  if (isModuleAllowed === false && currentUser?.type !== 'MASTER') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-6 text-center bg-slate-50 dark:bg-slate-950 animate-in fade-in">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 shadow-xl">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Módulo PDV Desativado</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2 leading-relaxed">
          O módulo de <strong>Ponto de Venda (PDV)</strong> não está ativo no cadastro desta empresa no painel do seller.
        </p>
        <p className="text-xs text-slate-400 max-w-md mt-1">
          Solicite ao administrador do sistema a ativação do módulo PDV para liberar o acesso a esta tela.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition shadow-md"
        >
          Voltar ao Painel Principal
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-100 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
      
      {/* ── TOP BAR (Status de Conexão, Sessão Ativa, Carga e Histórico) ──── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between gap-2 shadow-sm z-10">
        
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Store className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-sm font-bold tracking-tight">PDV Mobile & Balcão</h1>
              
              {/* Online/Offline Badge */}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  isOnline
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                }`}
              >
                {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>

              {/* Stock Validation Badge */}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  validateStock
                    ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                }`}
                title={
                  validateStock
                    ? 'Validação de saldo ativa: bloqueia itens sem estoque'
                    : 'Venda sem saldo liberada no cadastro do seller'
                }
              >
                {validateStock ? <ShieldAlert className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
                {validateStock ? 'Valida Saldo' : 'Venda s/ Saldo'}
              </span>

              {/* Unsynced Badge */}
              {unsyncedCount > 0 && (
                <button
                  onClick={triggerSync}
                  disabled={!isOnline || isSyncing}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-200 flex items-center gap-1 transition"
                  title="Clique para sincronizar agora"
                >
                  {isSyncing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                  {unsyncedCount} {unsyncedCount === 1 ? 'pendente' : 'pendentes'}
                </button>
              )}
            </div>
            
            <p className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-xs">
              {activeSession ? `Sessão: ${activeSession.title}` : 'Sem evento vinculado (vendas gerais)'}
            </p>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Sessão / Evento */}
          <button
            onClick={() => setIsSessionModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 transition"
            title="Abrir ou trocar sessão/evento de venda"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">{activeSession ? 'Evento Ativo' : 'Sessão'}</span>
          </button>

          {/* Carga de Catálogo */}
          <button
            onClick={() => setIsCatalogModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 transition"
            title="Carregar produtos no PDV offline"
          >
            <Database className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Carga ({catalogCount})</span>
          </button>

          {/* Vendas do Evento */}
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            title="Acompanhar vendas em tempo real"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vendas</span>
          </button>
        </div>

      </header>

      {/* ── BARRA DO CONSUMIDOR (Com Recurso de Fixação 📌) ───────────── */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-indigo-500" />
            Cliente:
          </span>

          {/* Mode Selector */}
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-[11px]">
            <button
              onClick={() => {
                setCustomerMode('final');
                setCustomerName('Consumidor Final');
                setCustomerDoc('');
                setSelectedCustomerId(null);
              }}
              className={`px-2 py-0.5 rounded font-medium transition ${
                customerMode === 'final'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Consumidor Final
            </button>
            <button
              onClick={() => setCustomerMode('manual')}
              className={`px-2 py-0.5 rounded font-medium transition ${
                customerMode === 'manual'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Avulso (Digitar)
            </button>
            <button
              onClick={() => setCustomerMode('registered')}
              className={`px-2 py-0.5 rounded font-medium transition ${
                customerMode === 'registered'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cadastrado
            </button>
          </div>

          {/* Manual Input Fields */}
          {customerMode === 'manual' && (
            <div className="flex items-center gap-1.5 flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Nome do cliente *"
                value={customerName === 'Consumidor Final' ? '' : customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-1 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="CPF (opcional)"
                value={customerDoc}
                onChange={(e) => setCustomerDoc(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-28 outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Registered Search Field */}
          {customerMode === 'registered' && (
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Buscar cliente por nome ou CNPJ/CPF..."
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  searchCustomers(e.target.value);
                }}
                className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {customerList.length > 0 && customerQuery && (
                <div className="absolute left-0 top-full mt-1 w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl z-20 max-h-48 overflow-y-auto">
                  {customerList.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCustomerName(c.name);
                        setCustomerDoc(c.document || '');
                        setSelectedCustomerId(c.id);
                        setCustomerList([]);
                        setCustomerQuery('');
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition flex justify-between"
                    >
                      <span className="font-semibold truncate">{c.name}</span>
                      <span className="text-slate-400">{c.document}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Display Label for Final or Registered */}
          {customerMode !== 'manual' && (
            <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
              {customerName} {customerDoc ? `(${customerDoc})` : ''}
            </span>
          )}
        </div>

        {/* 📌 PINO DE FIXAÇÃO DE CONSUMIDOR */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const nextState = !isCustomerPinned;
              setIsCustomerPinned(nextState);
              if (nextState) {
                toast.success(`Cliente "${customerName}" fixado! Não será resetado ao finalizar a venda.`);
              } else {
                toast.info('Fixação desativada.');
              }
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
              isCustomerPinned
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30 ring-2 ring-amber-300 dark:ring-amber-700'
                : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Ao fixar, o cliente permanece selecionado para as próximas vendas sem precisar digitar de novo"
          >
            {isCustomerPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <PinOff className="w-3.5 h-3.5" />}
            <span>{isCustomerPinned ? 'Cliente Fixado' : 'Fixar Cliente'}</span>
          </button>
        </div>

      </div>

      {/* ── MOBILE TABS (Apenas telas pequenas) ────────────────────────── */}
      <div className="flex md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 flex items-center justify-center gap-1.5 ${
            mobileTab === 'catalog'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-400'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          Produtos & Scanner
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 flex items-center justify-center gap-1.5 ${
            mobileTab === 'cart'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-400'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Carrinho ({itemsCount}) — R$ {totalAmount.toFixed(2)}
        </button>
      </div>

      {/* ── CORPO PRINCIPAL (Split View no Desktop / Tab View no Mobile) ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ── PAINEL ESQUERDO: SCANNER & CATÁLOGO ────────────────────── */}
        <section
          className={`flex-1 flex flex-col p-3 sm:p-4 overflow-hidden border-r border-slate-200 dark:border-slate-800 ${
            mobileTab === 'cart' ? 'hidden md:flex' : 'flex'
          }`}
        >
          
          {/* Bipe & Scanner Input */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 mb-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  placeholder="Bipe o código de barras ou ISBN com leitor USB/Bluetooth..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBarcodeSubmit();
                    }
                  }}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              {/* Botão de Câmera (Scanner Nativo) */}
              <button
                onClick={() => setShowCameraScanner(true)}
                className="px-3.5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-semibold text-xs flex items-center gap-1.5 transition"
                title="Abrir leitor de código de barras na câmera"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Câmera</span>
              </button>

              <button
                onClick={() => handleBarcodeSubmit()}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition"
              >
                Bipar
              </button>
            </div>

            {/* Busca Textual Instantânea no Catálogo */}
            <div className="relative">
              <input
                type="text"
                placeholder="Ou digite o nome do livro, título ou editora para buscar no acervo..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  performProductSearch(e.target.value);
                }}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Scanner Modal da Câmera */}
          {showCameraScanner && (
            <div className="mb-3">
              <CameraBarcodeScanner
                isActive={showCameraScanner}
                onClose={() => setShowCameraScanner(false)}
                onScan={(scanned) => {
                  handleBarcodeSubmit(scanned);
                }}
              />
            </div>
          )}

          {/* Lista de Produtos (Resultados da Busca ou Atalhos Rápidos) */}
          <div className="flex-1 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 sm:p-3 space-y-2">
            {searching ? (
              <div className="py-12 flex justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {searchResults.map((item) => {
                  const itemStock = item.stock !== undefined ? Number(item.stock) : 0;
                  const isOutOfStock = validateStock && itemStock <= 0;
                  return (
                    <div
                      key={item.barcode}
                      onClick={() => {
                        if (isOutOfStock) {
                          playWarningBeep();
                          toast.error(`Produto sem estoque (${item.title.substring(0, 25)}...)`);
                          return;
                        }
                        addToCart(item);
                        playSuccessBeep();
                      }}
                      className={`p-3 rounded-xl border transition flex flex-col justify-between group ${
                        isOutOfStock
                          ? 'border-red-200 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/10 cursor-not-allowed opacity-75'
                          : 'border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 cursor-pointer'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 transition">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          ISBN: {item.barcode} {item.publisher ? `• ${item.publisher}` : ''}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${
                            isOutOfStock
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                              : itemStock > 5
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}>
                            Estoque: {itemStock}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                          R$ {Number(item.price).toFixed(2)}
                        </span>
                        {isOutOfStock ? (
                          <span className="text-[10px] bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-md font-semibold">
                            Sem Saldo
                          </span>
                        ) : (
                          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md font-semibold">
                            + Adicionar
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
                <PackageSearch className="w-12 h-12 stroke-[1.2] text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  Pronto para ler produtos
                </p>
                <p className="text-xs text-slate-400 max-w-sm mt-0.5">
                  Aponte o leitor de código de barras ou use a busca acima para adicionar itens ao carrinho.
                </p>
              </div>
            )}
          </div>

        </section>

        {/* ── PAINEL DIREITO: CARRINHO & CHECKOUT ─────────────────────── */}
        <section
          className={`w-full md:w-[380px] lg:w-[440px] flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 ${
            mobileTab === 'catalog' ? 'hidden md:flex' : 'flex'
          }`}
        >
          
          {/* Cart Header */}
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-indigo-500" />
              <h2 className="font-bold text-sm">Itens da Venda ({itemsCount})</h2>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-rose-500 hover:text-rose-700 font-semibold flex items-center gap-1 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-xs">
                O carrinho está vazio no momento.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.barcode}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      R$ {item.price.toFixed(2)} un • Sub: R$ {(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
                    <button
                      onClick={() => updateQuantity(item.barcode, -1)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold text-xs w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.barcode, 1)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-300"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    onClick={() => removeItem(item.barcode)}
                    className="p-1 text-slate-400 hover:text-rose-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary & Checkout Trigger */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            
            {/* Discount field */}
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Desconto (R$):</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={globalDiscount || ''}
                onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                className="w-20 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-between items-baseline pt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs font-semibold text-slate-500">TOTAL DA VENDA:</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                R$ {totalAmount.toFixed(2)}
              </span>
            </div>

            <button
              onClick={() => setIsCheckoutOpen(true)}
              disabled={cart.length === 0}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-40"
            >
              Cobrar R$ {totalAmount.toFixed(2)}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </section>

      </div>

      {/* ── MODAL DE CHECKOUT & PAGAMENTO ─────────────────────────────── */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Finalizar Venda</h3>
                <p className="text-xs text-slate-400">
                  Cliente: <strong className="text-slate-700 dark:text-slate-200">{customerName}</strong>
                </p>
              </div>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                R$ {totalAmount.toFixed(2)}
              </span>
            </div>

            {/* Payment Methods */}
            <div className="p-6 overflow-y-auto space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Forma de Pagamento
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
                  { key: 'PIX', label: 'PIX', icon: QrCode },
                  { key: 'DEBITO', label: 'Débito', icon: CreditCard },
                  { key: 'CREDITO', label: 'Crédito', icon: CreditCard },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPaymentMethod(key as any)}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center justify-center gap-1.5 transition ${
                      paymentMethod === key
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{label}</span>
                  </button>
                ))}
              </div>

              {/* Dinheiro (Cálculo de Troco) */}
              {paymentMethod === 'DINHEIRO' && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Valor Recebido (R$):</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={totalAmount.toFixed(2)}
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="w-32 px-3 py-1.5 text-right font-mono font-bold text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Atalhos de notas */}
                  <div className="flex gap-1.5 pt-1">
                    {[
                      { label: 'Exato', val: totalAmount },
                      { label: '+R$10', val: totalAmount + 10 },
                      { label: '+R$20', val: totalAmount + 20 },
                      { label: '+R$50', val: totalAmount + 50 },
                      { label: 'R$100', val: 100 },
                    ].map((btn, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCashReceived(btn.val.toFixed(2))}
                        className="px-2 py-1 text-[11px] font-semibold rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {changeAmount > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      <span>Troco a Devolver:</span>
                      <span className="text-base">R$ {changeAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Observações da Venda */}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 block">
                  Observações (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Entrega no estande ou pedido especial"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex gap-2 justify-end">
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Voltar
              </button>
              <button
                onClick={handleFinalizeSale}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar e Concluir Venda
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── MODAIS AUXILIARES ─────────────────────────────────────────── */}
      <POSCatalogLoadModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        onCatalogUpdated={(newCount) => setCatalogCount(newCount)}
        currentCatalogCount={catalogCount}
      />

      <POSSessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        activeSession={activeSession}
        onSelectSession={(sess) => setActiveSession(sess)}
      />

      <POSSalesHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onTriggerSync={triggerSync}
        isSyncing={isSyncing}
      />

      <POSReceiptModal
        sale={completedSale}
        onClose={() => setCompletedSale(null)}
        onNewSale={() => {
          setCompletedSale(null);
          barcodeInputRef.current?.focus();
        }}
        isCustomerPinned={isCustomerPinned}
      />

    </div>
  );
}
