'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { 
  Coffee, Search, Bell, Sparkles, Check, ChevronRight, 
  MapPin, Phone, AlertCircle, Plus, Minus, X, Send
} from 'lucide-react';
import { toast } from 'sonner';

interface ModifierOption {
  id: number;
  name: string;
  additional_price: number;
}

interface ModifierGroup {
  id: number;
  name: string;
  min_options: number;
  max_options: number;
  is_required: boolean;
  options: ModifierOption[];
}

interface ProductItem {
  id: number;
  title: string;
  description?: string;
  price: number;
  cover_url?: string;
  category?: string;
  is_available: boolean;
  modifier_groups: ModifierGroup[];
}

interface CompanyInfo {
  id: number;
  name: string;
  trade_name?: string;
  logo_url?: string;
  primary_color?: string;
  phone?: string;
  address?: string;
}

interface TableInfo {
  id: number;
  number: string;
  table_token?: string;
  label?: string;
  status: string;
}

export default function PublicCafeteriaMenuPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = (params?.slug as string) || '';
  const mesaParam = searchParams.get('mesa') || '';
  const tokenParam = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [table, setTable] = useState<TableInfo | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  
  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');

  // Modal de Detalhes do Produto
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>({});
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemNotes, setItemNotes] = useState('');

  // Modal de Chamar Garçom
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  const [waiterTableNumber, setWaiterTableNumber] = useState(mesaParam);
  const [waiterCustomerName, setWaiterCustomerName] = useState('');
  const [waiterNotes, setWaiterNotes] = useState('');
  const [callingWaiter, setCallingWaiter] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    async function loadMenu() {
      if (!slug) return;
      try {
        setLoading(true);
        setError(null);
        let url = `${API_URL}/public/cafeteria/menu/${encodeURIComponent(slug)}`;
        const qParams = new URLSearchParams();
        if (mesaParam) qParams.append('mesa', mesaParam);
        if (tokenParam) qParams.append('token', tokenParam);
        if (qParams.toString()) url += `?${qParams.toString()}`;

        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Não foi possível carregar o cardápio.');
        }

        const data = await res.json();
        setCompany(data.company);
        setTable(data.table);
        if (data.table?.number && !waiterTableNumber) {
          setWaiterTableNumber(data.table.number);
        }
        setCategories(data.categories || []);
        setProducts(data.products || []);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar cardápio');
      } finally {
        setLoading(false);
      }
    }
    loadMenu();
  }, [slug, mesaParam, tokenParam]);

  // Filtragem de produtos
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat =
        selectedCategory === 'TODOS' ||
        (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());
      const matchSearch =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Abertura do Modal de Detalhes
  const handleOpenProduct = (product: ProductItem) => {
    setSelectedProduct(product);
    setSelectedModifiers({});
    setItemQuantity(1);
    setItemNotes('');
  };

  // Alternar modificador
  const handleToggleModifier = (group: ModifierGroup, optionId: number) => {
    setSelectedModifiers((prev) => {
      const currentList = prev[group.id] || [];
      const isSelected = currentList.includes(optionId);

      if (group.max_options === 1) {
        return { ...prev, [group.id]: isSelected ? [] : [optionId] };
      } else {
        if (isSelected) {
          return { ...prev, [group.id]: currentList.filter((id) => id !== optionId) };
        } else {
          if (currentList.length >= group.max_options) {
            toast.error(`Você pode escolher no máximo ${group.max_options} opções para ${group.name}.`);
            return prev;
          }
          return { ...prev, [group.id]: [...currentList, optionId] };
        }
      }
    });
  };

  // Preço total calculado do item com adicionais
  const calculatedItemTotal = useMemo(() => {
    if (!selectedProduct) return 0;
    let base = Number(selectedProduct.price) || 0;
    let extra = 0;

    selectedProduct.modifier_groups.forEach((grp) => {
      const selectedIds = selectedModifiers[grp.id] || [];
      grp.options.forEach((opt) => {
        if (selectedIds.includes(opt.id)) {
          extra += Number(opt.additional_price) || 0;
        }
      });
    });

    return (base + extra) * itemQuantity;
  }, [selectedProduct, selectedModifiers, itemQuantity]);

  // Chamar Garçom
  const handleCallWaiter = async () => {
    if (!company) return;
    const tokenToUse = table?.table_token || tokenParam || (mesaParam.startsWith('tab_') ? mesaParam : '');
    const mesaLabel = waiterTableNumber || table?.number || mesaParam;

    if (!tokenToUse) {
      toast.error('Para chamar atendimento, por favor aponte a câmera para o QR Code da sua mesa.');
      return;
    }

    try {
      setCallingWaiter(true);
      const res = await fetch(`${API_URL}/public/cafeteria/call-waiter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          table_token: tokenToUse,
          table_number: mesaLabel,
          customer_name: waiterCustomerName.trim() || undefined,
          notes: waiterNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao acionar garçom.');
      }

      const data = await res.json();
      toast.success(data.message || 'Atendente acionado com sucesso!');
      setIsWaiterModalOpen(false);
      setWaiterNotes('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao chamar atendimento.');
    } finally {
      setCallingWaiter(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-400 mb-4 animate-bounce">
          <Coffee className="w-8 h-8" />
        </div>
        <p className="text-stone-600 dark:text-stone-300 font-medium text-sm animate-pulse">
          Carregando cardápio artesanal...
        </p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400 mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-stone-900 dark:text-white mb-2">Cardápio Indisponível</h1>
        <p className="text-stone-600 dark:text-stone-400 text-sm max-w-sm mb-6">
          {error || 'Não encontramos este estabelecimento ou o cardápio está temporariamente desativado.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold text-sm rounded-xl hover:opacity-90 transition-opacity"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-stone-950 text-stone-900 dark:text-stone-100 pb-28">
      {/* ─── TOPO HERO ──────────────────────────────────────────────────────── */}
      <header className="relative bg-gradient-to-b from-[#2B170E] via-[#3B2215] to-[#2B170E] text-white pt-6 pb-12 px-4 shadow-xl">
        <div className="max-w-3xl mx-auto">
          {/* Barra superior de status & mesa */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2 bg-amber-500/20 backdrop-blur-md border border-amber-400/30 px-3 py-1.5 rounded-full text-xs font-medium text-amber-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Cardápio Digital</span>
            </div>

            {/* Identificação de mesa ou botão de chamar garçom */}
            <div className="flex items-center gap-2">
              {(table?.number || mesaParam) && (
                <div className="bg-stone-900/60 backdrop-blur-md border border-stone-700/50 px-3 py-1.5 rounded-full text-xs font-bold text-amber-300">
                  Mesa {table?.number || mesaParam}
                </div>
              )}
              <button
                onClick={() => setIsWaiterModalOpen(true)}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md transition-all"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Chamar Garçom</span>
              </button>
            </div>
          </div>

          {/* Identidade da Cafeteria */}
          <div className="flex items-center gap-4">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-amber-500/30 shadow-lg bg-stone-900"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-900/60 border border-amber-600/40 flex items-center justify-center text-amber-300 shadow-lg">
                <Coffee className="w-9 h-9" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-amber-50 truncate">
                {company.trade_name || company.name}
              </h1>
              {company.address && (
                <p className="flex items-center gap-1.5 text-xs text-stone-300 mt-1 line-clamp-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{company.address}</span>
                </p>
              )}
              {company.phone && (
                <p className="flex items-center gap-1.5 text-xs text-stone-300 mt-0.5">
                  <Phone className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>{company.phone}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── BARRA DE BUSCA FLUTUANTE ─────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 -mt-6">
        <div className="relative bg-white dark:bg-stone-900 rounded-2xl shadow-lg border border-stone-200 dark:border-stone-800 p-1 flex items-center">
          <Search className="w-5 h-5 text-stone-400 ml-3 shrink-0" />
          <input
            type="text"
            placeholder="Buscar cafés, grãos, doces, salgados..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent px-3 py-2.5 text-sm font-medium focus:outline-none placeholder:text-stone-400 text-stone-800 dark:text-stone-100"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-stone-400 mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ─── CHIPS DE CATEGORIAS (HORIZONTAL SCROLL) ───────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 mt-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
          <button
            onClick={() => setSelectedCategory('TODOS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === 'TODOS'
                ? 'bg-amber-800 text-white shadow-md'
                : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            Todos os Itens
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-amber-800 text-white shadow-md'
                  : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ─── LISTAGEM DE PRODUTOS ─────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black text-stone-800 dark:text-stone-100 tracking-tight">
            {selectedCategory === 'TODOS' ? 'Cardápio Completo' : selectedCategory}
          </h2>
          <span className="text-xs font-medium text-stone-500">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'itens'}
          </span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-10 text-center">
            <Coffee className="w-10 h-10 text-stone-300 dark:text-stone-600 mx-auto mb-3" />
            <p className="text-stone-600 dark:text-stone-300 font-bold text-sm">Nenhum item encontrado</p>
            <p className="text-stone-400 text-xs mt-1">Tente pesquisar por outro nome ou selecione outra categoria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredProducts.map((prod) => (
              <div
                key={prod.id}
                onClick={() => handleOpenProduct(prod)}
                className="group bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 hover:border-amber-400 dark:hover:border-amber-600 p-3.5 flex gap-3.5 transition-all shadow-sm hover:shadow-md cursor-pointer relative overflow-hidden"
              >
                {/* Imagem do item */}
                <div className="w-24 h-24 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                  {prod.cover_url ? (
                    <img
                      src={prod.cover_url}
                      alt={prod.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-amber-800 dark:text-amber-500">
                      <Coffee className="w-7 h-7" />
                    </div>
                  )}
                  {!prod.is_available && (
                    <div className="absolute inset-0 bg-stone-950/70 backdrop-blur-[1px] flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-wider text-center p-1">
                      Esgotado
                    </div>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 leading-snug line-clamp-1 group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors">
                      {prod.title}
                    </h3>
                    {prod.description && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2 leading-relaxed">
                        {prod.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-stone-100 dark:border-stone-800">
                    <span className="text-sm font-black text-amber-900 dark:text-amber-400">
                      {Number(prod.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>

                    {prod.modifier_groups && prod.modifier_groups.length > 0 ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                        Customizável
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400 group-hover:text-amber-700 dark:group-hover:text-amber-400 flex items-center gap-0.5 font-bold">
                        Ver <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ─── BARRA FLUTUANTE INFERIOR (CHAMAR ATENDIMENTO) ───────────────── */}
      <div className="fixed bottom-0 inset-x-0 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 py-3 px-4 z-30 shadow-2xl">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-800 dark:text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-900 dark:text-stone-100">
                {table?.number ? `Atendimento na Mesa ${table.number}` : 'Atendimento no Local'}
              </p>
              <p className="text-[11px] text-stone-500">Faça seu pedido diretamente com a equipe</p>
            </div>
          </div>

          <button
            onClick={() => setIsWaiterModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-800 to-amber-700 hover:from-amber-700 hover:to-amber-600 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-lg active:scale-95 transition-all"
          >
            <Bell className="w-4 h-4" />
            <span>Chamar Garçom</span>
          </button>
        </div>
      </div>

      {/* ─── MODAL DE DETALHES DO PRODUTO & MODIFICADORES ─────────────────── */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            {/* Header do Modal com Imagem */}
            <div className="relative h-48 sm:h-56 bg-stone-100 dark:bg-stone-800 w-full overflow-hidden shrink-0">
              {selectedProduct.cover_url ? (
                <img
                  src={selectedProduct.cover_url}
                  alt={selectedProduct.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-amber-800 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30">
                  <Coffee className="w-16 h-16" />
                </div>
              )}
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-md transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo rolável */}
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800/60">
                  {selectedProduct.category || 'Cafeteria'}
                </span>
                <h3 className="text-xl font-black text-stone-900 dark:text-white mt-2">
                  {selectedProduct.title}
                </h3>
                {selectedProduct.description && (
                  <p className="text-xs text-stone-600 dark:text-stone-300 mt-1.5 leading-relaxed">
                    {selectedProduct.description}
                  </p>
                )}
                <div className="mt-3 text-lg font-black text-amber-800 dark:text-amber-400">
                  {Number(selectedProduct.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>

              {/* Grupos de Modificadores */}
              {selectedProduct.modifier_groups && selectedProduct.modifier_groups.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-stone-100 dark:border-stone-800">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Personalize seu Pedido
                  </h4>

                  {selectedProduct.modifier_groups.map((group) => {
                    const selectedIds = selectedModifiers[group.id] || [];
                    return (
                      <div
                        key={group.id}
                        className="bg-stone-50 dark:bg-stone-800/50 rounded-2xl p-4 border border-stone-200/80 dark:border-stone-800"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-stone-800 dark:text-stone-200">
                            {group.name}
                          </p>
                          <span className="text-[10px] font-semibold text-stone-500">
                            {group.is_required ? (
                              <span className="text-amber-600 dark:text-amber-400 font-bold">Obrigatório</span>
                            ) : (
                              `Até ${group.max_options}`
                            )}
                          </span>
                        </div>

                        <div className="space-y-1.5 mt-2">
                          {group.options.map((opt) => {
                            const isChecked = selectedIds.includes(opt.id);
                            return (
                              <label
                                key={opt.id}
                                onClick={() => handleToggleModifier(group, opt.id)}
                                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                                  isChecked
                                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 text-stone-900 dark:text-white'
                                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100/50'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-4 h-4 rounded-${
                                      group.max_options === 1 ? 'full' : 'md'
                                    } border flex items-center justify-center ${
                                      isChecked
                                        ? 'bg-amber-700 border-amber-700 text-white'
                                        : 'border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900'
                                    }`}
                                  >
                                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <span className="text-xs font-medium">{opt.name}</span>
                                </div>
                                <span className="text-xs font-bold text-stone-600 dark:text-stone-400">
                                  {Number(opt.additional_price) > 0
                                    ? `+ ${Number(opt.additional_price).toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })}`
                                    : 'Incluso'}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Campo de Observações */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                  Observações para a equipe (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: sem açúcar, leite bem quente, gelo separado..."
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:outline-none focus:border-amber-600"
                />
              </div>

              {/* Quantidade */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300">Quantidade:</span>
                <div className="flex items-center gap-3 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl border border-stone-200 dark:border-stone-700">
                  <button
                    onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                    className="w-7 h-7 rounded-lg bg-white dark:bg-stone-700 flex items-center justify-center text-stone-700 dark:text-stone-200 font-bold active:scale-95 shadow-sm"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-black w-6 text-center">{itemQuantity}</span>
                  <button
                    onClick={() => setItemQuantity((q) => q + 1)}
                    className="w-7 h-7 rounded-lg bg-white dark:bg-stone-700 flex items-center justify-center text-stone-700 dark:text-stone-200 font-bold active:scale-95 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Rodapé com Total & Ação */}
            <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase font-bold text-stone-500">Total estimado</p>
                <p className="text-lg font-black text-amber-900 dark:text-amber-400">
                  {calculatedItemTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>

              <button
                onClick={() => {
                  toast.success(
                    `Item ${selectedProduct.title} configurado! Chame o atendente para confirmar o lançamento na comanda da sua mesa.`
                  );
                  setSelectedProduct(null);
                  setIsWaiterModalOpen(true);
                }}
                className="flex items-center gap-2 bg-amber-800 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm px-5 py-3 rounded-xl shadow-lg active:scale-95 transition-all"
              >
                <Bell className="w-4 h-4" />
                <span>Pedir este Item</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CHAMAR GARÇOM / ATENDIMENTO ─────────────────────────── */}
      {isWaiterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-stone-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                  <Bell className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900 dark:text-white">Chamar Atendimento</h3>
                  <p className="text-xs text-stone-500">Um atendente irá até sua mesa imediatamente</p>
                </div>
              </div>
              <button
                onClick={() => setIsWaiterModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Número da sua Mesa *
                </label>
                <input
                  type="text"
                  placeholder="Ex: 01, 04, Balcão 2..."
                  value={waiterTableNumber}
                  onChange={(e) => setWaiterTableNumber(e.target.value)}
                  className="w-full text-sm font-semibold p-3 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Seu Nome (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Como gostaria de ser chamado?"
                  value={waiterCustomerName}
                  onChange={(e) => setWaiterCustomerName(e.target.value)}
                  className="w-full text-xs font-medium p-3 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Qual o motivo do chamado? (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Gostaria de fazer o pedido, trazer a conta, tirar dúvidas..."
                  value={waiterNotes}
                  onChange={(e) => setWaiterNotes(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsWaiterModalOpen(false)}
                className="w-1/3 py-3 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCallWaiter}
                disabled={callingWaiter}
                className="w-2/3 py-3 rounded-xl text-xs font-bold text-white bg-amber-800 hover:bg-amber-700 flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50"
              >
                {callingWaiter ? (
                  <span>Chamando...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Acionar Garçom</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
