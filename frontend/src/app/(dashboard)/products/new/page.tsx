'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Save, Loader2, Package, ListTree, Tags, Settings2, ImageIcon, Plus, Trash2, ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import dynamic from 'next/dynamic';
import { CurrencyInput } from '@/components/CurrencyInput';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

const tabs = [
  { id: 'general', label: 'Geral' },
  { id: 'characteristics', label: 'Características e Ficha Técnica' },
  { id: 'stock', label: 'Estoque e variações' },
  { id: 'images', label: 'Imagens' },
];

export default function NewProductPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  
  const [product, setProduct] = useState({
    sku: '',
    name: '',
    short_description: '',
    long_description: '',
    base_price: 0,
    promotional_price: 0,
    cost_price: 0,
    weight_kg: 0,
    width_cm: 0,
    height_cm: 0,
    length_cm: 0,
    category_id: '' as number | '',
    brand_id: '' as number | '',
    model: '',
    ean_gtin: '',
    status: 'ACTIVE',
    stock_quantity: 0,
    cover_url: '',
    characteristics: [] as { characteristic_id: number, value: string }[]
  });

  const [availableCharacteristics, setAvailableCharacteristics] = useState<any[]>([]);

  const [coverBaseUrl, setCoverBaseUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    const fetchSupport = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${getToken()}` };
        const [{ getUser }] = await Promise.all([import('@/lib/auth')]);
        const user = getUser();
        
        const promises = [
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/categories`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/brands`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/characteristics`, { headers })
        ];

        if (user?.company_id) {
          promises.push(fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${user.company_id}/settings`, { headers }));
        }

        const [catRes, brandRes, charRes, settingsRes] = await Promise.all(promises);
        
        if (catRes.ok) setCategories(await catRes.json());
        if (brandRes.ok) setBrands(await brandRes.json());
        if (charRes?.ok) {
           const chars = await charRes.json();
           setAvailableCharacteristics(chars);
        }
        if (settingsRes?.ok) {
          const settings = await settingsRes.json();
          if (settings.cover_image_base_url) {
            setCoverBaseUrl(settings.cover_image_base_url.replace(/\/$/, ''));
          }
        }
      } catch (e) {
        toast.error('Erro ao buscar dados de apoio.');
      }
    };
    fetchSupport();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setProduct(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleToggleStatus = () => {
    setProduct(prev => ({
      ...prev,
      status: prev.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    }));
  };

  const handleAddCharacteristic = () => {
    setProduct(prev => ({
      ...prev,
      characteristics: [...prev.characteristics, { characteristic_id: 0, value: '' }]
    }));
  };

  const handleCharacteristicChange = (index: number, field: string, value: any) => {
    const newChars = [...product.characteristics];
    newChars[index] = { ...newChars[index], [field]: value };
    setProduct(prev => ({ ...prev, characteristics: newChars }));
  };

  const handleRemoveCharacteristic = (index: number) => {
    const newChars = [...product.characteristics];
    newChars.splice(index, 1);
    setProduct(prev => ({ ...prev, characteristics: newChars }));
  };

  const handleSubmit = async () => {
    if (!product.name || !product.sku) {
      toast.error('Preencha os campos obrigatórios (Nome e SKU).');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          ...product,
          promotional_price: product.promotional_price || undefined,
          cost_price: product.cost_price || undefined,
          category_id: product.category_id || undefined,
          brand_id: product.brand_id || undefined,
          cover_url: product.cover_url || undefined,
          characteristics: product.characteristics.filter(c => c.characteristic_id && c.value)
        })
      });

      if (res.ok) {
        toast.success("Produto cadastrado com sucesso!");
        router.push('/products');
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erro ao salvar o produto.");
      }
    } catch (e) {
      toast.error('Ocorreu um erro de comunicação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-16">
      <div className="flex items-center justify-between gap-5 sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur pb-4 pt-2 -mx-4 px-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/products"
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="h-6 w-6 text-[var(--color-primary-base)]" />
              Novo Produto
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Criar produto B2B com estrutura para Marketplaces</p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Produto
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeTab === tab.id 
                ? 'text-[var(--color-primary-base)]' 
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTabProduct"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary-base)]"
              />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {activeTab === 'general' && (
              <motion.div
                key="general"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Basic Info */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 dark:text-white flex items-center gap-2">
                    <ListTree className="w-5 h-5 text-slate-400" /> Informações Básicas
                  </h3>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Nome do Produto <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={product.name}
                        onChange={handleChange}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:placeholder-slate-500 dark:text-white"
                        placeholder="Ex: Livro Inteligência Artificial 2026"
                      />
                    </div>
                    
                    <div>
                         <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex justify-between">
                        <span>Descrição Curta</span>
                        <span className="text-xs text-slate-400 font-normal">Uma frase chamativa</span>
                      </label>
                      <textarea
                        name="short_description"
                        value={product.short_description}
                        onChange={handleChange}
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:placeholder-slate-500 dark:text-white"
                      ></textarea>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Categoria Principal
                      </label>
                      <select
                        name="category_id"
                        value={product.category_id}
                        onChange={handleChange}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                      >
                        <option value="">Nenhuma Categoria</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Descrição Completa
                      </label>
                      <div className="bg-white dark:bg-slate-950 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 [&_.ql-toolbar]:bg-slate-50 dark:[&_.ql-toolbar]:bg-slate-900 [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 dark:[&_.ql-toolbar]:border-slate-800 [&_.ql-editor]:min-h-[150px] [&_.ql-editor]:text-sm [&_.ql-editor]:text-slate-900 dark:[&_.ql-editor]:text-white dark:[&_.ql-picker-label]:text-slate-300 dark:[&_.ql-stroke]:stroke-slate-300 dark:[&_.ql-fill]:fill-slate-300 dark:[&_.ql-picker-options]:bg-slate-900 dark:[&_.ql-picker-item]:text-slate-300">
                        <ReactQuill 
                          theme="snow"
                          value={product.long_description}
                          onChange={(value) => setProduct(prev => ({ ...prev, long_description: value }))}
                          placeholder="Escreva os detalhes técnicos e diferenciais do produto..."
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2">A descrição completa deve fornecer informações abrangentes exigidas pelos marketplaces parceiros.</p>
                    </div>
                  </div>
                </div>

                 {/* Categorization */}
                 <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 dark:text-white flex items-center gap-2">
                    <Tags className="w-5 h-5 text-slate-400" /> Identificadores
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Marca do Produto
                      </label>
                      <select
                        name="brand_id"
                        value={product.brand_id}
                        onChange={handleChange}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                      >
                        <option value="">Sem Marca</option>
                        {brands.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                     <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Modelo (se aplicável)
                      </label>
                      <input
                        type="text"
                        name="model"
                        value={product.model}
                        onChange={handleChange}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:placeholder-slate-500 dark:text-white"
                        placeholder="Nome do Modelo"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Código SKU <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="sku"
                        value={product.sku}
                        onChange={handleChange}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:placeholder-slate-500 dark:text-white uppercase"
                        placeholder="SKU Único"
                      />
                    </div>
                     <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                         Código de Barras (EAN/GTIN)
                      </label>
                      <input
                        type="text"
                        name="ean_gtin"
                        value={product.ean_gtin}
                        onChange={handleChange}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:placeholder-slate-500 dark:text-white"
                        placeholder="13 Dígitos Obrigatórios no MercadoLivre"
                      />
                    </div>
                  </div>
                 </div>
              </motion.div>
            )}

            {activeTab === 'characteristics' && (
              <motion.div
                key="characteristics"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                 <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <ListTree className="w-5 h-5 text-slate-400" /> Ficha Técnica
                      </h3>
                      <button type="button" onClick={handleAddCharacteristic} className="text-sm px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg flex items-center gap-1 font-medium transition dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20">
                        <Plus className="w-4 h-4" /> Adicionar Característica
                      </button>
                    </div>

                    <div className="space-y-4">
                       {product.characteristics.length === 0 && (
                         <div className="text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-500">
                           <p className="text-sm mb-2">Nenhuma característica informada.</p>
                           <button type="button" onClick={handleAddCharacteristic} className="text-sm font-medium text-[var(--color-primary-base)] hover:underline">Adicionar a primeira</button>
                         </div>
                       )}
                       {product.characteristics.map((char, index) => (
                         <div key={index} className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                           <div className="flex-1">
                              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Característica</label>
                              <select 
                                value={char.characteristic_id} 
                                onChange={(e) => handleCharacteristicChange(index, 'characteristic_id', Number(e.target.value))}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)]"
                              >
                                <option value={0}>Selecione...</option>
                                {availableCharacteristics.map((ac) => (
                                  <option key={ac.id} value={ac.id}>{ac.name}</option>
                                ))}
                              </select>
                           </div>
                           <div className="flex-1">
                              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Valor Registrado</label>
                              <input 
                                type="text" 
                                value={char.value} 
                                onChange={(e) => handleCharacteristicChange(index, 'value', e.target.value)}
                                placeholder="Ex: Machado de Assis, 320..."
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm rounded-lg p-2.5 focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)]"
                              />
                           </div>
                           <button type="button" onClick={() => handleRemoveCharacteristic(index)} className="mt-5 p-2.5 text-rose-500 hover:bg-rose-50 rounded-lg transition dark:hover:bg-rose-500/10">
                             <Trash2 className="w-4 h-4" />
                           </button>
                         </div>
                       ))}
                    </div>
                 </div>
              </motion.div>
            )}

            {activeTab === 'stock' && (
               <motion.div
               key="stock"
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               className="space-y-6"
             >
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 dark:text-white flex items-center gap-2">
                    <Package className="w-5 h-5 text-slate-400" /> Estoque Interno Total
                  </h3>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                         Quantidade de Balcão
                      </label>
                      <input
                        type="number"
                        name="stock_quantity"
                        value={product.stock_quantity}
                        onChange={handleChange}
                        className="w-full max-w-[200px] bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:placeholder-slate-500 dark:text-white"
                      />
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 dark:text-white flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-slate-400" /> Logística e Dimensões (Cálculo de Frete)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Peso (kg)</label>
                      <input type="number" step="0.01" name="weight_kg" value={product.weight_kg} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Largura (cm)</label>
                      <input type="number" step="0.1" name="width_cm" value={product.width_cm} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"/>
                    </div>
                     <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Altura (cm)</label>
                      <input type="number" step="0.1" name="height_cm" value={product.height_cm} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"/>
                    </div>
                     <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Comp. (cm)</label>
                      <input type="number" step="0.1" name="length_cm" value={product.length_cm} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"/>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200 flex gap-3 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                    <p className="text-sm">Os correios e transportadoras exigem as dimensões da embalagem final para evitar recUSA na integração de postagem (Meli envios / Shopee).</p>
                  </div>
                </div>
             </motion.div>
            )}

            {activeTab === 'images' && (
               <motion.div
               key="images"
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               className="space-y-6"
              >
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4 dark:text-white flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-slate-400" /> Capa / Imagem Principal
                  </h3>
                  
                  {!product.ean_gtin ? (
                    <div className="bg-amber-50 rounded-xl p-5 border border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400 flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Código ISBN/EAN Necessário</p>
                        <p className="text-sm mt-1">Para carregar ou enviar a capa deste produto, preencha o campo <b>Código de Barras (EAN/GTIN)</b> na aba Geral primeiro.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                       <div className="flex items-center gap-6 bg-slate-50 dark:bg-slate-950 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                         {imagePreview ? (
                           <div className="w-32 h-44 shrink-0 rounded-lg overflow-hidden border border-slate-200 shadow-sm relative group bg-white">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={imagePreview} alt="Capa" className="w-full h-full object-contain" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button type="button" onClick={() => setImagePreview(null)} className="bg-white text-rose-600 p-2 rounded-full hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                              </div>
                           </div>
                         ) : (
                           <div className="w-32 h-44 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400">
                              <ImageIcon className="w-8 h-8 mb-2" />
                              <span className="text-[10px] uppercase font-bold tracking-wider">Sem Capa</span>
                           </div>
                         )}

                         <div className="flex-1">
                            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Padrão de Resolução: <span className="font-mono text-indigo-600 dark:text-indigo-400">{product.ean_gtin}.jpg</span></h4>
                            
                            {coverBaseUrl ? (
                               <p className="text-sm text-slate-500 mb-4">
                                 O sistema tenta carregar a imagem automaticamente baseando-se por prioridade nas configurações gerais.
                               </p>
                            ) : (
                               <p className="text-sm text-slate-500 mb-4">A sua empresa não possui uma URL base configurada nas configurações gerais. Você pode tentar puxar de uma, ou fazer o upload manual abaixo.</p>
                            )}
                            
                            <div className="flex gap-3">
                              {coverBaseUrl && (
                                <button type="button" onClick={() => {
                                  const cUrl = `${coverBaseUrl}/${product.ean_gtin}.jpg`;
                                  setImagePreview(cUrl);
                                  setProduct(prev => ({...prev, cover_url: cUrl}));
                                }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                  Tentar Sincronizar
                                </button>
                              )}
                              
                              <label className={`px-4 py-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-xl transition-colors shadow-sm cursor-pointer flex items-center gap-2 ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
                                {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Fazer Upload Manual
                                <input type="file" className="hidden" accept="image/jpeg, image/png, image/webp" onChange={async (e) => {
                                  if (!e.target.files?.length) return;
                                  setUploadingImage(true);
                                  const formData = new FormData();
                                  formData.append('file', e.target.files[0]);
                                  formData.append('isbn', product.ean_gtin);
                                  
                                  try {
                                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/cover`, {
                                      method: 'POST',
                                      headers: { 'Authorization': `Bearer ${getToken()}` },
                                      body: formData
                                    });
                                    if(res.ok) {
                                      const data = await res.json();
                                      setImagePreview(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${data.url}`);
                                      setProduct(prev => ({...prev, cover_url: data.url}));
                                      toast.success("Imagem enviada com sucesso!");
                                    } else {
                                      const err = await res.json();
                                      toast.error(err.detail || "Erro no upload");
                                    }
                                  } catch (error) {
                                    toast.error("Falha no envio da imagem.");
                                  } finally {
                                    setUploadingImage(false);
                                  }
                                }} />
                              </label>
                            </div>
                         </div>
                       </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            
          </AnimatePresence>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
           <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800">
               <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Produto Ativo</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={product.status === 'ACTIVE'} onChange={handleToggleStatus} />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-[var(--color-primary-base)]"></div>
                  </label>
               </div>
               {product.status !== 'ACTIVE' && (
                 <p className="text-xs text-rose-500">Produtos inativos não serão exportados para o Horus ou ecommerces parceiros.</p>
               )}
           </div>

           <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 space-y-5">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider dark:text-slate-400">Precificação</h3>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Preço Base (Sem desconto) <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <CurrencyInput value={product.base_price} onChangeValue={(val) => setProduct(p => ({...p, base_price: val}))} className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Preço Promocional de Venda</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <CurrencyInput value={product.promotional_price} onChangeValue={(val) => setProduct(p => ({...p, promotional_price: val}))} className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-emerald-200 text-emerald-900 text-sm rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:bg-emerald-950/20 dark:border-emerald-500/30 dark:text-emerald-400" />
                </div>
                {(product.promotional_price > 0 && product.promotional_price < product.base_price) && (
                  <p className="text-xs font-semibold text-emerald-600 mt-2 bg-emerald-50 p-2 rounded-lg dark:bg-emerald-500/10 dark:text-emerald-400">
                    Você está aplicando um desconto de {(((product.base_price - product.promotional_price) / product.base_price) * 100).toFixed(0)}%
                  </p>
                )}
              </div>
              
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-2">Preço de Custo (Opcional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">R$</span>
                  <CurrencyInput value={product.cost_price} onChangeValue={(val) => setProduct(p => ({...p, cost_price: val}))} className="w-full pl-9 pr-3 py-3 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
