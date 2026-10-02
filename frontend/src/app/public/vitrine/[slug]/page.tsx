'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingBag, Gift, Truck, CheckCircle2, Copy, Check, 
  X, Loader2, Sparkles, AlertCircle, ArrowRight, Heart, BookOpen,
  Search, CreditCard, QrCode, RefreshCw, Layers, ShieldCheck, Tag, RotateCcw,
  Menu, SlidersHorizontal, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { maskCPF, validateCPF, maskPhone } from '@/lib/validators';

interface ProductItem {
  id: number;
  sku: string;
  name: string;
  price: number;
  base_price?: number;
  image_url?: string;
  brand?: string;
  category?: string;
  short_description?: string;
  stock_quantity?: number;
}

function maskCardNumber(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function maskCardExpiry(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function PublicEventShowcasePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const participantToken = searchParams.get('token') || '';

  const [friendInfo, setFriendInfo] = useState<any>(null);
  const [eventData, setEventData] = useState<any>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('TODOS');
  const [isCategoryDrawerOpen, setIsCategoryDrawerOpen] = useState(false);

  // Checkout State
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'EFI_PIX' | 'EFI_CREDIT_CARD'>('EFI_PIX');
  const [checkoutSuccess, setCheckoutSuccess] = useState<any>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [resendingPix, setResendingPix] = useState(false);
  const [simulatingPix, setSimulatingPix] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [showCardSwitch, setShowCardSwitch] = useState(false);

  // Form Comprador
  const [customerName, setCustomerName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Form Cartão
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardInstallments, setCardInstallments] = useState(1);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        let currentFriendInfo = null;
        // 1. Se tem token do participante, busca quem é o amigo sorteado
        if (participantToken) {
          const resFriend = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/secret-friend/${participantToken}`
          );
          if (resFriend.ok) {
            currentFriendInfo = await resFriend.json();
            setFriendInfo(currentFriendInfo);
          }
        }

        // 2. Busca vitrine/evento (se slug for 'amigo-secreto', usa o slug do evento ou o primeiro aberto)
        const targetSlug = slug === 'amigo-secreto' 
          ? (currentFriendInfo?.event_slug || '1') 
          : slug;

        const eventRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/events/${targetSlug}`
        );
        if (eventRes.ok) {
          const evt = await eventRes.json();
          setEventData(evt);
          if (evt.showcase?.products?.length) {
            // Regra Mandatória: Produtos com saldo zerado ou negativo NÃO devem aparecer na vitrine
            const availableProducts = (evt.showcase.products as ProductItem[]).filter(
              (p) => p.stock_quantity === undefined || p.stock_quantity === null || p.stock_quantity > 0
            );
            setProducts(availableProducts);
          } else {
            // Produtos mock/fallback caso vitrine ainda não tenha itens
            setProducts([
              { id: 101, sku: 'LIV-01', name: 'O Pequeno Príncipe', price: 39.90, brand: 'HarperCollins', category: 'Infantojuvenil', short_description: 'Um clássico atemporal sobre amizade e imaginação.', stock_quantity: 12 },
              { id: 102, sku: 'LIV-02', name: 'A Incrível Viagem dos Dinossauros', price: 45.00, brand: 'Companhia das Letras', category: 'Ciência & Curiosidades', short_description: 'Livro ilustrado com curiosidades fascinantes.', stock_quantity: 8 },
              { id: 103, sku: 'LIV-03', name: 'Diário de um Banana', price: 49.90, brand: 'VR Editora', category: 'Humor & Quadrinhos', short_description: 'Histórias divertidas que cativam jovens leitores.', stock_quantity: 15 },
              { id: 104, sku: 'LIV-04', name: 'Turma da Mônica em Quadrinhos', price: 34.90, brand: 'Panini', category: 'Humor & Quadrinhos', short_description: 'Aventuras repletas de humor e criatividade.', stock_quantity: 10 },
              { id: 105, sku: 'LIV-05', name: 'Harry Potter e a Pedra Filosofal', price: 59.90, brand: 'Rocco', category: 'Fantasia & Aventura', short_description: 'A magia do mundo bruxo para encantar leitores.', stock_quantity: 5 },
              { id: 106, sku: 'LIV-06', name: 'O Menino Maluquinho', price: 38.00, brand: 'Melhoramentos', category: 'Infantojuvenil', short_description: 'Um dos maiores clássicos da literatura infantil brasileira.', stock_quantity: 7 }
            ]);
          }
        }
      } catch {
        toast.error('Erro ao carregar vitrine.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [slug, participantToken]);

  // Lista dinâmica de categorias dos produtos
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      const cat = p.category || p.brand;
      if (cat && cat.trim()) set.add(cat.trim());
    });
    return ['TODOS', ...Array.from(set)];
  }, [products]);

  // Filtragem combinada por busca e categoria (garantindo saldo > 0)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Regra Mandatória: Produtos com saldo zerado ou negativo NÃO devem aparecer na vitrine
      if (p.stock_quantity !== undefined && p.stock_quantity !== null && p.stock_quantity <= 0) {
        return false;
      }

      const pCat = (p.category || p.brand || '').trim();
      const matchesCat = selectedCategory === 'TODOS' || pCat === selectedCategory;
      if (!matchesCat) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchBrand = (p.brand || '').toLowerCase().includes(q);
      const matchCat = pCat.toLowerCase().includes(q);
      const matchDesc = (p.short_description || '').toLowerCase().includes(q);
      const matchSku = (p.sku || '').toLowerCase().includes(q);

      return matchName || matchBrand || matchCat || matchDesc || matchSku;
    });
  }, [products, selectedCategory, searchQuery]);

  // Polling em tempo real para confirmação de pagamento Pix (Efí)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (checkoutSuccess?.order_id && !isPaid && isCheckoutOpen) {
      const checkStatus = async () => {
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/orders/${checkoutSuccess.order_id}/status`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.is_paid) {
              setIsPaid(true);
              toast.success('🎉 Pagamento Pix Confirmado com Sucesso!');
            }
          }
        } catch (e) {
          console.error('[POLLING STATUS ERROR]', e);
        }
      };

      // Consulta imediata e depois a cada 3 segundos
      checkStatus();
      timer = setInterval(checkStatus, 3000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [checkoutSuccess?.order_id, isPaid, isCheckoutOpen]);

  const handleStartBuy = (product: ProductItem) => {
    if (product.stock_quantity !== undefined && product.stock_quantity !== null && product.stock_quantity <= 0) {
      toast.error('Este produto está com saldo zerado e não pode ser adquirido.');
      return;
    }
    setSelectedProduct(product);
    setCheckoutSuccess(null);
    setIsPaid(false);
    setShowCardSwitch(false);
    setPaymentMethod('EFI_PIX');
    setIsCheckoutOpen(true);
  };

  const handleFinishCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    if (selectedProduct.stock_quantity !== undefined && selectedProduct.stock_quantity !== null && selectedProduct.stock_quantity <= 0) {
      toast.error('Este produto está com saldo zerado e não pode ser vendido.');
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    if (!validateCPF(cleanCpf)) {
      toast.error('CPF do comprador inválido.');
      return;
    }

    if (paymentMethod === 'EFI_CREDIT_CARD') {
      const cleanCard = cardNumber.replace(/\D/g, '');
      if (cleanCard.length < 13) {
        toast.error('Número de cartão de crédito inválido.');
        return;
      }
      if (!cardHolder.trim()) {
        toast.error('Nome impresso no cartão obrigatório.');
        return;
      }
      if (cardExpiry.length < 5) {
        toast.error('Validade do cartão deve ser no formato MM/AA.');
        return;
      }
      if (cardCvv.length < 3) {
        toast.error('Código CVV inválido.');
        return;
      }
    }

    const targetEventId = friendInfo?.event_id || eventData?.id || 1;

    try {
      setCheckoutLoading(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/events/${targetEventId}/checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: targetEventId,
            participant_token: participantToken || 'mock_token',
            cpf: cleanCpf,
            customer_name: customerName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            payment_method: paymentMethod,
            card_number: paymentMethod === 'EFI_CREDIT_CARD' ? cardNumber.replace(/\D/g, '') : null,
            card_holder: paymentMethod === 'EFI_CREDIT_CARD' ? cardHolder.trim() : null,
            card_expiry: paymentMethod === 'EFI_CREDIT_CARD' ? cardExpiry : null,
            card_cvv: paymentMethod === 'EFI_CREDIT_CARD' ? cardCvv : null,
            installments: cardInstallments,
            items: [
              {
                product_id: selectedProduct.id,
                sku: selectedProduct.sku,
                name: selectedProduct.name,
                unit_price: selectedProduct.price,
                quantity: 1
              }
            ]
          })
        }
      );

      if (res.ok) {
        const orderData = await res.json();
        setCheckoutSuccess(orderData);

        // Abater estoque localmente e remover produto da vitrine caso o saldo tenha chegado a zero
        setProducts((prev) =>
          prev
            .map((p) =>
              p.id === selectedProduct.id
                ? { ...p, stock_quantity: Math.max(0, (p.stock_quantity ?? 1) - 1) }
                : p
            )
            .filter((p) => p.stock_quantity === undefined || p.stock_quantity === null || p.stock_quantity > 0)
        );

        if (orderData.status === 'PAID') {
          setIsPaid(true);
          toast.success('🎉 Pagamento aprovado com sucesso!');
        } else {
          toast.success('Cobrança Pix gerada! Realize o pagamento pelo app do seu banco.');
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao processar pedido.');
      }
    } catch {
      toast.error('Erro de conexão no checkout.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Reenviar / Atualizar código Pix
  const handleResendPix = async () => {
    if (!checkoutSuccess?.order_id) return;
    try {
      setResendingPix(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/orders/${checkoutSuccess.order_id}/resend-pix`,
        { method: 'POST' }
      );
      if (res.ok) {
        const data = await res.json();
        setCheckoutSuccess((prev: any) => ({
          ...prev,
          pix: data.pix
        }));
        toast.success('Código Pix atualizado com sucesso!');
      } else {
        toast.error('Erro ao atualizar código Pix.');
      }
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setResendingPix(false);
    }
  };

  // Mudar pagamento pendente de Pix para Cartão de Crédito
  const handlePayOrderWithCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutSuccess?.order_id) return;

    const cleanCard = cardNumber.replace(/\D/g, '');
    if (cleanCard.length < 13) {
      toast.error('Número de cartão de crédito inválido.');
      return;
    }
    if (!cardHolder.trim()) {
      toast.error('Nome no cartão obrigatório.');
      return;
    }
    if (cardExpiry.length < 5) {
      toast.error('Validade do cartão deve ser no formato MM/AA.');
      return;
    }
    if (cardCvv.length < 3) {
      toast.error('Código CVV inválido.');
      return;
    }

    try {
      setCheckoutLoading(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/orders/${checkoutSuccess.order_id}/pay-with-card`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_token: participantToken || null,
            card_number: cleanCard,
            card_holder: cardHolder.trim(),
            card_expiry: cardExpiry,
            card_cvv: cardCvv,
            installments: cardInstallments
          })
        }
      );

      if (res.ok) {
        const data = await res.json();
        setIsPaid(true);
        setShowCardSwitch(false);
        setCheckoutSuccess((prev: any) => ({
          ...prev,
          status: 'PAID',
          payment_method: 'EFI_CREDIT_CARD'
        }));
        toast.success('🎉 Pagamento em cartão de crédito aprovado!');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Não foi possível processar o pagamento no cartão.');
      }
    } catch {
      toast.error('Erro de conexão ao processar cartão.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Simular Pix Pago (para validação imediata em testes)
  const handleSimulatePixPaid = async () => {
    if (!checkoutSuccess?.order_id) return;
    try {
      setSimulatingPix(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/orders/${checkoutSuccess.order_id}/simulate-pix-paid`,
        { method: 'POST' }
      );
      if (res.ok) {
        setIsPaid(true);
        toast.success('⚡ Pagamento Pix confirmado em tempo real!');
      }
    } catch {
      toast.error('Erro ao simular pagamento.');
    } finally {
      setSimulatingPix(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const showcaseLogo = eventData?.showcase?.logo_url || eventData?.logo_url || eventData?.company_logo;
  const bannerDesktop = eventData?.showcase?.banner_url || eventData?.banner_url;
  const bannerMobile = eventData?.showcase?.banner_mobile_url || eventData?.banner_mobile_url || bannerDesktop;
  const vitrineTitle = eventData?.showcase?.title || eventData?.title || 'Vitrine de Livros — Escolha o Presente';
  const vitrineDescription = eventData?.showcase?.description || eventData?.description || 'Todos os livros desta vitrine serão embalados com o nome do aluno presenteado e entregues diretamente na escola.';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      
      {/* Topo / Header com Logo no Topo do Lado Esquerdo */}
      <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          {/* Topo Lado Esquerdo: Logo da Vitrine / Seller */}
          <div className="flex items-center gap-3">
            {showcaseLogo ? (
              <img
                src={showcaseLogo}
                alt={vitrineTitle}
                className="h-9 sm:h-11 w-auto max-w-[150px] sm:max-w-[220px] object-contain shrink-0"
              />
            ) : (
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-lg tracking-tight">
                <BookOpen className="h-6 w-6 shrink-0" />
                <span className="truncate max-w-[180px] sm:max-w-xs">{eventData?.company_name || 'Cronuz B2B'}</span>
              </div>
            )}
            
            <div className="hidden sm:block border-l border-slate-200 dark:border-slate-800 pl-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Vitrine Oficial
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                {eventData?.school_name || vitrineTitle}
              </span>
            </div>
          </div>

          {/* Topo Lado Direito: Selo de Segurança */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 shrink-0">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Compra Segura</span>
            <span className="sm:hidden">Seguro</span>
          </div>
        </div>
      </header>

      {/* Banner Superior do Amigo Secreto */}
      {friendInfo?.drawn_friend && (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-4 sm:p-5 shadow-md">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-2xl shrink-0">
                <Gift className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">
                  Comprando presente para:
                </span>
                <h2 className="text-lg sm:text-xl font-black">
                  {friendInfo.drawn_friend.student_name} ({friendInfo.drawn_friend.class_name})
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
              <Truck className="h-4 w-4 text-emerald-300" />
              <span>Entrega Grátis na Escola</span>
            </div>
          </div>
        </div>
      )}

      {/* Banners Responsivos: Desktop (PC) vs Mobile */}
      {(bannerDesktop || bannerMobile) && (
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 pt-4">
          {/* Banner Desktop / PC (hidden md:block) */}
          {bannerDesktop && (
            <div className="hidden md:block w-full overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <img
                src={bannerDesktop}
                alt={vitrineTitle}
                className="w-full h-auto max-h-[360px] object-cover"
              />
            </div>
          )}

          {/* Banner Mobile (block md:hidden) */}
          {bannerMobile && (
            <div className="block md:hidden w-full overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <img
                src={bannerMobile}
                alt={vitrineTitle}
                className="w-full h-auto max-h-[260px] object-cover"
              />
            </div>
          )}
        </div>
      )}

      {/* Conteúdo da Vitrine */}
      <main className="max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-6 flex-1">
        
        {/* Cabeçalho com Título & Descrição Dinâmicos */}
        <div className="text-center space-y-2 py-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {vitrineTitle}
          </h1>
          {vitrineDescription && (
            <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
              {vitrineDescription}
            </p>
          )}
        </div>

        {/* Barra de Pesquisa e Filtro de Categorias (Mobile-First com Efeito Hambúrguer) */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          
          {/* Linha de Pesquisa + Botão Hambúrguer Mobile */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar livro por título, autor, editora ou código..."
                className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Botão Hambúrguer de Categorias — Exclusivo no Mobile */}
            <button
              onClick={() => setIsCategoryDrawerOpen(true)}
              className="md:hidden relative flex items-center justify-center p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors shrink-0"
              title="Filtrar por Categoria"
            >
              <Menu className="h-5 w-5" />
              {selectedCategory !== 'TODOS' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white dark:border-slate-900 animate-pulse" />
              )}
            </button>
          </div>

          {/* Categoria Ativa Selecionada no Mobile (Resumo Rápido) */}
          <div className="flex md:hidden items-center justify-between text-xs bg-slate-50 dark:bg-slate-950/60 px-3.5 py-2 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-500">
              <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-[11px] font-medium">Categoria:</span>
              <span className="font-bold text-slate-900 dark:text-white">{selectedCategory}</span>
            </div>
            <button
              onClick={() => setIsCategoryDrawerOpen(true)}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <span>Alterar</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* Pílulas de Categorias — Exibição no Desktop (md:flex) */}
          <div className="hidden md:block space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <Tag className="h-3.5 w-3.5" />
              <span>Filtrar por Categoria:</span>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                const count = cat === 'TODOS'
                  ? products.length
                  : products.filter(p => (p.category || p.brand || '').trim() === cat).length;

                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20 scale-[1.02]'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? 'bg-indigo-700/60 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contador de Resultados & Limpar */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>
              Exibindo <strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? 'livro' : 'livros'}
              {selectedCategory !== 'TODOS' && ` em ${selectedCategory}`}
              {searchQuery && ` para "${searchQuery}"`}
            </span>
            {(searchQuery || selectedCategory !== 'TODOS') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('TODOS');
                }}
                className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline inline-flex items-center gap-1 text-[11px]"
              >
                <RotateCcw className="h-3 w-3" />
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Grid de Produtos */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 flex flex-col justify-between hover:shadow-xl hover:shadow-indigo-500/5 transition-all group"
              >
                <div className="space-y-3">
                  <div className="aspect-[3/4] bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden flex items-center justify-center p-3 relative">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-contain group-hover:scale-105 transition-transform" />
                    ) : (
                      <BookOpen className="h-12 w-12 text-slate-300 dark:text-slate-600 group-hover:scale-110 transition-transform" />
                    )}
                    <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm">
                      Frete Grátis
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block truncate">
                      {p.category || p.brand || 'Livro'}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 mt-0.5 leading-snug">
                      {p.name}
                    </h3>
                  </div>

                  {p.short_description && (
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {p.short_description}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Valor:</span>
                    <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">
                      R$ {p.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <button
                    onClick={() => handleStartBuy(p)}
                    className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all group-hover:scale-105"
                    title="Comprar este livro"
                  >
                    <ShoppingBag className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
            <BookOpen className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800 dark:text-white">
              Nenhum livro encontrado
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Não encontramos livros que correspondam aos filtros selecionados. Tente mudar o termo de busca ou limpar a categoria.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('TODOS');
              }}
              className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 text-xs font-bold transition-colors inline-flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
          </div>
        )}
      </main>

      {/* Drawer / Efeito Hambúrguer de Categorias para Mobile */}
      <AnimatePresence>
        {isCategoryDrawerOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryDrawerOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Painel Lateral / Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative w-4/5 max-w-xs bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col z-10 border-r border-slate-200 dark:border-slate-800"
            >
              {/* Header do Drawer */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Categorias</h3>
                    <p className="text-[10px] text-slate-400">Selecione para filtrar os livros</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCategoryDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Lista de Categorias no Hambúrguer */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {categories.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  const count = cat === 'TODOS'
                    ? products.length
                    : products.filter(p => (p.category || p.brand || '').trim() === cat).length;

                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setIsCategoryDrawerOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Tag className={`h-3.5 w-3.5 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                        <span>{cat}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                        isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Rodapé do Drawer */}
              <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    setSelectedCategory('TODOS');
                    setIsCategoryDrawerOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Redefinir para Todos</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Checkout Efí (Pix & Cartão de Crédito) */}
      <AnimatePresence>
        {isCheckoutOpen && selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Topo da Modal */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    <Gift className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {isPaid ? 'Presente Garantido!' : 'Finalizar Compra do Presente'}
                    </h3>
                    <p className="text-[11px] text-slate-400">Entrega Coletiva na Escola • Frete Grátis</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsCheckoutOpen(false)} 
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Corpo da Modal */}
              {isPaid ? (
                /* ── TELA DE CONFIRMAÇÃO DE PAGAMENTO EM TEMPO REAL ── */
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 text-center space-y-5"
                >
                  <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 className="h-10 w-10 animate-bounce" />
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                      ✓ Pagamento Confirmado via Efí
                    </span>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mt-2">
                      Parabéns! Presente Comprado!
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                      O livro <strong>{selectedProduct.name}</strong> foi confirmado e já está pronto para envio coletivo à escola.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 text-left space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nº do Pedido:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">#{checkoutSuccess?.order_id}</span>
                    </div>
                    {checkoutSuccess?.recipient_student_name && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Presenteado(a):</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{checkoutSuccess.recipient_student_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Valor Pago:</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsCheckoutOpen(false)}
                    className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/20"
                  >
                    Concluir e Fechar
                  </button>
                </motion.div>
              ) : checkoutSuccess && checkoutSuccess.pix ? (
                /* ── TELA DE PIX AGUARDANDO COM POLLING & OPÇÃO DE MUDAR PARA CARTÃO ── */
                <div className="p-6 overflow-y-auto space-y-4 text-center">
                  
                  {/* Status Pulsante em Tempo Real */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                    <span>Aguardando Pagamento Pix...</span>
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-slate-900 dark:text-white">
                      Pedido #{checkoutSuccess.order_id} — R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Abra o app do seu banco e escaneie o QR Code ou copie o código Pix abaixo:
                    </p>
                  </div>

                  {/* QR Code Pix */}
                  {checkoutSuccess.pix.qr_code_image && (
                    <div className="p-3 bg-white rounded-2xl border border-slate-200 w-fit mx-auto shadow-sm">
                      <img src={checkoutSuccess.pix.qr_code_image} alt="QR Code Pix Efí" className="h-44 w-44 mx-auto" />
                    </div>
                  )}

                  {/* Pix Copia e Cola */}
                  {checkoutSuccess.pix.pix_copy_paste && (
                    <div className="space-y-1.5 text-left">
                      <span className="text-[11px] font-semibold text-slate-500 block">Código Pix Copia e Cola:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={checkoutSuccess.pix.pix_copy_paste}
                          className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 font-mono select-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(checkoutSuccess.pix.pix_copy_paste);
                            setCopiedPix(true);
                            setTimeout(() => setCopiedPix(false), 2500);
                            toast.success('Código Pix copiado!');
                          }}
                          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 shadow-sm"
                          title="Copiar código Pix"
                        >
                          {copiedPix ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bloco de Troca para Cartão de Crédito */}
                  {showCardSwitch ? (
                    <form onSubmit={handlePayOrderWithCard} className="pt-3 border-t border-slate-100 dark:border-slate-800 text-left space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <CreditCard className="h-4 w-4 text-indigo-600" />
                          Pagar este pedido no Cartão:
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowCardSwitch(false)}
                          className="text-[11px] text-slate-400 hover:text-slate-600"
                        >
                          Voltar ao Pix
                        </button>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Número do Cartão *</label>
                        <input
                          type="text"
                          required
                          maxLength={19}
                          value={cardNumber}
                          onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                          placeholder="0000 0000 0000 0000"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Nome no Cartão *</label>
                        <input
                          type="text"
                          required
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                          placeholder="MARINA DA SILVA"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Validade *</label>
                          <input
                            type="text"
                            required
                            maxLength={5}
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(maskCardExpiry(e.target.value))}
                            placeholder="MM/AA"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">CVV *</label>
                          <input
                            type="text"
                            required
                            maxLength={4}
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                            placeholder="123"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={checkoutLoading}
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Confirmar Pagamento no Cartão
                      </button>
                    </form>
                  ) : (
                    /* Ações Rápidas do Pix */
                    <div className="space-y-2 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleResendPix}
                          disabled={resendingPix}
                          className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5"
                        >
                          {resendingPix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Reenviar Pix
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowCardSwitch(true)}
                          className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 text-indigo-600 dark:text-indigo-400"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Mudar p/ Cartão
                        </button>
                      </div>

                      {/* Botão de Demonstração / Teste Imediato */}
                      <button
                        type="button"
                        onClick={handleSimulatePixPaid}
                        disabled={simulatingPix}
                        className="w-full py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 transition-colors inline-flex items-center justify-center gap-1.5 border border-emerald-200 dark:border-emerald-800/80"
                      >
                        {simulatingPix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Simular Confirmação Pix (Teste)
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsCheckoutOpen(false)}
                    className="w-full py-2.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs transition-colors"
                  >
                    Fechar janela
                  </button>
                </div>
              ) : (
                /* ── FORMULÁRIO DE CHECKOUT (PIX OU CARTÃO) ── */
                <form onSubmit={handleFinishCheckout} className="p-5 overflow-y-auto space-y-4">
                  
                  {/* Resumo do Produto */}
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white block line-clamp-1">
                        {selectedProduct.name}
                      </span>
                      <span className="text-[11px] text-slate-400">Entrega na Escola: Frete Grátis</span>
                    </div>
                    <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                      R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  {/* Seletor de Método de Pagamento (Apenas Pix e Cartão de Crédito) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Forma de Pagamento (Efí) *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('EFI_PIX')}
                        className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                          paymentMethod === 'EFI_PIX'
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <QrCode className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <span>Pix Instantâneo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('EFI_CREDIT_CARD')}
                        className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                          paymentMethod === 'EFI_CREDIT_CARD'
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        <span>Cartão de Crédito</span>
                      </button>
                    </div>
                  </div>

                  {/* Dados Pessoais do Comprador */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Nome Completo do Responsável *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ex: Marina da Silva"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        CPF do Responsável *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={14}
                        value={cpf}
                        onChange={(e) => setCpf(maskCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          E-mail *
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="marina@email.com"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          WhatsApp *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={15}
                          value={phone}
                          onChange={(e) => setPhone(maskPhone(e.target.value))}
                          placeholder="(11) 99999-9999"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Campos Específicos para Cartão de Crédito */}
                  {paymentMethod === 'EFI_CREDIT_CARD' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-3"
                    >
                      <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5 block">
                        <CreditCard className="h-3.5 w-3.5 text-indigo-600" />
                        Dados do Cartão de Crédito
                      </span>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Número do Cartão *</label>
                        <input
                          type="text"
                          required
                          maxLength={19}
                          value={cardNumber}
                          onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                          placeholder="0000 0000 0000 0000"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Nome Impresso no Cartão *</label>
                        <input
                          type="text"
                          required
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                          placeholder="MARINA DA SILVA"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Validade *</label>
                          <input
                            type="text"
                            required
                            maxLength={5}
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(maskCardExpiry(e.target.value))}
                            placeholder="MM/AA"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">CVV *</label>
                          <input
                            type="text"
                            required
                            maxLength={4}
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                            placeholder="123"
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Parcelas</label>
                        <select
                          value={cardInstallments}
                          onChange={(e) => setCardInstallments(parseInt(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                        >
                          <option value={1}>1x de R$ {selectedProduct.price.toFixed(2).replace('.', ',')} (à vista)</option>
                          <option value={2}>2x de R$ {(selectedProduct.price / 2).toFixed(2).replace('.', ',')} (sem juros)</option>
                          <option value={3}>3x de R$ {(selectedProduct.price / 3).toFixed(2).replace('.', ',')} (sem juros)</option>
                        </select>
                      </div>
                    </motion.div>
                  )}

                  {/* Botão de Finalização */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={checkoutLoading}
                      className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                    >
                      {checkoutLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : paymentMethod === 'EFI_PIX' ? (
                        <QrCode className="h-5 w-5" />
                      ) : (
                        <CreditCard className="h-5 w-5" />
                      )}
                      {paymentMethod === 'EFI_PIX'
                        ? `Gerar Pix — R$ ${selectedProduct.price.toFixed(2).replace('.', ',')}`
                        : `Pagar no Cartão — R$ ${selectedProduct.price.toFixed(2).replace('.', ',')}`
                      }
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
