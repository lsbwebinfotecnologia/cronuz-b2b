'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Sparkles, Filter, PackageOpen, MousePointerClick, Image as ImageIcon, Search, Plus, Trash2, GripVertical } from 'lucide-react';
import { getToken } from '@/lib/auth';

export default function EditShowcasePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [formData, setFormData] = useState({
    name: '',
    rule_type: 'RECENT',
    reference_id: '',
    display_on_home: false,
    display_order: 1,
    banner_url: '',
    sort_by: 'MANUAL',
    product_ids: [] as number[],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [manualProducts, setManualProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchShowcase = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/showcases/${id}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFormData({
            name: data.name,
            rule_type: data.rule_type,
            reference_id: data.reference_id?.toString() || '',
            display_on_home: data.display_on_home,
            display_order: data.display_order,
            banner_url: data.banner_url || '',
            sort_by: data.sort_by || 'MANUAL',
            product_ids: []
          });
          if (data.rule_type === 'MANUAL' && data.products) {
            setManualProducts(data.products);
          }
        } else {
          setErrorText('Vitrine não encontrada');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    if (id) fetchShowcase();
  }, [id]);

  const searchProducts = async () => {
    if (!searchQ.trim()) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/?name=${encodeURIComponent(searchQ)}&limit=10`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items || []);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const addManualProduct = (product: any) => {
    if (!manualProducts.find(p => p.id === product.id)) {
      setManualProducts([...manualProducts, product]);
    }
  };

  const removeManualProduct = (id: number) => {
    setManualProducts(manualProducts.filter(p => p.id !== id));
  };

  const rules = [
    { id: 'RECENT', icon: Sparkles, title: 'Lançamentos', desc: 'Auto-preenche com os últimos 20 produtos adicionados.' },
    { id: 'HIGH_STOCK', icon: PackageOpen, title: 'Maiores Estoques', desc: 'Destaca automaticamente os 20 produtos com maior volume.' },
    { id: 'CATEGORY', icon: Filter, title: 'Por Categoria', desc: 'Exibe apenas os itens da Categoria que você selecionar.' },
    { id: 'MANUAL', icon: MousePointerClick, title: 'Curadoria Manual', desc: 'Você escolhe a dedo quais produtos deverão aparecer.' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorText('');

    try {
      const payload: any = {
        name: formData.name,
        rule_type: formData.rule_type,
        display_on_home: formData.display_on_home,
        display_order: Number(formData.display_order),
        sort_by: formData.sort_by
      };

      if (formData.reference_id && (formData.rule_type === 'CATEGORY' || formData.rule_type === 'BRAND')) {
        payload.reference_id = Number(formData.reference_id);
      }
      if (formData.banner_url) {
        payload.banner_url = formData.banner_url;
      }
      if (formData.rule_type === 'MANUAL') {
        payload.product_ids = manualProducts.map(p => p.id);
      }

      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/showcases/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        router.push('/marketing/showcases');
      } else {
        const data = await res.json();
        setErrorText(data.detail || 'Erro ao criar vitrine');
      }
    } catch (err: any) {
      setErrorText('Erro de conexão ao salvar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link 
          href="/marketing/showcases" 
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors bg-white dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Editar Vitrine</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Edite as regras, produtos e banners para a Storefront.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">Carregando...</div>
      ) : (
        <>
          {errorText && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-sm font-medium dark:bg-rose-900/10 dark:text-rose-400 dark:border-rose-900/30">
              {errorText}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
        {/* Block 1: Identity */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            1. Identidade Principal
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Título da Vitrine
              </label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ex: Liquidação de Carnaval"
                className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 placeholder-slate-400 focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                URL do Banner (Opcional)
              </label>
              <div className="flex relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="url" 
                  value={formData.banner_url}
                  onChange={e => setFormData({...formData, banner_url: e.target.value})}
                  placeholder="https://..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-slate-200 rounded-xl placeholder-slate-400 focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Block 2: Logic Rule */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            2. Que produtos devem aparecer?
          </h2>
          
          <div className="grid sm:grid-cols-2 gap-4">
            {rules.map((rule) => {
              const Icon = rule.icon;
              const isActive = formData.rule_type === rule.id;
              
              return (
                <label 
                  key={rule.id}
                  className={`
                    relative flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all
                    ${isActive 
                      ? 'border-[var(--color-primary-base)] bg-[var(--color-primary-base)]/5 dark:bg-[var(--color-primary-base)]/10' 
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'}
                  `}
                >
                  <input 
                    type="radio" 
                    name="rule_type" 
                    value={rule.id}
                    checked={isActive}
                    onChange={(e) => setFormData({...formData, rule_type: e.target.value})}
                    className="sr-only"
                  />
                  <div className={`p-2 rounded-xl shrink-0 ${isActive ? 'bg-[var(--color-primary-base)] text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-bold text-sm ${isActive ? 'text-[var(--color-primary-base)]' : 'text-slate-900 dark:text-white'}`}>
                      {rule.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {rule.desc}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          {formData.rule_type === 'CATEGORY' && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl mt-4 dark:bg-indigo-900/10 dark:border-indigo-800/30">
              <label className="text-sm font-semibold text-indigo-900 dark:text-indigo-400 block mb-2">ID da Categoria</label>
              <input 
                type="number" 
                value={formData.reference_id}
                onChange={e => setFormData({...formData, reference_id: e.target.value})}
                placeholder="Ex: 5"
                className="w-full max-w-xs bg-white border-slate-200 rounded-xl px-4 py-2 placeholder-slate-400 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
              />
            </div>
          )}

          {formData.rule_type === 'MANUAL' && (
            <div className="mt-8 border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Selecionar Produtos</h3>
              <div className="flex gap-2 relative">
                 <input 
                   type="text" 
                   value={searchQ}
                   onChange={e => setSearchQ(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchProducts())}
                   placeholder="Buscar produto por nome..."
                   className="flex-1 bg-slate-50 border-slate-200 rounded-xl px-4 py-2 placeholder-slate-400 focus:ring-[var(--color-primary-base)] focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                 />
                 <button type="button" onClick={searchProducts} className="bg-slate-200 text-slate-600 px-4 py-2 rounded-xl hover:bg-slate-300 dark:bg-slate-800 dark:text-white">
                   <Search className="w-5 h-5" />
                 </button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="bg-white border text-sm border-slate-200 rounded-xl p-2 max-h-48 overflow-y-auto w-full dark:bg-slate-800/50 dark:border-slate-700">
                  {searchResults.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                       <span className="truncate text-slate-700 dark:text-slate-300">{p.name} - R${p.price}</span>
                       <button type="button" onClick={() => addManualProduct(p)} className="p-1 text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-md">
                         <Plus className="w-4 h-4" />
                       </button>
                    </div>
                  ))}
                </div>
              )}

              {manualProducts.length > 0 && (
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                  <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider dark:bg-slate-800 dark:border-slate-700">
                    Itens Selecionados ({manualProducts.length})
                  </div>
                  <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                    {manualProducts.map((p, idx) => (
                      <li key={p.id} className="p-3 flex items-center justify-between group">
                         <div className="flex items-center gap-3 overflow-hidden">
                           <div className="cursor-grab text-slate-400 hover:text-slate-600">
                             <GripVertical className="w-4 h-4" />
                           </div>
                           <span className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-800 text-xs flex items-center justify-center font-medium">
                             {idx + 1}
                           </span>
                           <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{p.name}</span>
                         </div>
                         <button type="button" onClick={() => removeManualProduct(p.id)} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-rose-50 rounded-md dark:hover:bg-rose-500/10">
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-center text-slate-400 p-2">Os itens aparecerão na vitrine exatamente nesta ordem.</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Block 3: Sorting Options */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            3. Como organizar internamente?
          </h2>
          <div className="max-w-xs">
            <select 
              value={formData.sort_by}
              onChange={e => setFormData({...formData, sort_by: e.target.value})}
              disabled={formData.rule_type === 'MANUAL'}
              className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white disabled:opacity-50"
            >
              <option value="MANUAL">Posição Manual</option>
              <option value="ALPHA_ASC">Alfabética (A-Z)</option>
              <option value="ALPHA_DESC">Alfabética (Z-A)</option>
              <option value="PRICE_ASC">Menor Preço</option>
              <option value="PRICE_DESC">Maior Preço</option>
              <option value="SALES_DESC">Mais Vendidos / Maior Estoque</option>
            </select>
            <p className="text-xs text-slate-500 mt-2">
              Válido principalmente para regras Automáticas ou Categorias.
            </p>
          </div>
        </section>

        {/* Block 4: Placement */}
        <section className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            4. Posição no Site
          </h2>
          
          <div className="flex flex-col sm:flex-row gap-8">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={formData.display_on_home}
                onChange={e => setFormData({...formData, display_on_home: e.target.checked})}
                className="w-5 h-5 text-[var(--color-primary-base)] rounded-md border-slate-300 focus:ring-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-700"
              />
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-900 dark:text-white">Ativar na Página Principal</span>
                <span className="text-xs text-slate-500">Exibirá o carrossel no topo da `/store`. (Mín: 0, Máx: 3)</span>
              </div>
            </label>

            <div className="flex-1 max-w-[200px]">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                Ordem de Exibição
              </label>
              <select 
                value={formData.display_order}
                onChange={e => setFormData({...formData, display_order: Number(e.target.value)})}
                className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white font-medium"
              >
                <option value={1}>1. Primeiro Slider</option>
                <option value={2}>2. Segundo Slider</option>
                <option value={3}>3. Terceiro Slider</option>
              </select>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3 pt-6">
          <Link
            href="/marketing/showcases"
            className="px-6 py-3 rounded-xl font-medium text-slate-700 hover:bg-slate-100 transition-colors dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Mudei de ideia
          </Link>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-8 py-3 rounded-xl font-bold transition-all shadow-sm shadow-[var(--color-primary-base)]/20 disabled:opacity-50"
          >
             {isSubmitting ? 'Salvando...' : <><Save className="w-5 h-5" /> Salvar Alterações</>}
          </button>
        </div>
      </form>
      </>
      )}
    </div>
  );
}
