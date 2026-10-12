'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Coffee, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Loader2, 
  Upload, 
  Image as ImageIcon, 
  Layers, 
  SlidersHorizontal, 
  UtensilsCrossed, 
  Grid, 
  List, 
  AlertCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { maskCurrency, parseCurrency } from '@/lib/validators';

interface ModifierOption {
  id: number;
  name: string;
  additional_price: number;
}

interface ModifierGroup {
  id: number;
  name: string;
  min_selectable: number;
  max_selectable: number;
  options: ModifierOption[];
}

interface MenuProduct {
  id: number;
  company_id: number;
  name: string;
  sku: string;
  ean_gtin?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  base_price: number;
  cost_price?: number | null;
  stock_quantity: number;
  cover_url?: string | null;
  short_description?: string | null;
  status: string;
  modifier_group_ids: number[];
  modifier_groups: ModifierGroup[];
}

interface CategoryItem {
  id: number;
  name: string;
  product_count: number;
}

const DEFAULT_SUGGESTED_CATEGORIES = [
  'Cafés Quentes',
  'Cafés Gelados',
  'Salgados & Folhados',
  'Lanches & Sanduíches',
  'Bebidas & Sucos',
  'Doces & Sobremesas'
];

export default function CafeteriaProductsPage() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Token Seguro do Cardápio
  const [menuToken, setMenuToken] = useState<string>('');
  const [regeneratingToken, setRegeneratingToken] = useState(false);

  // Modal de Criação / Edição
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MenuProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Campos do formulário
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formStock, setFormStock] = useState('999');
  const [formSku, setFormSku] = useState('');
  const [formEan, setFormEan] = useState('');
  const [formCoverUrl, setFormCoverUrl] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSelectedModifiers, setFormSelectedModifiers] = useState<number[]>([]);
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Confirmação de exclusão
  const [productToDelete, setProductToDelete] = useState<MenuProduct | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user?.company_id) {
      setCompanyId(user.company_id);
    }
  }, []);

  // Busca dados iniciais
  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const [prodsRes, catsRes, modsRes, tokenRes] = await Promise.all([
        fetch(`${baseUrl}/companies/${companyId}/cafeteria/menu-products?status=ALL`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${baseUrl}/companies/${companyId}/cafeteria/categories`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${baseUrl}/companies/${companyId}/cafeteria/modifiers`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${baseUrl}/companies/${companyId}/cafeteria/menu-token`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (prodsRes.ok) {
        setProducts(await prodsRes.json());
      }
      if (catsRes.ok) {
        setCategories(await catsRes.json());
      }
      if (modsRes.ok) {
        setModifierGroups(await modsRes.json());
      }
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setMenuToken(tokenData.menu_token || '');
      }
    } catch {
      toast.error('Erro ao carregar dados do cardápio');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const handleRegenerateToken = async () => {
    if (!companyId) return;
    if (!confirm('Deseja realmente gerar um novo token para o cardápio? O link público anterior deixará de funcionar imediatamente.')) {
      return;
    }
    try {
      setRegeneratingToken(true);
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/regenerate-menu-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMenuToken(data.menu_token);
        toast.success('Novo token seguro gerado com sucesso!');
      } else {
        toast.error('Erro ao regenerar token');
      }
    } catch {
      toast.error('Falha de conexão ao regenerar token');
    } finally {
      setRegeneratingToken(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      loadData();
    }
  }, [companyId, loadData]);

  // Abrir modal para novo produto
  const handleOpenNewModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('Cafés Quentes');
    setFormPrice('');
    setFormCostPrice('');
    setFormStock('999');
    setFormSku('');
    setFormEan('');
    setFormCoverUrl('');
    setFormDescription('');
    setFormSelectedModifiers([]);
    setFormStatus('ACTIVE');
    setShowModal(true);
  };

  // Abrir modal para editar produto
  const handleOpenEditModal = (prod: MenuProduct) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormCategory(prod.category_name || 'Geral');
    setFormPrice(prod.base_price !== undefined && prod.base_price !== null ? maskCurrency(prod.base_price, true) : '');
    setFormCostPrice(prod.cost_price ? maskCurrency(prod.cost_price, true) : '');
    setFormStock(String(prod.stock_quantity ?? 999));
    setFormSku(prod.sku || '');
    setFormEan(prod.ean_gtin || '');
    setFormCoverUrl(prod.cover_url || '');
    setFormDescription(prod.short_description || '');
    setFormSelectedModifiers(prod.modifier_group_ids || []);
    setFormStatus((prod.status as 'ACTIVE' | 'INACTIVE') || 'ACTIVE');
    setShowModal(true);
  };

  // Upload de imagem do produto (com validação < 5MB)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem excede o limite máximo permitido de 5 MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', String(companyId));

      const res = await fetch(`${baseUrl}/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setFormCoverUrl(data.url);
        toast.success('Imagem enviada com sucesso!');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Falha ao fazer upload da imagem');
      }
    } catch {
      toast.error('Erro de conexão no upload');
    } finally {
      setUploadingImage(false);
    }
  };

  // Toggle do modificador no formulário
  const handleToggleModifier = (groupId: number) => {
    setFormSelectedModifiers(prev => 
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  // Salvar produto (criar ou editar)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!formName.trim()) {
      toast.error('Informe o nome do item');
      return;
    }

    const priceNum = parseCurrency(formPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('Informe um preço de venda válido');
      return;
    }

    const costNum = formCostPrice ? parseCurrency(formCostPrice) : null;
    const stockNum = parseInt(formStock, 10);

    setSubmitting(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const payload = {
        name: formName.trim(),
        category_name: formCategory.trim() || 'Geral',
        base_price: priceNum,
        cost_price: isNaN(Number(costNum)) ? null : costNum,
        stock_quantity: isNaN(stockNum) ? 999 : stockNum,
        sku: formSku.trim() || undefined,
        ean_gtin: formEan.trim() || undefined,
        cover_url: formCoverUrl.trim() || undefined,
        short_description: formDescription.trim() || undefined,
        modifier_group_ids: formSelectedModifiers,
        status: formStatus
      };

      const url = editingProduct
        ? `${baseUrl}/companies/${companyId}/cafeteria/menu-products/${editingProduct.id}`
        : `${baseUrl}/companies/${companyId}/cafeteria/menu-products`;

      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingProduct ? 'Item atualizado com sucesso!' : 'Novo item adicionado ao cardápio!');
        setShowModal(false);
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao salvar produto');
      }
    } catch {
      toast.error('Erro de conexão ao salvar item');
    } finally {
      setSubmitting(false);
    }
  };

  // Inativar produto
  const handleDeleteProduct = async () => {
    if (!companyId || !productToDelete) return;
    setDeleting(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/menu-products/${productToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Produto inativado do cardápio');
        setProductToDelete(null);
        loadData();
      } else {
        toast.error('Erro ao inativar produto');
      }
    } catch {
      toast.error('Erro de conexão ao inativar produto');
    } finally {
      setDeleting(false);
    }
  };

  // Lista filtrada
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = searchTerm.trim() === '' || 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.ean_gtin && p.ean_gtin.includes(searchTerm));

      const matchesCat = selectedCategory === 'ALL' || 
        (selectedCategory === 'SEM_CATEGORIA' && !p.category_name) ||
        (p.category_name && p.category_name.toLowerCase() === selectedCategory.toLowerCase());

      return matchesSearch && matchesCat;
    });
  }, [products, searchTerm, selectedCategory]);

  // Estatísticas do topo
  const stats = useMemo(() => {
    const activeCount = products.filter(p => p.status === 'ACTIVE').length;
    const withModifiersCount = products.filter(p => p.modifier_group_ids && p.modifier_group_ids.length > 0).length;
    const lowStockCount = products.filter(p => p.stock_quantity <= 5).length;
    return {
      total: products.length,
      active: activeCount,
      withModifiers: withModifiersCount,
      lowStock: lowStockCount,
      categoriesCount: categories.length
    };
  }, [products, categories]);

  // Margem estimada calculada em tempo real no formulário
  const marginEstimate = useMemo(() => {
    const p = parseCurrency(formPrice);
    const c = parseCurrency(formCostPrice);
    if (p > 0 && c > 0) {
      const profit = p - c;
      const marginPct = (profit / p) * 100;
      return { profit, marginPct };
    }
    return null;
  }, [formPrice, formCostPrice]);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header Responsivo (Mobile First) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                Cardápio & Estoque
              </span>
              <span className="text-xs text-slate-500">Módulo Cafeteria</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              Itens do Cardápio
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Cadastre cafés, bebidas, lanches, salgados e vincule grupos de opcionais
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            href="/cafeteria/menu"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-xs sm:text-sm font-medium transition"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-500" />
            <span className="hidden xs:inline">Grupos &</span> Opcionais
          </Link>

          <button
            onClick={handleOpenNewModal}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Novo Item
          </button>
        </div>
      </div>

      {/* Cards de Métricas / Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Itens Ativos</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.active}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Check className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Categorias</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.categoriesCount}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Com Opcionais</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.withModifiers}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Estoque Baixo</p>
            <h3 className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.lowStock}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Campo de Busca */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, SKU ou código de barras..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Toggle de Visualização (Grade / Tabela) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl self-end sm:self-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs flex items-center gap-1.5 font-medium transition ${
                viewMode === 'grid' 
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs flex items-center gap-1.5 font-medium transition ${
                viewMode === 'table' 
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Tabela</span>
            </button>
          </div>
        </div>

        {/* Chips de Categorias Horizontais (Mobile First Scroll) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3.5 py-1.5 rounded-full whitespace-nowrap font-medium transition shrink-0 ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            Todos ({products.length})
          </button>

          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap font-medium transition shrink-0 ${
                selectedCategory.toLowerCase() === cat.name.toLowerCase()
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              {cat.name} ({cat.product_count})
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo Principal */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200/80 dark:border-slate-800 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando cardápio da cafeteria...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Nenhum item encontrado</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {searchTerm || selectedCategory !== 'ALL'
                ? 'Tente ajustar os filtros ou o termo de busca para localizar os itens.'
                : 'Seu cardápio de cafeteria ainda não possui itens cadastrados. Clique abaixo para cadastrar seu primeiro café, lanche ou bebida.'}
            </p>
          </div>
          <button
            onClick={handleOpenNewModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Primeiro Item
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* VISUALIZAÇÃO EM GRADE DE CARDS (MOBILE FIRST) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map(prod => (
            <div
              key={prod.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col hover:border-amber-500/40 dark:hover:border-amber-500/40 transition group"
            >
              {/* Imagem / Capa */}
              <div className="relative h-40 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {prod.cover_url ? (
                  <img
                    src={prod.cover_url}
                    alt={prod.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <Coffee className="w-10 h-10 stroke-[1.5]" />
                    <span className="text-[11px] mt-1 font-medium">Sem foto</span>
                  </div>
                )}

                {/* Badge de Categoria */}
                {prod.category_name && (
                  <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-[10px] font-semibold">
                    {prod.category_name}
                  </span>
                )}

                {/* Badge de Status */}
                <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  prod.status === 'ACTIVE' 
                    ? 'bg-emerald-500/90 text-white' 
                    : 'bg-rose-500/90 text-white'
                }`}>
                  {prod.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              {/* Corpo do Card */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>SKU: {prod.sku}</span>
                    <span>Estoque: {prod.stock_quantity}</span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-base mt-1 line-clamp-1" title={prod.name}>
                    {prod.name}
                  </h3>

                  {prod.short_description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {prod.short_description}
                    </p>
                  )}
                </div>

                {/* Opcionais vinculados */}
                {prod.modifier_groups && prod.modifier_groups.length > 0 ? (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1">
                    {prod.modifier_groups.map(grp => (
                      <span
                        key={grp.id}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-medium"
                      >
                        <SlidersHorizontal className="w-2.5 h-2.5" />
                        {grp.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 italic">Sem adicionais vinculados</span>
                  </div>
                )}

                {/* Rodapé com Preço e Ações */}
                <div className="pt-2 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Preço de Venda</span>
                    <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400">
                      R$ {Number(prod.base_price).toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(prod)}
                      className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Editar Item"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setProductToDelete(prod)}
                      className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      title="Inativar do Cardápio"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* VISUALIZAÇÃO EM TABELA RESPONSIVA (MOBILE FIRST) */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase text-[11px] font-semibold tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Item</th>
                  <th className="py-3.5 px-4">Categoria</th>
                  <th className="py-3.5 px-4">Preço Venda</th>
                  <th className="py-3.5 px-4">Estoque</th>
                  <th className="py-3.5 px-4">Opcionais</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                {filteredProducts.map(prod => (
                  <tr key={prod.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center text-slate-400">
                          {prod.cover_url ? (
                            <img src={prod.cover_url} alt={prod.name} className="w-full h-full object-cover" />
                          ) : (
                            <Coffee className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{prod.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">SKU: {prod.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                        {prod.category_name || 'Sem categoria'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-bold text-amber-600 dark:text-amber-400">
                      R$ {Number(prod.base_price).toFixed(2).replace('.', ',')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                        prod.stock_quantity <= 5 
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' 
                          : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {prod.stock_quantity} un
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {prod.modifier_groups && prod.modifier_groups.length > 0 ? (
                          prod.modifier_groups.map(g => (
                            <span key={g.id} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                              {g.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">-</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        prod.status === 'ACTIVE' 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' 
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                      }`}>
                        {prod.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEditModal(prod)}
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setProductToDelete(prod)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL RESPONSIVO DE CADASTRO / EDIÇÃO */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">
                    {editingProduct ? 'Editar Item do Cardápio' : 'Cadastrar Item da Cafeteria'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingProduct ? 'Modifique os detalhes, preços e adicionais do produto' : 'Preencha os dados essenciais para disponibilizar o produto no cardápio'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulário com Scroll interno */}
            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Foto do Produto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Foto / Apresentação do Produto
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0 relative group">
                    {formCoverUrl ? (
                      <img src={formCoverUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-400" />
                    )}
                    {uploadingImage && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingImage ? 'Enviando...' : 'Carregar Imagem (Máx 5MB)'}</span>
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          className="hidden"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                        />
                      </label>
                      {formCoverUrl && (
                        <button
                          type="button"
                          onClick={() => setFormCoverUrl('')}
                          className="px-2.5 py-2 text-rose-500 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <input
                      type="url"
                      placeholder="Ou cole a URL direta da imagem (ex: https://...)"
                      value={formCoverUrl}
                      onChange={e => setFormCoverUrl(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Nome do Produto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Nome do Item <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Cappuccino Italiano 200ml, Croissant de Frango, Suco de Laranja"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Categoria com sugestões rápidas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Categoria da Cafeteria
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cafés Quentes, Lanches, Salgados, Bebidas"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                {/* Sugestões rápidas de cafeteria */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DEFAULT_SUGGESTED_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormCategory(cat)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${
                        formCategory.toLowerCase() === cat.toLowerCase()
                          ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700 font-semibold'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preços e Custos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Preço de Venda (R$) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="0,00"
                      value={formPrice}
                      onChange={e => setFormPrice(maskCurrency(e.target.value, true))}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-extrabold text-amber-600 dark:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Preço de Custo (R$) <span className="text-[10px] text-slate-400 font-normal lowercase">(opcional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0,00"
                      value={formCostPrice}
                      onChange={e => setFormCostPrice(maskCurrency(e.target.value, true))}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
                    />
                  </div>
                  {marginEstimate && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                      Lucro estimado: R$ {marginEstimate.profit.toFixed(2)} ({marginEstimate.marginPct.toFixed(1)}%)
                    </p>
                  )}
                </div>
              </div>

              {/* Estoque e Código */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Estoque Atual
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormStock('999')}
                      className="text-[10px] text-amber-600 font-semibold hover:underline"
                    >
                      Ilimitado
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={e => setFormStock(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    SKU / Código <span className="text-[10px] text-slate-400 font-normal lowercase">(auto)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-gerado se vazio"
                    value={formSku}
                    onChange={e => setFormSku(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Código de Barras <span className="text-[10px] text-slate-400 font-normal lowercase">(EAN)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={formEan}
                    onChange={e => setFormEan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              {/* Descrição curta / Ingredientes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Ingredientes & Descrição do Cardápio
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Café espresso especial, leite vaporizado cremoso, canela e raspas de chocolate belga..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {/* Seleção de Grupos de Modificadores / Opcionais */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Adicionais & Opcionais Disponíveis
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Marque quais grupos de modificadores o cliente pode escolher para este item
                    </p>
                  </div>
                  <Link
                    href="/cafeteria/menu"
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-semibold hover:underline"
                  >
                    Gerenciar Grupos
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {modifierGroups.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-center">
                    <p className="text-xs text-slate-500">
                      Nenhum grupo de adicionais criado ainda (ex: &quot;Tipo de Leite&quot;, &quot;Tamanho&quot;, &quot;Açúcar&quot;).
                    </p>
                    <Link
                      href="/cafeteria/menu"
                      className="inline-block mt-1 text-xs text-amber-600 font-semibold hover:underline"
                    >
                      + Criar grupos de adicionais agora
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {modifierGroups.map(grp => {
                      const isSelected = formSelectedModifiers.includes(grp.id);
                      return (
                        <div
                          key={grp.id}
                          onClick={() => handleToggleModifier(grp.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                            isSelected
                              ? 'bg-amber-50/70 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border ${
                            isSelected 
                              ? 'bg-amber-600 border-amber-600 text-white' 
                              : 'border-slate-300 dark:border-slate-600'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                              {grp.name}
                            </h4>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {grp.options && grp.options.length > 0 
                                ? grp.options.map(o => o.name).join(', ') 
                                : 'Sem opções'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status Ativo / Inativo */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Disponível no Cardápio</h4>
                  <p className="text-[11px] text-slate-500">Item visível no PDV e no cardápio digital</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormStatus(prev => prev === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                    formStatus === 'ACTIVE' ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${
                    formStatus === 'ACTIVE' ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Botões do Rodapé do Formulário */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingProduct ? 'Salvar Alterações' : 'Cadastrar Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Inativar item do cardápio?
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                O produto <span className="font-semibold text-slate-900 dark:text-white">&quot;{productToDelete.name}&quot;</span> será marcado como inativo e não aparecerá para novos pedidos nas mesas e no PDV.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold shadow-sm transition disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Sim, Inativar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
