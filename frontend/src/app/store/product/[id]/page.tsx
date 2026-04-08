'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  ShoppingCart, 
  PackageOpen, 
  Plus, 
  Minus, 
  Image as ImageIcon,
  BookOpen,
  Tag,
  Star,
  Sparkles
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import Link from 'next/link';
import { ProductImage } from '@/components/store/ProductImage';
import { ProductCard } from '@/components/store/ProductCard';
import { useCart } from '@/components/store/CartContext';

export default function ProductDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [errorText, setErrorText] = useState('');
  const [addedTemp, setAddedTemp] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const { addToCart } = useCart();

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
         const token = getToken();
         const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/product/${id}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
         });
         
         if (res.ok) {
            const data = await res.json();
            setProduct(data);
            
            // Tenta buscar produtos relacionados (Cross-Sell)
            const catId = data?.category?.id;
            const brandStr = typeof data?.brand === 'string' ? data.brand : data?.brand?.name;
            
            let searchBase = '';
            let searchFilter = '';
            
            if (catId && catId !== 0 && catId !== '0') {
                 searchBase = catId.toString();
                 searchFilter = 'COD_GENERO';
            } else if (brandStr) {
                 searchBase = brandStr;
                 searchFilter = 'NOM_EDITORA';
            } else if (data?.category?.name) {
                 searchBase = data.category.name;
                 searchFilter = 'default';
            }
            
            if (searchBase) {
               try {
                  const relatedRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/search?q=${encodeURIComponent(searchBase)}&filter=${searchFilter}&limit=12`, {
                     headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                  });
                  if (relatedRes.ok) {
                     const relData = await relatedRes.json();
                     // Filter out the current product itself and cap to 5 items visually
                     const items = (relData.items || []).filter((item: any) => item.id !== data.id).slice(0, 5);
                     setRelatedProducts(items);
                  }
               } catch (e) {
                  console.error("Erro fetch cross-sell", e);
               }
            }
            
         } else {
            setErrorText('Produto não encontrado.');
         }
      } catch (err) {
         setErrorText('Erro ao carregar detalhes do produto.');
         console.error(err);
      } finally {
         setLoading(false);
      }
    };
    
    if (id) fetchProduct();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)] flex flex-col items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-slate-500 font-medium tracking-tight">Carregando detalhes...</p>
        </div>
      </div>
    );
  }

  if (errorText || !product) {
    return (
      <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)] p-8">
        <div className="max-w-2xl mx-auto py-20 text-center flex flex-col items-center bg-white rounded-3xl border border-rose-200 border-dashed dark:bg-slate-900/50 dark:border-rose-900/30 shadow-sm">
           <PackageOpen className="w-16 h-16 text-rose-300 dark:text-rose-600/50 mb-4" />
           <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">{errorText || 'Produto Indisponível'}</h3>
           <Link href="/store" className="mt-6 px-6 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-medium transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
             Voltar ao Catálogo
           </Link>
        </div>
      </div>
    );
  }

  const price = product.promotional_price > 0 ? product.promotional_price : product.base_price;
  const isOutOfStock = product.stock_quantity <= 0;

  const handleDecrease = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  const handleIncrease = () => {
    if (quantity < product.stock_quantity) setQuantity(quantity + 1);
  };

  const handleAddToCart = () => {
    if (!isOutOfStock) {
      console.log('Adicionando ao carrinho:', product.name, quantity);
      addToCart(product, quantity);
      setAddedTemp(true);
      setTimeout(() => setAddedTemp(false), 2000);
    }
  };

  return (
    <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)] pb-20">
      
      {/* Breadcrumb / Back Navigation */}
      <div className="w-full bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
           <button 
             onClick={() => router.back()}
             className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors w-fit"
           >
             <ArrowLeft className="w-4 h-4" /> Voltar
           </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="bg-white dark:bg-slate-900/50 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
           
           {/* Left: Product Image */}
           <div className="flex flex-col items-center">
             <div className="w-full aspect-[3/4] max-w-md bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center relative overflow-hidden group">
               
               <ProductImage 
                  eanGtin={product.ean_gtin} 
                  alt={product.name} 
                  className="w-full h-full p-4 transition-transform duration-500 group-hover:scale-[1.03]"
                  iconClassName="w-20 h-20 text-slate-300 dark:text-slate-600 transition-transform group-hover:scale-110"
               />
               
               {/* Badges */}
               <div className="absolute top-4 left-4 flex flex-col gap-2">
                 {product.promotional_price > 0 && !isOutOfStock && (
                    <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-emerald-500/20">
                      OFERTA ESPECIAL
                    </span>
                 )}
                 {product.category && (
                    <span className="bg-white/90 backdrop-blur-md text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm dark:bg-slate-950/80 dark:text-slate-300 dark:border-slate-800">
                      {product.category.name}
                    </span>
                 )}
               </div>
               
               {isOutOfStock && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
                    <span className="font-black text-2xl text-slate-800 dark:text-white rotate-[-15deg] border-4 border-slate-800 dark:border-white px-6 py-2 rounded-xl">
                      ESGOTADO
                    </span>
                  </div>
               )}
             </div>
           </div>

           {/* Right: Product Details & Actions */}
           <div className="flex flex-col">
              <div className="mb-6">
                <div className="flex items-center gap-2 text-sm text-[var(--color-primary-base)] font-bold mb-2 uppercase tracking-wider">
                   <Tag className="w-4 h-4" />
                   {product.category?.name || 'Vários Autores'}
                </div>
                <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight mb-4">
                  {product.name}
                </h1>
                
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                    <span>SKU:</span> <span className="font-mono text-slate-900 dark:text-slate-300">{product.sku}</span>
                  </span>
                  {product.ean_gtin && (
                    <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                      <span>ISBN:</span> <span className="font-mono text-slate-900 dark:text-slate-300">{product.ean_gtin}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Price Block */}
              <div className="py-6 border-y border-slate-100 dark:border-slate-800 mb-8">
                 <div className="flex items-end gap-4 mb-2">
                   <span className={`text-5xl font-black tracking-tight ${isOutOfStock ? 'text-slate-400 dark:text-slate-500' : 'text-[var(--color-primary-base)]'}`}>
                     {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
                   </span>
                   {product.promotional_price > 0 && !isOutOfStock && (
                     <div className="flex flex-col pb-1">
                       <span className="text-sm text-slate-400 font-medium">De:</span>
                       <span className="text-lg text-slate-400 line-through font-bold">
                         {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.base_price)}
                       </span>
                     </div>
                   )}
                 </div>
                 
                 <div className="mt-2">
                   {isOutOfStock ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 text-rose-600 font-bold text-sm dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                        Produto sem estoque no momento
                      </span>
                   ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 font-bold text-sm dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Estoque disponível: {product.stock_quantity} un
                      </span>
                   )}
                 </div>
              </div>

               {/* Cart Actions */}
               <div className="flex flex-col sm:flex-row gap-4 mb-10">
                 <div className="flex-shrink-0 flex items-center justify-between bg-white border-2 border-slate-200 rounded-2xl p-2 dark:bg-slate-950 dark:border-slate-700 h-16 w-full sm:w-40">
                   <button 
                     onClick={handleDecrease}
                     disabled={isOutOfStock || quantity <= 1}
                     className="p-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                   >
                     <Minus className="w-5 h-5" />
                   </button>
                   
                   <span className="text-lg font-black text-slate-700 dark:text-slate-300 w-12 text-center select-none">
                     {isOutOfStock ? 0 : quantity}
                   </span>
                   
                   <button 
                     onClick={handleIncrease}
                     disabled={isOutOfStock || quantity >= product.stock_quantity}
                     className="p-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
                   >
                     <Plus className="w-5 h-5" />
                   </button>
                 </div>
                 
                 <button 
                    onClick={handleAddToCart}
                    disabled={isOutOfStock}
                    className={`flex-1 flex items-center justify-center gap-3 rounded-2xl h-16 font-bold text-lg disabled:opacity-30 disabled:bg-slate-400 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 ${
                      addedTemp 
                        ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                        : 'bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] shadow-[var(--color-primary-base)]/20'
                    }`}
                 >
                   <ShoppingCart className="w-6 h-6" />
                   {addedTemp ? 'Adicionado com sucesso!' : 'Adicionar ao Carrinho'}
                 </button>
               </div>

               {/* Descriptions & Specs */}
               <div className="space-y-8">


                   {product.long_description && (
                     <div>
                       <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Descrição Completa</h3>
                       <div 
                          className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400 leading-relaxed overflow-hidden break-words whitespace-normal"
                          dangerouslySetInnerHTML={{ __html: product.long_description }}
                       />
                     </div>
                  )}
                  
                  {/* Ficha Técnica (Dimensões) */}
                  {(product.weight_kg || product.width_cm || product.height_cm || product.length_cm) && (
                     <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                       <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Ficha Técnica</h3>
                       <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {product.weight_kg && (
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Peso</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{product.weight_kg} kg</span>
                            </div>
                          )}
                          {product.width_cm && (
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Largura</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{product.width_cm} cm</span>
                            </div>
                          )}
                          {product.height_cm && (
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Altura</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{product.height_cm} cm</span>
                            </div>
                          )}
                          {product.length_cm && (
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Comprimento</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{product.length_cm} cm</span>
                            </div>
                          )}
                       </div>
                     </div>
                  )}
               </div>

           </div>
        </div>

        {/* Cross-Sell Sugestões de Compra */}
        {relatedProducts.length > 0 && (
           <div className="mt-20">
              <div className="flex items-center gap-3 mb-8">
                 <Sparkles className="w-6 h-6 text-[#f4a261]" />
                 <h2 className="text-2xl font-black text-slate-800 dark:text-white">Mais de {product.brand?.name || product.category?.name || 'Sugestões'}</h2>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                 {relatedProducts.map((relProd, idx) => (
                    <ProductCard key={idx} product={relProd} />
                 ))}
              </div>
           </div>
        )}

      </div>
    </div>
  );
}
