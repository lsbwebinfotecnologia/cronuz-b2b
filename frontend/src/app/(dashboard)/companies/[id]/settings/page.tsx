'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Globe, Save, Search, Plus, Trash2, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

export default function CompanySettingsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();
  
  const [loading, setLoading] = useState(true);
  const [savingGeral, setSavingGeral] = useState(false);

  const defaultShowcases = {
      hero_collection: { title: 'Nova Coleção Exclusiva B2B', isbns: [] },
      clearance: { title: 'Queima de Estoque', isbns: [] },
      restock: { title: 'Reposição Rápida', isbns: [] },
      featured: { title: 'Lançamento', isbn: '', banner_url: '', link: '' }
  };

  const [settings, setSettings] = useState({
    cover_image_base_url: '',
    b2b_showcases_config: defaultShowcases,
    b2b_show_stock_quantity: true
  });

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeSearchSlot, setActiveSearchSlot] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings({
            cover_image_base_url: data.cover_image_base_url || '',
            b2b_showcases_config: data.b2b_showcases_config || defaultShowcases,
            b2b_show_stock_quantity: data.b2b_show_stock_quantity !== undefined ? data.b2b_show_stock_quantity : true
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    if (company) {
      fetchSettings();
    }
  }, [company, companyId]);

  async function handleSaveSettings() {
    setSavingGeral(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      toast.success('Configurações gerais atualizadas!');
    } catch (error) {
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setSavingGeral(false);
    }
  }

  // --- Search Engine ---
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 3) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  async function performSearch(query: string) {
    setSearching(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/search?q=${encodeURIComponent(query)}&limit=5`, {
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

  const handleAddIsbn = (slot: string, isbn: string) => {
     if(!isbn) {
        toast.error("Produto sem ISBN mapeado.");
        return;
     }
     
     const config = { ...settings.b2b_showcases_config } as any;
     
     if (slot === 'featured') {
         config[slot].isbn = isbn;
     } else {
         if (!config[slot].isbns) config[slot].isbns = [];
         if (!config[slot].isbns.includes(isbn)) {
             config[slot].isbns.push(isbn);
         } else {
             toast.info("Produto já está na vitrine.");
         }
     }
     
     setSettings({ ...settings, b2b_showcases_config: config });
     setSearchQuery('');
     setActiveSearchSlot(null);
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

  if (loading || !company) {
    return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
         <div>
           <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Configurações Gerais & Vitrines
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
             Configurações globais e layout dinâmico da Home B2B.
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

      <div className="p-6 space-y-8 max-w-5xl mx-auto w-full pb-32">
        <section className="space-y-4">
           <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800/60 dark:bg-slate-900/40">
              <h3 className="text-sm font-bold text-blue-600 tracking-wide uppercase mb-1">INTEGRAÇÃO DE CAPAS</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Servidor fallback global para imagens de referência rápida.</p>
              
              <div className="space-y-3">
                <input
                  type="text"
                  value={settings.cover_image_base_url}
                  onChange={(e) => setSettings(prev => ({ ...prev, cover_image_base_url: e.target.value }))}
                  placeholder="https://capas.cronuz.com.br"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-sm font-mono text-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>
           </div>

           <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800/60 dark:bg-slate-900/40 mt-6">
              <h3 className="text-sm font-bold text-blue-600 tracking-wide uppercase mb-1">Visibilidade da Loja B2B</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Controle as informações de estoque exibidas para os clientes.</p>
              
              <label className="flex items-center gap-4 cursor-pointer">
                  <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.b2b_show_stock_quantity ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.b2b_show_stock_quantity ? 'translate-x-6' : 'translate-x-1'}`} />
                  </div>
                  <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Exibir quantidade exata em estoque</span>
                      <span className="text-xs text-slate-500">Se ativo, mostra "Disponível: X un". Se inativo, mostra apenas visualmente a palavra "Produto Disponível" sem o detalhe exato.</span>
                  </div>
                  <input
                      type="checkbox"
                      className="sr-only"
                      checked={settings.b2b_show_stock_quantity}
                      onChange={(e) => setSettings(prev => ({ ...prev, b2b_show_stock_quantity: e.target.checked }))}
                  />
              </label>
           </div>
        </section>

      </div>
    </motion.div>
  );
}
