'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Save, Search, UploadCloud, X, LayoutTemplate, Image as LuImage, Plus as LuPlus, Trash2 as LuTrash2, Percent as LuPercent, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { getImageUrl } from '@/lib/image_helper';

export default function SellerShowcasesPage() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGeral, setSavingGeral] = useState(false);

  const defaultShowcases: any = {
      hero_collection: { title: 'Nova Coleção Exclusiva B2B', isbns: [] },
      clearance: { title: 'Queima de Estoque', isbns: [] },
      restock: { title: 'Reposição Rápida', isbns: [] },
      featured: { title: 'Lançamento', isbn: '', banner_url: '', link: '' },
      rotating_banners: []
  };

  const [settings, setSettings] = useState({
    b2b_showcases_config: defaultShowcases
  });

  // Local Cache to resolve Product Details (Title, Publisher, Price)
  const [resolvedProducts, setResolvedProducts] = useState<Record<string, any>>({});
  const [isResolving, setIsResolving] = useState(false);

  // Search Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalSlot, setActiveModalSlot] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user?.company_id) {
       setCompanyId(user.company_id);
    } else {
       setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/config?company_id=${companyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings({
            b2b_showcases_config: data.b2b_showcases_config || defaultShowcases
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    if (companyId) {
      fetchSettings();
    }
  }, [companyId]);

  // Bulk Resolve Missing ISBNs on load
  useEffect(() => {
     const resolveIsbns = async () => {
        if (!settings.b2b_showcases_config) return;
        const config = settings.b2b_showcases_config as any;
        const allIsbns = new Set<string>();
        
        ['hero_collection', 'clearance', 'restock'].forEach(slot => {
            if (config[slot]?.isbns) {
                config[slot].isbns.forEach((i: string) => allIsbns.add(i));
            }
        });
        if (config.featured?.isbn) {
            allIsbns.add(config.featured.isbn);
        }

        const missing = Array.from(allIsbns).filter(isbn => !resolvedProducts[isbn]);
        if (missing.length === 0) return;

        setIsResolving(true);
        const token = getToken();
        
        const newResolved = { ...resolvedProducts };
        
        await Promise.allSettled(missing.map(async (isbn) => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/product/${isbn}`, {
                   headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                   const data = await res.json();
                   newResolved[isbn] = data;
                }
            } catch (e) {}
        }));
        
        setResolvedProducts(newResolved);
        setIsResolving(false);
     };

     resolveIsbns();
  }, [settings.b2b_showcases_config]);

  async function handleSaveSettings() {
    if (!companyId) return;
    setSavingGeral(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ b2b_showcases_config: settings.b2b_showcases_config })
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      toast.success('Layout salvo com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setSavingGeral(false);
    }
  }

  // --- Search Engine ---
  useEffect(() => {
    if (!isModalOpen) {
       setSearchQuery('');
       setSearchResults([]);
       return;
    }
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 3) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, isModalOpen]);

  async function performSearch(query: string) {
    setSearching(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/search?q=${encodeURIComponent(query)}&limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items || []);
      }
    } catch (e) {
    } finally {
      setSearching(false);
    }
  }

  const handleAddProduct = (slot: string | null, product: any) => {
     if(!product || !product.ean_gtin || !slot) {
        toast.error("Produto inválido ou sem ISBN.");
        return;
     }

     const isbn = product.ean_gtin;
     setResolvedProducts(prev => ({ ...prev, [isbn]: product }));
     
     const config = { ...settings.b2b_showcases_config } as any;
     
     if (slot === 'featured') {
         config[slot].isbn = isbn;
         toast.success("Produto ancorado ao banner!");
         setIsModalOpen(false);
     } else {
         if (!config[slot].isbns) config[slot].isbns = [];
         if (!config[slot].isbns.includes(isbn)) {
             config[slot].isbns.push(isbn);
             toast.success("Produto adicionado à vitrine!");
         } else {
             toast.info("Produto já está na vitrine.");
         }
     }
     
     setSettings({ ...settings, b2b_showcases_config: config });
  };

  const handleAddRotatingBanner = () => {
     const config = { ...settings.b2b_showcases_config } as any;
     if (!config.rotating_banners) config.rotating_banners = [];
     config.rotating_banners.push({ id: Math.random().toString(36).substr(2, 9), image_url: '', link: '', active: true });
     setSettings({ ...settings, b2b_showcases_config: config });
  };

  const handleRemoveRotatingBanner = (index: number) => {
     const config = { ...settings.b2b_showcases_config } as any;
     config.rotating_banners.splice(index, 1);
     setSettings({ ...settings, b2b_showcases_config: config });
  };

  const handleRemoveIsbn = (slot: string, index: number) => {
     const config = { ...settings.b2b_showcases_config } as any;
     config[slot].isbns.splice(index, 1);
     setSettings({ ...settings, b2b_showcases_config: config });
  };

  const updateTitle = (slot: string, title: string) => {
     const config = { ...settings.b2b_showcases_config } as any;
     config[slot].title = title;
     setSettings({ ...settings, b2b_showcases_config: config });
  };

  const openSearchModal = (slotKey: string) => {
     setActiveModalSlot(slotKey);
     setIsModalOpen(true);
  };

  if (loading) {
    return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
    );
  }

  if (!companyId) {
    return (
       <div className="p-8 text-center text-slate-500">
         Disponível apenas para contas B2B (Lojistas).
       </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
         <div>
           <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             <LayoutTemplate className="w-6 h-6 text-[var(--color-primary-base)]" />
             Conteúdo da Home para os Clientes
           </h1>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
             Configure os títulos e produtos das três vitrines principais da sua loja.
           </p>
         </div>
         <button
            onClick={handleSaveSettings}
            disabled={savingGeral}
            className="px-6 py-2.5 text-sm rounded-xl font-bold flex items-center gap-2 bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary-base)]/25 transition-all active:scale-[0.98]"
         >
            {savingGeral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingGeral ? 'Salvando...' : 'Salvar Alterações'}
         </button>
      </div>

      {isResolving && (
         <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-slate-800 shadow-xl shadow-blue-500/10 border border-blue-100 dark:border-blue-900/50 rounded-full px-6 py-2 flex items-center gap-3 text-sm font-bold text-blue-600 dark:text-blue-400">
             <Loader2 className="w-4 h-4 animate-spin" /> Atualizando catálogo da vitrine...
         </div>
      )}

      <div className="space-y-8 w-full pb-32">
         {/* Cards de Vitrines */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             
             {/* Nova Coleção */}
             <ShowcaseBuilderCard 
                titleLabel="Vitrine 1" 
                slotKey="hero_collection" 
                config={settings.b2b_showcases_config?.hero_collection} 
                resolvedProducts={resolvedProducts}
                onOpenModal={openSearchModal}
                onRemove={handleRemoveIsbn}
                onTitleChange={updateTitle}
                colorClass="bg-gradient-to-br from-indigo-500 to-purple-600"
             />

             {/* Queima de Estoque */}
             <ShowcaseBuilderCard 
                titleLabel="Vitrine 2" 
                slotKey="clearance" 
                config={settings.b2b_showcases_config?.clearance} 
                resolvedProducts={resolvedProducts}
                onOpenModal={openSearchModal}
                onRemove={handleRemoveIsbn}
                onTitleChange={updateTitle}
                colorClass="bg-emerald-500"
             />

             {/* Reposição */}
             <ShowcaseBuilderCard 
                titleLabel="Vitrine 3" 
                slotKey="restock" 
                config={settings.b2b_showcases_config?.restock} 
                resolvedProducts={resolvedProducts}
                onOpenModal={openSearchModal}
                onRemove={handleRemoveIsbn}
                onTitleChange={updateTitle}
                colorClass="bg-sky-500"
             />

             {/* Banners Rotativos (Novo) */}
             <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 col-span-1 lg:col-span-2 relative mt-4">
                 <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                       <LuImage className="w-5 h-5 text-indigo-500"/> Banners Rotativos (Topo da Loja)
                    </h4>
                    <button
                       onClick={handleAddRotatingBanner}
                       className="px-4 py-2 text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-2"
                    >
                       <LuPlus className="w-4 h-4"/> Adicionar Banner
                    </button>
                 </div>
                 
                 <div className="space-y-4">
                    {(!settings.b2b_showcases_config?.rotating_banners || settings.b2b_showcases_config.rotating_banners.length === 0) && (
                       <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                          Nenhum banner rotativo configurado. Adicione o primeiro para habilitar o carrossel no topo da loja.
                       </div>
                    )}
                    {settings.b2b_showcases_config?.rotating_banners?.map((banner: any, idx: number) => (
                       <div key={banner.id || idx} className="flex flex-col md:flex-row gap-4 p-4 border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-2xl relative group">
                           {/* Preview Image */}
                           <div className="w-full md:w-32 shrink-0">
                               {banner.image_url ? (
                                  <img src={getImageUrl(banner.image_url)} alt="Banner" className="w-full h-20 object-cover rounded-xl border border-slate-200 dark:border-slate-700" />
                               ) : (
                                  <div className="w-full h-20 bg-slate-200 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                                     <LuImage className="w-6 h-6"/>
                                  </div>
                               )}
                           </div>
                           
                           {/* Controls */}
                           <div className="flex-1 flex flex-col gap-3">
                               <div className="flex gap-2">
                                  <div className="flex-1">
                                     <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block">URL da Imagem (Recomendado 1920x400)</label>
                                        <button
                                           onClick={() => handleRemoveRotatingBanner(idx)}
                                           className="text-xs text-rose-500 hover:text-rose-600 font-medium"
                                        >
                                           Remover
                                        </button>
                                     </div>
                                     <div className="flex gap-2">
                                        <input
                                           type="file"
                                           accept="image/*"
                                           onChange={async (e) => {
                                              const file = e.target.files?.[0];
                                              if (!file) return;
                                              if (file.size > 10 * 1024 * 1024) {
                                                  toast.error('A imagem excede o limite máximo de 10MB.');
                                                  e.target.value = '';
                                                  return;
                                              }
                                              const formData = new FormData();
                                              formData.append('file', file);
                                              const toastId = toast.loading('Fazendo upload...');
                                              try {
                                                  const token = getToken();
                                                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/image`, {
                                                    method: 'POST',
                                                    headers: { 'Authorization': `Bearer ${token}` },
                                                    body: formData
                                                  });
                                                  if (!res.ok) {
                                                      const errData = await res.json().catch(() => ({}));
                                                      throw new Error(errData.detail || 'Erro no upload da imagem.');
                                                  }
                                                  const data = await res.json();
                                                  
                                                  const config = { ...settings.b2b_showcases_config };
                                                  config.rotating_banners[idx].image_url = data.url;
                                                  setSettings({ ...settings, b2b_showcases_config: config });
                                                  toast.success('Upload concluído!', { id: toastId });
                                              } catch(err: any) {
                                                  toast.error(err.message || 'Erro no upload.', { id: toastId });
                                              }
                                           }}
                                           className="w-1/3 text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer dark:file:bg-blue-900/30 dark:file:text-blue-400"
                                        />
                                        <input
                                           type="text"
                                           placeholder="URL direta (opcional)"
                                           value={banner.image_url || ''}
                                           onChange={(e) => {
                                              const config = { ...settings.b2b_showcases_config };
                                              config.rotating_banners[idx].image_url = e.target.value;
                                              setSettings({ ...settings, b2b_showcases_config: config });
                                           }}
                                           className="flex-1 bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                                        />
                                     </div>
                                  </div>
                               </div>
                               
                               <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Link de Destino (Para onde vai ao clicar?)</label>
                                  <input
                                     type="text"
                                     placeholder="Ex: /store/search?category=lancamentos"
                                     value={banner.link || ''}
                                     onChange={(e) => {
                                        const config = { ...settings.b2b_showcases_config };
                                        config.rotating_banners[idx].link = e.target.value;
                                        setSettings({ ...settings, b2b_showcases_config: config });
                                     }}
                                     className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                                  />
                               </div>
                           </div>
                       </div>
                    ))}
                 </div>
             </div>

             {/* Super Destaque Hero */}
             <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 col-span-1 lg:col-span-2 relative overflow-visible mt-4">
                 <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <LuPercent className="w-5 h-5 text-rose-500"/> Super Destaque (Banner Principal com Produto Acoplado)
                 </h4>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                       <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Título da Ação</label>
                          <input
                            type="text"
                            value={settings.b2b_showcases_config?.featured?.title || ''}
                            onChange={(e) => {
                               const config = { ...settings.b2b_showcases_config };
                               config.featured.title = e.target.value;
                               setSettings({ ...settings, b2b_showcases_config: config });
                            }}
                            placeholder="Ex: Lançamento Imperdível"
                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                          />
                       </div>
                       <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block flex items-center justify-between">
                            <span className="flex items-center gap-1"><UploadCloud className="w-4 h-4 text-emerald-500"/> Arte do Destaque</span>
                            <div className="flex items-center gap-2">
                               {settings.b2b_showcases_config?.featured?.banner_url && (
                                  <button
                                     onClick={() => {
                                        const config = { ...settings.b2b_showcases_config };
                                        config.featured.banner_url = '';
                                        setSettings({ ...settings, b2b_showcases_config: config });
                                     }}
                                     className="text-xs text-rose-500 hover:text-rose-600 font-bold"
                                  >
                                     Remover Imagem
                                  </button>
                               )}
                               <span className="text-emerald-600 bg-emerald-50 px-2 rounded font-mono">1920x400px</span>
                            </div>
                          </label>
                          <div className="flex flex-col gap-3">
                             {settings.b2b_showcases_config?.featured?.banner_url && (
                                <img src={getImageUrl(settings.b2b_showcases_config.featured.banner_url)} alt="Preview" className="w-full h-24 object-cover rounded-xl border border-slate-200" />
                             )}
                             <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                   const file = e.target.files?.[0];
                                   if (!file) return;
                                   if (file.size > 10 * 1024 * 1024) {
                                       toast.error('A imagem excede o limite máximo de 10MB.');
                                       e.target.value = '';
                                       return;
                                   }
                                   const formData = new FormData();
                                   formData.append('file', file);
                                   
                                   const toastId = toast.loading('Fazendo upload da imagem...');
                                   try {
                                       const token = getToken();
                                       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/image`, {
                                         method: 'POST',
                                         headers: { 'Authorization': `Bearer ${token}` },
                                         body: formData
                                       });
                                       if (!res.ok) {
                                           const errData = await res.json().catch(() => ({}));
                                           throw new Error(errData.detail || 'Erro no upload da imagem.');
                                       }
                                       const data = await res.json();
                                       
                                       const config = { ...settings.b2b_showcases_config };
                                       config.featured.banner_url = data.url;
                                       setSettings({ ...settings, b2b_showcases_config: config });
                                       toast.success('Imagem salva com sucesso!', { id: toastId });
                                   } catch(err: any) {
                                       toast.error(err.message || 'Erro no upload.', { id: toastId });
                                   }
                                }}
                                className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border file:border-slate-200 file:text-sm file:font-semibold file:bg-white file:text-slate-700 hover:file:bg-slate-50 dark:file:bg-slate-800 dark:file:border-slate-700 dark:file:text-slate-300 dark:hover:file:bg-slate-700 cursor-pointer"
                             />
                             <input
                                type="text"
                                placeholder="Ou cole a URL diretamente (https://...)"
                                value={settings.b2b_showcases_config?.featured?.banner_url || ''}
                                onChange={(e) => {
                                   const config = { ...settings.b2b_showcases_config };
                                   config.featured.banner_url = e.target.value;
                                   setSettings({ ...settings, b2b_showcases_config: config });
                                }}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-950 dark:border-slate-800 dark:text-gray-400"
                             />
                          </div>
                       </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col dark:bg-slate-800/30 dark:border-slate-700/50">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Produto Ancorado (Add To Cart Acoplado)</label>
                        <p className="text-xs text-slate-400 mb-4">Procure um produto do acervo para que ele seja inserido automaticamente do lado direito do banner de destaque.</p>
                        
                        {settings.b2b_showcases_config?.featured?.isbn ? (
                           <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm mt-auto">
                              <div className="flex-1 pr-4 min-w-0">
                                 <span className="text-[10px] font-bold text-emerald-600 block mb-1">PRODUTO ATRELADO</span>
                                 {resolvedProducts[settings.b2b_showcases_config.featured.isbn] ? (() => {
                                    const rp = resolvedProducts[settings.b2b_showcases_config.featured.isbn];
                                    return (
                                       <>
                                          <p className="font-bold text-slate-900 dark:text-white line-clamp-1">{rp.name}</p>
                                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                                             <span className="font-mono text-xs text-slate-500 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 rounded">{rp.ean_gtin}</span>
                                             {rp.brand && <span className="text-[10px] font-bold uppercase text-slate-400">{rp.brand}</span>}
                                             {(rp.base_price || rp.price) ? (
                                                <span className="text-emerald-600 font-bold text-sm ml-auto">
                                                   R$ {Number(rp.base_price || rp.price).toFixed(2).replace('.', ',')}
                                                </span>
                                             ) : null}
                                          </div>
                                       </>
                                    );
                                 })() : (
                                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-emerald-400 flex items-center gap-2">
                                       {settings.b2b_showcases_config.featured.isbn} <Loader2 className="w-3 h-3 animate-spin"/>
                                    </span>
                                 )}
                              </div>
                              <button onClick={() => {
                                 const config = { ...settings.b2b_showcases_config };
                                 config.featured.isbn = '';
                                 setSettings({ ...settings, b2b_showcases_config: config });
                              }} className="p-3 text-rose-500 hover:bg-rose-50 rounded-xl dark:hover:bg-rose-500/10">
                                 <Trash2 className="w-5 h-5"/>
                              </button>
                           </div>
                        ) : (
                           <div className="mt-auto">
                              <button
                                 onClick={() => openSearchModal('featured')}
                                 className="w-full py-4 bg-white border border-slate-200 text-sm font-bold text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 shadow-sm"
                              >
                                 <Search className="w-5 h-5"/> Vincular Produto do Acervo
                              </button>
                           </div>
                        )}
                    </div>
                 </div>
             </div>
             
         </div>
      </div>

      {/* SEARCH MODAL */}
      <AnimatePresence>
         {isModalOpen && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
            >
               <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
               >
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                     <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                        <Search className="w-5 h-5 text-indigo-500" />
                        Buscar no Catálogo
                     </h3>
                     <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                        <X className="w-6 h-6" />
                     </button>
                  </div>
                  
                  <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50">
                     <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Search className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                          type="text"
                          autoFocus
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Digite o título, SKU ou ISBN..."
                          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 text-base font-medium rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-white shadow-sm transition-all"
                        />
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 bg-slate-50/20 dark:bg-transparent">
                     {searching ? (
                        <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-4">
                           <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                           <p className="font-medium">Buscando no acervo...</p>
                        </div>
                     ) : searchResults.length > 0 ? (
                        <div className="p-2 space-y-2">
                           {searchResults.map((item: any) => (
                              <div key={item.id} className="flex items-center gap-4 p-4 border border-slate-100 dark:border-slate-800 rounded-2xl hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition-colors group bg-white dark:bg-slate-800/50 shadow-sm">
                                 <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-900 dark:text-white line-clamp-1">{item.name}</p>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                       <span className="bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded text-xs font-mono text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                          {item.ean_gtin}
                                       </span>
                                       {item.brand && (
                                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded dark:bg-emerald-900/30 dark:text-emerald-400">
                                             {item.brand}
                                          </span>
                                       )}
                                       {(item.base_price || item.price) ? (
                                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 border-l border-slate-200 dark:border-slate-700 pl-3">
                                            R$ {Number(item.base_price || item.price || 0).toFixed(2).replace('.', ',')}
                                          </span>
                                       ) : null}
                                    </div>
                                 </div>
                                 <button 
                                   onClick={() => handleAddProduct(activeModalSlot, item)}
                                   className="p-3 bg-white border border-slate-200 text-slate-700 rounded-xl group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-500 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2"
                                 >
                                    <Plus className="w-5 h-5" />
                                    <span className="text-sm font-bold hidden sm:block">Adicionar</span>
                                 </button>
                              </div>
                           ))}
                        </div>
                     ) : searchQuery.length >= 3 ? (
                        <div className="p-16 text-center text-slate-500">
                           <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Search className="w-8 h-8 opacity-40 text-slate-400" />
                           </div>
                           <p className="font-medium text-lg text-slate-700 dark:text-slate-300 mb-1">Nenhum produto encontrado</p>
                           <p className="text-sm">Tente buscar por outro termo de pesquisa.</p>
                        </div>
                     ) : (
                        <div className="p-16 text-center text-slate-400">
                           <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                              <LayoutTemplate className="w-8 h-8 opacity-30 text-slate-400" />
                           </div>
                           <p className="font-medium">Digite pelo menos 3 caracteres para buscar.</p>
                        </div>
                     )}
                  </div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>
    </motion.div>
  );
}

function ShowcaseBuilderCard({ titleLabel, slotKey, config, resolvedProducts, onOpenModal, onRemove, onTitleChange, colorClass }: any) {
   if (!config) return null;

   return (
      <div className={`rounded-3xl p-6 relative overflow-hidden ${colorClass} text-white shadow-lg flex flex-col h-full`}>
          <div className="relative z-10 flex-1 flex flex-col">
             <span className="text-sm font-bold uppercase tracking-widest opacity-90 mb-3 block flex items-center gap-2"><LayoutTemplate className="w-4 h-4"/> {titleLabel}</span>
             
             <input
                type="text"
                value={config.title || ''}
                onChange={(e) => onTitleChange(slotKey, e.target.value)}
                placeholder="Título da Vitrine na Loja"
                className="w-full bg-black/10 hover:bg-black/20 focus:bg-black/30 border border-white/20 text-white rounded-2xl px-5 py-4 text-xl font-bold font-serif outline-none focus:ring-4 focus:ring-white/30 placeholder:text-white/50 mb-6 transition-all shadow-inner"
             />

             <div className="bg-black/20 p-5 rounded-2xl border border-white/10 flex-1 flex flex-col max-h-[300px]">
                <div className="flex items-center justify-between mb-4">
                   <span className="text-[10px] tracking-widest uppercase font-bold text-white/70">PRODUTOS VINCULADOS ({config.isbns?.length || 0})</span>
                </div>

                <div className="flex flex-col gap-2.5 mb-6 flex-1 overflow-y-auto pr-1">
                   {config.isbns?.map((isbn: string, idx: number) => {
                      const prod = resolvedProducts[isbn];
                      return (
                      <div key={idx} className="bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl p-3 flex items-center gap-3 text-sm transition-colors shadow-sm backdrop-blur-sm group relative">
                         <div className="flex-1 min-w-0">
                            {prod ? (
                               <>
                                 <p className="font-bold text-white line-clamp-1 pr-6">{prod.name}</p>
                                 <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <span className="font-mono text-[10px] text-white/80 bg-black/30 px-1.5 py-0.5 rounded">{isbn}</span>
                                    {prod.brand && <span className="text-[10px] font-bold uppercase tracking-widest text-[#00f2fe]">{prod.brand}</span>}
                                    {(prod.base_price || prod.price) ? (
                                       <span className="text-white font-bold text-xs ml-auto bg-black/20 px-2 py-0.5 rounded-md drop-shadow">
                                          R$ {Number(prod.base_price || prod.price).toFixed(2).replace('.', ',')}
                                       </span>
                                    ) : null}
                                 </div>
                               </>
                            ) : (
                               <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm">{isbn}</span>
                                  <Loader2 className="w-3 h-3 animate-spin opacity-50"/>
                               </div>
                            )}
                         </div>
                         <button onClick={() => onRemove(slotKey, idx)} className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 bg-rose-500 rounded-lg text-white hover:bg-rose-600 transition-all shadow-md" title="Remover Produto">
                            <Trash2 className="w-3.5 h-3.5"/>
                         </button>
                      </div>
                   )})}
                   {(!config.isbns || config.isbns.length === 0) && (
                      <div className="h-20 flex items-center justify-center border-2 border-dashed border-white/10 rounded-xl">
                         <span className="text-sm opacity-50 italic">Área vazia. Adicione produtos abaixo.</span>
                      </div>
                   )}
                </div>

                <button
                   onClick={() => onOpenModal(slotKey)}
                   className="w-full py-3.5 bg-white/10 border border-white/20 text-sm font-bold text-white rounded-xl hover:bg-white hover:text-slate-900 transition-all flex items-center justify-center gap-2 mt-auto shadow-sm"
                >
                   <Search className="w-5 h-5 opacity-70 group-hover:opacity-100 group-hover:text-indigo-500"/> Buscar no Acervo
                </button>

             </div>
          </div>
      </div>
   );
}
