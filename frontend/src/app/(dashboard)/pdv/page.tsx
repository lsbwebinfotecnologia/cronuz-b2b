'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Zap,
  Maximize2,
  Minimize2,
  AlertCircle,
  X,
  BookOpen,
  ArrowLeft,
  Check
} from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

import { 
  openPdvDb, 
  saveCatalogItems, 
  searchCatalogItems, 
  getSampleCatalogItems,
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

interface OperationFeedback {
  type: 'success' | 'warning' | 'error';
  title: string;
  subtitle?: string;
}

export default function PDVPage() {
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);

  // Modo Tela Cheia / Frente de Caixa Imersivo
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Scanner Câmera & Input Unificado Omnibar
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [omnibarInput, setOmnibarInput] = useState('');
  const omnibarInputRef = useRef<HTMLInputElement>(null);

  // Catálogo & Busca
  const [searchResults, setSearchResults] = useState<PDVCatalogItem[]>([]);
  const [sampleProducts, setSampleProducts] = useState<PDVCatalogItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Feedback Operacional Visual (Flash de Bipe / Alerta de Erro)
  const [feedback, setFeedback] = useState<OperationFeedback | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Mobile Drawer do Carrinho
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  // ─── Disparar Feedback Visual e Sonoro ─────────────────────────────────────
  const triggerFeedback = useCallback((type: 'success' | 'warning' | 'error', title: string, subtitle?: string) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedback({ type, title, subtitle });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
    }, 3500);
  }, []);

  // ─── Carregar Amostra Inicial de Produtos do Catálogo ─────────────────────
  const loadSampleCatalog = useCallback(async () => {
    try {
      const samples = await getSampleCatalogItems(24);
      setSampleProducts(samples);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // ─── Sincronizar catálogo da sessão selecionada para o IndexedDB ──────────
  const syncSessionProducts = useCallback(async (session: POSSessionData, silent = false) => {
    if (!companyId || !navigator.onLine) return;
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions/${session.id}/products`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const rawItems = data.items || [];
        if (rawItems.length > 0) {
          const formatted: PDVCatalogItem[] = rawItems.map((p: any) => ({
            barcode: p.barcode,
            sku: p.sku || '',
            title: p.title || 'Sem Título',
            publisher: p.publisher || '',
            price: Number(p.price) || 0,
            stock: Number(p.stock) || 100,
            horus_item_code: p.horus_item_code || '',
            product_id: p.product_id,
            source: session.catalog_source || 'SESSION',
          }));

          const saveRes = await saveCatalogItems(formatted);
          const cCount = await getCatalogCount();
          setCatalogCount(cCount);
          await loadSampleCatalog();

          setActiveSession(prev => prev?.id === session.id ? { ...prev, products_count: saveRes.savedCount } : prev);

          if (!silent) {
            triggerFeedback('success', `Sessão "${session.title}" pronta!`, `${saveRes.savedCount} produtos carregados para uso offline.`);
            toast.success(`Sessão "${session.title}": ${saveRes.savedCount} produtos offline.`);
          }
        } else if (!silent) {
          toast.info(`Sessão "${session.title}" ativada. Utilize a Carga de Produtos para carregar itens da planilha ou contrato.`);
        }
      }
    } catch (err) {
      console.error('Falha ao sincronizar produtos da sessão', err);
      if (!silent) {
        toast.error('Erro ao sincronizar produtos da sessão com o servidor.');
      }
    }
  }, [companyId, triggerFeedback, loadSampleCatalog]);

  // ─── Manipulador de Seleção de Sessão ──────────────────────────────────────
  const handleSelectSession = useCallback(async (session: POSSessionData | null) => {
    setActiveSession(session);
    await setPdvSetting('activeSession', session);
    if (session) {
      await syncSessionProducts(session, false);
    } else {
      toast.info('Sessão desvinculada. PDV operando em modo de vendas gerais.');
    }
  }, [syncSessionProducts]);

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
      toast.warning('Modo Offline ativado: as vendas serão gravadas no aparelho.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Atalhos globais de teclado (F11 = Tela Cheia, F2 = Cobrar)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setIsFullscreen(prev => !prev);
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0) setIsCheckoutOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Carregar contadores do IndexedDB e permissões
    openPdvDb().then(async () => {
      const cCount = await getCatalogCount();
      setCatalogCount(cCount);
      const uCount = await getUnsyncedSalesCount();
      setUnsyncedCount(uCount);

      // Carregar produtos iniciais
      await loadSampleCatalog();

      // Carregar cache offline de permissão, saldo e fixação de cliente
      const cachedModule = await getPdvSetting<boolean>('isModuleAllowed');
      const cachedValStock = await getPdvSetting<boolean>('validateStock');
      const cachedPinned = await getPdvSetting<boolean>('isCustomerPinned');
      const cachedCustName = await getPdvSetting<string>('customerName');

      if (cachedModule !== null) setIsModuleAllowed(cachedModule);
      if (cachedValStock !== null) setValidateStock(cachedValStock);
      if (cachedPinned !== null) setIsCustomerPinned(cachedPinned);
      if (cachedPinned && cachedCustName) {
        setCustomerName(cachedCustName);
        setCustomerMode('manual');
      }

      // Carregar sessão ativa em cache
      const cachedActiveSession = await getPdvSetting<POSSessionData>('activeSession');
      if (cachedActiveSession) {
        setActiveSession(cachedActiveSession);
        if (navigator.onLine && companyId) {
          syncSessionProducts(cachedActiveSession, true);
        }
      }

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
          // Mantém cache se falhar rede
        } finally {
          setCheckingModule(false);
        }
      } else {
        setCheckingModule(false);
      }

      // Sincroniza pendências se online
      if (navigator.onLine && uCount > 0) {
        triggerSync();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [companyId, loadSampleCatalog, syncSessionProducts, cart.length]);

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

  // ─── 3. Busca de Produtos em Tempo Real ────────────────────────────────────
  const performSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // 1. Busca no IndexedDB local
      const localMatches = await searchCatalogItems(q, 30);
      if (localMatches.length > 0) {
        setSearchResults(localMatches);
        setSearching(false);
        return;
      }

      // 2. Fallback online
      if (navigator.onLine && companyId) {
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products?search=${encodeURIComponent(q)}&limit=20`,
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
  }, [companyId]);

  // ─── 4. Adicionar ao Carrinho com Validação de Saldo ───────────────────────
  const addToCart = useCallback((product: PDVCatalogItem) => {
    const existing = cart.find((i) => i.barcode === product.barcode);
    const currentQtyInCart = existing ? existing.quantity : 0;
    const availableStock = product.stock !== undefined ? Number(product.stock) : 0;

    // Se validação de saldo estiver ativa no cadastro do seller:
    if (validateStock) {
      if (availableStock <= 0) {
        playWarningBeep();
        triggerFeedback('error', 'Produto Esgotado / Sem Saldo', `"${product.title.substring(0, 30)}..." não pode ser vendido sem estoque.`);
        toast.error(`Produto sem estoque: "${product.title}"`);
        return;
      }
      if (currentQtyInCart + 1 > availableStock) {
        playWarningBeep();
        triggerFeedback('warning', 'Limite de Estoque Atingido', `Disponível no momento: ${availableStock} un.`);
        toast.warning(`Limite de estoque: "${product.title}" (${availableStock} un)`);
        return;
      }
    }

    setCart((prev) => {
      const found = prev.find((i) => i.barcode === product.barcode);
      if (found) {
        return prev.map((i) =>
          i.barcode === product.barcode ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    playSuccessBeep();
    const newQty = currentQtyInCart + 1;
    triggerFeedback('success', `Adicionado: ${product.title.substring(0, 35)}...`, `Qtd no carrinho: ${newQty} • R$ ${(product.price * newQty).toFixed(2)}`);
  }, [cart, validateStock, triggerFeedback]);

  // ─── 5. Omnibar: Bipe de Código ou Busca Textual ───────────────────────────
  const handleOmnibarSubmit = useCallback(async (codeToProcess?: string) => {
    const raw = (codeToProcess !== undefined ? codeToProcess : omnibarInput).trim();
    if (!raw) return;

    // 1. Tenta correspondência exata de código de barras ou ISBN
    let item = await getCatalogItemByBarcode(raw);

    if (!item) {
      const searchRes = await searchCatalogItems(raw, 1);
      if (searchRes.length > 0 && (searchRes[0].barcode === raw || searchRes[0].sku === raw)) {
        item = searchRes[0];
      }
    }

    if (item) {
      addToCart(item);
      setOmnibarInput('');
      setSearchResults([]);
      setTimeout(() => omnibarInputRef.current?.focus(), 50);
      return;
    }

    // 2. Fallback online se estiver na rede
    if (navigator.onLine && companyId) {
      try {
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products?search=${encodeURIComponent(raw)}&limit=1`,
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
            setOmnibarInput('');
            setSearchResults([]);
            setTimeout(() => omnibarInputRef.current?.focus(), 50);
            return;
          }
        }
      } catch {}
    }

    // 3. Se for puramente números (código de barras leitor) e não achou, alerta
    const isPureDigits = /^\d+$/.test(raw);
    if (isPureDigits && raw.length >= 6) {
      playWarningBeep();
      triggerFeedback('error', 'Código Não Localizado', `Nenhum item com ISBN/Código "${raw}" foi encontrado no acervo.`);
      toast.error(`Código ${raw} não encontrado no catálogo.`);
      setOmnibarInput('');
    } else {
      // É termo de busca textual: executa filtro
      performSearch(raw);
    }

    setTimeout(() => omnibarInputRef.current?.focus(), 50);
  }, [omnibarInput, companyId, addToCart, performSearch, triggerFeedback]);

  // ─── 6. Manipulação do Carrinho ───────────────────────────────────────────
  const updateQuantity = useCallback((barcode: string, delta: number) => {
    const item = cart.find((i) => i.barcode === barcode);
    if (!item) return;

    if (delta > 0 && validateStock) {
      const availableStock = item.stock !== undefined ? Number(item.stock) : 0;
      if (item.quantity + delta > availableStock) {
        playWarningBeep();
        triggerFeedback('warning', 'Limite de Estoque', `Apenas ${availableStock} un disponíveis.`);
        toast.warning(`Limite de estoque atingido (${availableStock} un).`);
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
  }, [cart, validateStock, triggerFeedback]);

  const removeItem = useCallback((barcode: string) => {
    setCart((prev) => prev.filter((i) => i.barcode !== barcode));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setGlobalDiscount(0);
    setCashReceived('');
    setSplitDetails({ dinheiro: '', pix: '', cartao: '' });
    setSaleNotes('');
  }, []);

  // ─── 7. Cálculos de Totais ────────────────────────────────────────────────
  const subtotal = useMemo(() => cart.reduce((acc, i) => acc + i.price * i.quantity, 0), [cart]);
  const totalAmount = useMemo(() => Math.max(0, subtotal - globalDiscount), [subtotal, globalDiscount]);
  const itemsCount = useMemo(() => cart.reduce((acc, i) => acc + i.quantity, 0), [cart]);

  // Troco para dinheiro
  const cashVal = parseFloat(cashReceived.replace(',', '.')) || 0;
  const changeAmount = paymentMethod === 'DINHEIRO' && cashVal > totalAmount ? cashVal - totalAmount : 0;

  // ─── 8. Finalização da Venda ──────────────────────────────────────────────
  const handleFinalizeSale = async () => {
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
      await savePendingSale(saleRecord);
      playSuccessBeep();

      const newUnsynced = await getUnsyncedSalesCount();
      setUnsyncedCount(newUnsynced);

      // Abre modal de recibo / comprovante
      setCompletedSale(saleRecord);
      setIsCheckoutOpen(false);
      setIsMobileCartOpen(false);

      // Limpeza ou Manutenção do Consumidor Fixado 📌
      clearCart();
      if (!isCustomerPinned) {
        setCustomerMode('final');
        setCustomerName('Consumidor Final');
        setCustomerDoc('');
        setSelectedCustomerId(null);
      } else {
        toast.info(`Cliente "${customerName}" mantido fixado.`);
      }

      // Sincronização em background se online
      if (navigator.onLine) {
        triggerSync();
      }
    } catch (e: any) {
      console.error('Erro ao registrar venda', e);
      toast.error('Erro ao gravar venda localmente.');
    }
  };

  // ─── 9. Busca de Clientes Cadastrados ─────────────────────────────────────
  const searchCustomers = async (q: string) => {
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
  };

  if (!mounted || checkingModule) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-slate-100 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="text-sm font-semibold text-slate-500">Iniciando Terminal PDV...</span>
        </div>
      </div>
    );
  }

  if (isModuleAllowed === false && currentUser?.type !== 'MASTER') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-6 text-center bg-slate-50 dark:bg-slate-950">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 shadow-xl">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Módulo PDV Desativado</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2 leading-relaxed">
          O módulo de <strong>Ponto de Venda (PDV)</strong> não está habilitado para esta empresa no painel de configurações.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold transition shadow-md"
        >
          Voltar ao Painel
        </Link>
      </div>
    );
  }

  // Lista de produtos a exibir: resultados da busca OU amostra inicial do catálogo
  const displayedProducts = searchResults.length > 0 ? searchResults : sampleProducts;

  return (
    <div
      className={`font-sans text-slate-900 dark:text-slate-100 transition-all duration-200 select-none ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden'
          : '-m-3 sm:-m-4 md:-m-6 h-[calc(100vh-4rem)] flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden'
      }`}
    >
      {/* ── 1. HEADER COMPACTO DO PDV ────────────────────────────────────────── */}
      <header className="h-13 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-3 shadow-xs shrink-0 z-20">
        
        {/* Esquerda: Logo, Sessão Ativa & Status */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Store className="w-4 h-4" />
          </div>

          {/* Seletor de Sessão / Evento */}
          <button
            onClick={() => setIsSessionModalOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 transition text-left min-w-0 border border-slate-200 dark:border-slate-700/60"
            title="Clique para alternar sessão ou evento de venda"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate block max-w-[130px] sm:max-w-[200px] md:max-w-xs">
                {activeSession ? activeSession.title : 'Vendas Gerais'}
              </span>
            </div>
            {activeSession && (activeSession.products_count ?? 0) > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 shrink-0">
                {activeSession.products_count}
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {/* Badges de Conexão e Validação de Estoque */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                isOnline
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 animate-pulse'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                validateStock
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}
              title={validateStock ? 'Validação de saldo ativa: bloqueia itens sem estoque' : 'Venda sem estoque liberada'}
            >
              {validateStock ? <ShieldAlert className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
              <span className="hidden md:inline">{validateStock ? 'Valida Saldo' : 'Vende s/ Saldo'}</span>
            </span>
          </div>
        </div>

        {/* Direita: Ações Rápidas & Fullscreen */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Pendências de Sincronização */}
          {unsyncedCount > 0 && (
            <button
              onClick={triggerSync}
              disabled={!isOnline || isSyncing}
              className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 transition shadow-xs animate-pulse"
              title="Clique para sincronizar vendas com o servidor"
            >
              {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span>{unsyncedCount} {unsyncedCount === 1 ? 'pendente' : 'pendentes'}</span>
            </button>
          )}

          {/* Carga Offline */}
          <button
            onClick={() => setIsCatalogModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition"
            title="Carregar catálogo offline ou planilha de produtos"
          >
            <Database className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Carga</span>
            <span className="text-[10px] text-slate-400 font-mono">({catalogCount})</span>
          </button>

          {/* Histórico / Vendas do Evento */}
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
            title="Acompanhar vendas e totais"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vendas</span>
          </button>

          {/* Alternar Modo Tela Cheia / Modo Caixa */}
          <button
            onClick={() => setIsFullscreen(prev => !prev)}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
            title={isFullscreen ? 'Sair da tela cheia (F11)' : 'Modo Caixa / Tela Cheia (F11)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-emerald-500" /> : <Maximize2 className="w-4 h-4 text-slate-500" />}
          </button>
        </div>

      </header>

      {/* ── 2. SUB-HEADER: CONSUMIDOR & FIXAÇÃO ─────────────────────────────── */}
      <div className="h-10.5 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-5 flex items-center justify-between gap-2 text-xs shrink-0 z-10">
        
        {/* Esquerda: Pills de Modo de Consumidor */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <User className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Cliente:</span>
          </span>

          <div className="flex rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5 text-[11px] shrink-0">
            <button
              onClick={() => {
                setCustomerMode('final');
                setCustomerName('Consumidor Final');
                setCustomerDoc('');
                setSelectedCustomerId(null);
              }}
              className={`px-2 py-0.5 rounded-md font-semibold transition ${
                customerMode === 'final'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Consumidor
            </button>
            <button
              onClick={() => setCustomerMode('manual')}
              className={`px-2 py-0.5 rounded-md font-semibold transition ${
                customerMode === 'manual'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Avulso
            </button>
            <button
              onClick={() => setCustomerMode('registered')}
              className={`px-2 py-0.5 rounded-md font-semibold transition ${
                customerMode === 'registered'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Cadastrado
            </button>
          </div>

          {/* Campos Inline para Modo Manual */}
          {customerMode === 'manual' && (
            <div className="flex items-center gap-1.5 min-w-0 max-w-sm flex-1">
              <input
                type="text"
                placeholder="Nome do cliente *"
                value={customerName === 'Consumidor Final' ? '' : customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="px-2 py-0.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex-1 min-w-[100px] outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="CPF (opcional)"
                value={customerDoc}
                onChange={(e) => setCustomerDoc(e.target.value)}
                className="px-2 py-0.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 w-24 sm:w-28 outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Campo Autocomplete para Modo Cadastrado */}
          {customerMode === 'registered' && (
            <div className="relative min-w-0 max-w-sm flex-1">
              <input
                type="text"
                placeholder="Buscar cliente cadastrado..."
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  searchCustomers(e.target.value);
                }}
                className="w-full px-2 py-0.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {customerList.length > 0 && customerQuery && (
                <div className="absolute left-0 top-full mt-1 w-full rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl z-30 max-h-48 overflow-y-auto">
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

          {/* Nome do Consumidor Final */}
          {customerMode === 'final' && (
            <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
              {customerName}
            </span>
          )}
        </div>

        {/* Direita: Botão de Fixação do Cliente 📌 */}
        <button
          onClick={async () => {
            const next = !isCustomerPinned;
            setIsCustomerPinned(next);
            await setPdvSetting('isCustomerPinned', next);
            if (next) {
              await setPdvSetting('customerName', customerName);
              toast.success(`Cliente "${customerName}" fixado para os próximos atendimentos!`);
            } else {
              await setPdvSetting('customerName', null);
              toast.info('Fixação de cliente desativada.');
            }
          }}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
            isCustomerPinned
              ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300 dark:ring-amber-600 font-bold'
              : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Mantém este cliente preenchido automaticamente ao concluir as vendas"
        >
          {isCustomerPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <PinOff className="w-3.5 h-3.5" />}
          <span>{isCustomerPinned ? 'Cliente Fixado' : 'Fixar Cliente'}</span>
        </button>

      </div>

      {/* ── 3. CORPO PRINCIPAL (Split View no Desktop / Flex no Mobile) ──────── */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* ── PAINEL ESQUERDO: OMNIBAR, FEEDBACK & CATÁLOGO ──────────────────── */}
        <section className="flex-1 flex flex-col p-2.5 sm:p-4 overflow-hidden border-r border-slate-200 dark:border-slate-800 min-w-0">
          
          {/* Omnibar Unificada de Bipe & Busca */}
          <div className="bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0 mb-2">
            <div className="relative flex items-center gap-1.5 sm:gap-2">
              <div className="relative flex-1">
                <input
                  ref={omnibarInputRef}
                  type="text"
                  placeholder="Bipe o código de barras/ISBN com leitor ou digite o nome do livro..."
                  value={omnibarInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOmnibarInput(val);
                    if (val.trim().length >= 2 && !/^\d+$/.test(val.trim())) {
                      performSearch(val);
                    } else if (!val.trim()) {
                      setSearchResults([]);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleOmnibarSubmit();
                    } else if (e.key === 'Escape') {
                      setOmnibarInput('');
                      setSearchResults([]);
                    }
                  }}
                  autoFocus
                  className="w-full pl-9 pr-9 py-2.5 sm:py-3 text-xs sm:text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner"
                />
                <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                {omnibarInput && (
                  <button
                    onClick={() => {
                      setOmnibarInput('');
                      setSearchResults([]);
                      omnibarInputRef.current?.focus();
                    }}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute right-2.5 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Botão de Câmera (Leitor na Câmera) */}
              <button
                onClick={() => setShowCameraScanner(true)}
                className="px-3 py-2.5 sm:py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition shrink-0"
                title="Abrir leitor de código na câmera do celular/tablet"
              >
                <Camera className="w-4 h-4 text-indigo-500" />
                <span className="hidden sm:inline">Câmera</span>
              </button>

              {/* Botão de Ação: Bipar / Buscar */}
              <button
                onClick={() => handleOmnibarSubmit()}
                className="px-4 py-2.5 sm:py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition shrink-0 shadow-sm shadow-emerald-500/20"
              >
                Adicionar
              </button>
            </div>
          </div>

          {/* Scanner Modal da Câmera */}
          {showCameraScanner && (
            <div className="mb-2 shrink-0">
              <CameraBarcodeScanner
                isActive={showCameraScanner}
                onClose={() => setShowCameraScanner(false)}
                onScan={(scanned) => {
                  handleOmnibarSubmit(scanned);
                }}
              />
            </div>
          )}

          {/* Banner de Feedback Operacional (Flash de Sucesso / Alerta) */}
          {feedback && (
            <div
              className={`p-2.5 sm:p-3 rounded-xl mb-2 flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-150 shrink-0 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : feedback.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                {feedback.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
                {feedback.type === 'error' && <X className="w-4 h-4 text-rose-600 shrink-0" />}
                <div className="min-w-0 truncate">
                  <span className="font-bold block truncate">{feedback.title}</span>
                  {feedback.subtitle && <span className="text-[11px] opacity-80 block truncate">{feedback.subtitle}</span>}
                </div>
              </div>
              <button onClick={() => setFeedback(null)} className="p-1 opacity-70 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Grade de Produtos: Resultados da Busca ou Amostra Rápida do Acervo */}
          <div className="flex-1 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 sm:p-3">
            {searching ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-500 mb-2" />
                <span className="text-xs font-semibold">Buscando no catálogo...</span>
              </div>
            ) : displayedProducts.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {searchResults.length > 0 ? `Resultados da Busca (${searchResults.length})` : `Acervo Rápido da Sessão (${displayedProducts.length})`}
                  </span>
                  {searchResults.length > 0 && (
                    <button
                      onClick={() => {
                        setSearchResults([]);
                        setOmnibarInput('');
                      }}
                      className="text-[11px] font-semibold text-emerald-600 hover:underline"
                    >
                      Voltar ao catálogo
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-2.5">
                  {displayedProducts.map((item) => {
                    const itemStock = item.stock !== undefined ? Number(item.stock) : 0;
                    const isOutOfStock = validateStock && itemStock <= 0;
                    const isInCart = cart.some((c) => c.barcode === item.barcode);

                    return (
                      <div
                        key={item.barcode}
                        onClick={() => addToCart(item)}
                        className={`p-3 rounded-xl border transition-all duration-150 flex flex-col justify-between group cursor-pointer ${
                          isOutOfStock
                            ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 opacity-70'
                            : isInCart
                            ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-xs'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <span className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition leading-snug">
                              {item.title}
                            </span>
                          </div>

                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            ISBN: {item.barcode}
                          </p>
                          {item.publisher && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {item.publisher}
                            </p>
                          )}

                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-md ${
                                isOutOfStock
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                  : itemStock > 5
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                              }`}
                            >
                              Estoque: {itemStock}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                            R$ {Number(item.price).toFixed(2)}
                          </span>

                          <button
                            type="button"
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center">
                <PackageSearch className="w-12 h-12 stroke-[1.2] text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  Pronto para ler produtos
                </p>
                <p className="text-xs text-slate-400 max-w-sm mt-0.5">
                  Aponte o leitor de código de barras ou bipe o livro para incluir direto na venda.
                </p>
              </div>
            )}
          </div>

        </section>

        {/* ── PAINEL DIREITO: CARRINHO & CHECKOUT (Desktop) ─────────────────── */}
        <section className="hidden md:flex w-[380px] lg:w-[410px] flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shrink-0">
          
          {/* Cart Header */}
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
              <div className="py-28 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
                <ShoppingCart className="w-8 h-8 stroke-[1.3] text-slate-300 dark:text-slate-700 mb-2" />
                <p className="font-semibold">O carrinho está vazio</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Bipe um produto para iniciar a venda</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.barcode}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0 pr-1">
                    <span className="font-semibold text-xs text-slate-900 dark:text-white truncate block leading-snug">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      R$ {item.price.toFixed(2)} un • Sub: <strong className="text-slate-700 dark:text-slate-200">R$ {(item.price * item.quantity).toFixed(2)}</strong>
                    </span>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 shrink-0">
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
                    className="p-1 text-slate-400 hover:text-rose-500 transition shrink-0"
                    title="Remover item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary & Checkout Trigger */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3 shrink-0">
            
            {/* Desconto */}
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Desconto (R$):</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={globalDiscount || ''}
                onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-1 text-right rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">TOTAL DA VENDA:</span>
              <span className="text-2xl lg:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                R$ {totalAmount.toFixed(2)}
              </span>
            </div>

            <button
              onClick={() => setIsCheckoutOpen(true)}
              disabled={cart.length === 0}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition disabled:opacity-40"
            >
              <span>Cobrar R$ {totalAmount.toFixed(2)}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </section>

      </div>

      {/* ── 4. BARRA FLUTUANTE INFERIOR MOBILE ───────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-between gap-3 z-30">
        <div>
          <span className="text-[10px] text-slate-400 font-semibold block uppercase">
            {itemsCount} {itemsCount === 1 ? 'item' : 'itens'} no carrinho
          </span>
          <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
            R$ {totalAmount.toFixed(2)}
          </span>
        </div>

        <button
          onClick={() => setIsMobileCartOpen(true)}
          disabled={cart.length === 0}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-500/20 transition disabled:opacity-40"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Ver Carrinho ({itemsCount})</span>
        </button>
      </div>

      {/* ── 5. DRAWER MOBILE DO CARRINHO ────────────────────────────────────── */}
      {isMobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="flex-1" onClick={() => setIsMobileCartOpen(false)} />
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Carrinho ({itemsCount} itens)
                </h3>
              </div>
              <button
                onClick={() => setIsMobileCartOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {cart.map((item) => (
                <div
                  key={item.barcode}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-white truncate block">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      R$ {item.price.toFixed(2)} un • Sub: <strong>R$ {(item.price * item.quantity).toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-0.5">
                    <button
                      onClick={() => updateQuantity(item.barcode, -1)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold text-xs w-6 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.barcode, 1)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => removeItem(item.barcode)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 ml-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold uppercase text-slate-500">TOTAL:</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  R$ {totalAmount.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => {
                  setIsMobileCartOpen(false);
                  setIsCheckoutOpen(true);
                }}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <span>Avançar para Pagamento</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── 6. MODAL DE CHECKOUT & PAGAMENTO ─────────────────────────────────── */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Finalizar Venda</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cliente: <strong className="text-slate-700 dark:text-slate-200">{customerName}</strong>
                </p>
              </div>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                R$ {totalAmount.toFixed(2)}
              </span>
            </div>

            {/* Payment Methods */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
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
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition ${
                      paymentMethod === key
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs ring-2 ring-emerald-500/20'
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
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Valor Recebido (R$):</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={totalAmount.toFixed(2)}
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      className="w-32 px-3 py-1.5 text-right font-mono font-bold text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Atalhos de notas rápidas */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: 'Exato', val: totalAmount },
                      { label: '+R$10', val: totalAmount + 10 },
                      { label: '+R$20', val: totalAmount + 20 },
                      { label: '+R$50', val: totalAmount + 50 },
                      { label: 'R$100', val: 100 },
                      { label: 'R$200', val: 200 },
                    ].map((btn, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCashReceived(btn.val.toFixed(2))}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 transition"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Troco Calculado */}
                  {changeAmount > 0 && (
                    <div className="p-3 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex justify-between items-center">
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">TROCO A DEVOLVER:</span>
                      <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">
                        R$ {changeAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Observações da Venda */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Observações da Venda (opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ex: Entrega na bienal, autógrafo, etc."
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-2">
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

      {/* ── 7. MODAIS AUXILIARES ─────────────────────────────────────────────── */}
      <POSCatalogLoadModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        onCatalogUpdated={async (newCount) => {
          setCatalogCount(newCount);
          await loadSampleCatalog();
          if (activeSession) {
            const updated = { ...activeSession, products_count: newCount };
            setActiveSession(updated);
            await setPdvSetting('activeSession', updated);
          }
        }}
        currentCatalogCount={catalogCount}
        activeSessionId={activeSession?.id}
        activeSessionTitle={activeSession?.title}
      />

      <POSSessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        activeSession={activeSession}
        onSelectSession={handleSelectSession}
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
          omnibarInputRef.current?.focus();
        }}
        isCustomerPinned={isCustomerPinned}
      />

    </div>
  );
}
