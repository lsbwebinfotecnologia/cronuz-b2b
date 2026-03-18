'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save, Loader2, Percent, Target, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';

export default function NewPromotionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [prom, setProm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    discount_type: 'PERCENTAGE',
    discount_value: 0
  });

  const [targets, setTargets] = useState<any[]>([]);

  useEffect(() => {
    const fetchSupport = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${getToken()}` };
        const [catRes, brandRes, prodRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/categories`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/brands`, { headers }),
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/?limit=1000`, { headers })
        ]);
        if (catRes.ok) setCategories(await catRes.json());
        if (brandRes.ok) setBrands(await brandRes.json());
        if (prodRes.ok) setProducts((await prodRes.json()).items);
      } catch (e) {
        toast.error('Erro ao listar alvos.');
      }
    };
    fetchSupport();
  }, []);

  const handleChange = (e: any) => {
    const { name, value, type } = e.target;
    setProm(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const currentDateTimeTargetLocal = () => {
     // A helper to format HTML5 datetime-local
     const now = new Date();
     now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
     return now.toISOString().slice(0,16);
  };

  const addTargetRow = () => {
    setTargets([...targets, { target_type: 'CATEGORY', target_id: '' }]);
  };

  const updateTargetRow = (index: number, field: string, value: string) => {
    const newTargets = [...targets];
    newTargets[index][field] = value;
    if (field === 'target_type') newTargets[index].target_id = ''; // reset selection
    setTargets(newTargets);
  };

  const removeTargetRow = (index: number) => {
    setTargets(targets.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!prom.name || !prom.start_date || !prom.end_date || prom.discount_value <= 0) {
      return toast.error("Preencha todos os campos corretamente.");
    }
    if (targets.length === 0) {
      return toast.error("Adicione pelo menos um alvo para a promoção.");
    }
    for (const t of targets) {
        if (!t.target_id) return toast.error("Selecione os registros para todos os alvos.");
    }

    setLoading(true);
    try {
      const formattedTargets = targets.map(t => ({
          target_type: t.target_type,
          category_id: t.target_type === 'CATEGORY' ? Number(t.target_id) : undefined,
          brand_id: t.target_type === 'BRAND' ? Number(t.target_id) : undefined,
          product_id: t.target_type === 'PRODUCT' ? Number(t.target_id) : undefined,
      }));

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/promotions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          ...prom,
          status: 'ACTIVE', // API naturally schedules if date logic dictates
          start_date: new Date(prom.start_date).toISOString(),
          end_date: new Date(prom.end_date).toISOString(),
          targets: formattedTargets
        })
      });

      if (res.ok) {
        toast.success("Promoção habilitada!");
        router.push('/promotions');
      } else {
        const err = await res.json();
        toast.error(err.detail || "Erro ao criar regra.");
      }
    } catch (e) {
      toast.error('Erro de requisição.');
    } finally {
      setLoading(false);
    }
  };

  const getOptionsForTargetType = (type: string) => {
      switch(type) {
          case 'CATEGORY': return categories.map(c => ({ value: c.id, label: c.name }));
          case 'BRAND': return brands.map(b => ({ value: b.id, label: b.name }));
          case 'PRODUCT': return products.map(p => ({ value: p.id, label: `[${p.sku}] ${p.name}` }));
          default: return [];
      }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex items-center justify-between gap-5 sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur pb-4 pt-2 -mx-4 px-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/promotions"
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Percent className="h-6 w-6 text-[var(--color-primary-base)]" />
              Nova Regra Promocional
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Definir motor de desconto e alvos de aplicação</p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Ligar Regra
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <motion.div initial={{opacity: 0, x: -20}} animate={{opacity: 1, x: 0}} className="space-y-6">
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 space-y-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
                1. Configuração da Regra
              </h3>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nome de Identificação Interna <span className="text-rose-500">*</span></label>
                  <input type="text" name="name" value={prom.name} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white" placeholder="Ex: Black Friday Tênis" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Descrição Pública (Opcional)</label>
                  <textarea name="description" value={prom.description} onChange={handleChange} rows={2} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white" placeholder="Aparecerá para o cliente..."></textarea>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Data Início <span className="text-rose-500">*</span></label>
                      <input type="datetime-local" min={currentDateTimeTargetLocal()} name="start_date" value={prom.start_date} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Data Fim <span className="text-rose-500">*</span></label>
                      <input type="datetime-local" min={prom.start_date || currentDateTimeTargetLocal()} name="end_date" value={prom.end_date} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo de Desconto</label>
                      <select name="discount_type" value={prom.discount_type} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white">
                          <option value="PERCENTAGE">Porcentagem (%)</option>
                          <option value="FIXED_AMOUNT">Valor Fixo (R$)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Quantia <span className="text-rose-500">*</span></label>
                      <CurrencyInput 
                        prefixStr={prom.discount_type === 'FIXED_AMOUNT' ? 'R$ ' : ''}
                        suffixStr={prom.discount_type === 'PERCENTAGE' ? '%' : ''}
                        value={prom.discount_value} 
                        onChangeValue={(val) => setProm(p => ({...p, discount_value: val}))} 
                        className="w-full bg-[var(--color-primary-base)]/10 border border-[var(--color-primary-base)]/30 text-[var(--color-primary-base)] font-bold text-lg rounded-xl p-2.5 dark:bg-[var(--color-primary-base)]/20 dark:border-[var(--color-primary-base)]/50" 
                      />
                    </div>
                </div>
              </div>
            </div>
         </motion.div>

         <motion.div initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} className="space-y-6">
             <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                   2. Alvos da Promoção
                 </h3>
                 <button onClick={addTargetRow} className="text-xs font-semibold px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 flex items-center gap-1">
                   <Plus className="w-3.5 h-3.5" /> Adicionar
                 </button>
               </div>

               {targets.length === 0 ? (
                 <div className="text-center py-12 px-6 bg-slate-50 border border-slate-200 border-dashed rounded-2xl dark:bg-slate-950 dark:border-slate-800">
                    <Target className="w-10 h-10 text-slate-300 mx-auto mb-3 dark:text-slate-700" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nenhum alvo selecionado.</p>
                    <p className="text-xs text-slate-500 mt-1 dark:text-slate-500">Adicione categorias, marcas ou produtos específicos.</p>
                 </div>
               ) : (
                  <div className="space-y-4">
                    <AnimatePresence>
                      {targets.map((t, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                          key={idx} 
                          className="flex items-start gap-3 p-4 border border-slate-200 bg-slate-50 rounded-2xl dark:bg-slate-950 dark:border-slate-800"
                        >
                            <div className="flex-1 space-y-3">
                              <select 
                                value={t.target_type} 
                                onChange={(e) => updateTargetRow(idx, 'target_type', e.target.value)} 
                                className="w-full text-xs font-semibold uppercase tracking-wider bg-white border border-slate-200 text-slate-700 rounded-lg p-2 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                              >
                                <option value="CATEGORY">Categoria Completa</option>
                                <option value="BRAND">Marca Inteira</option>
                                <option value="PRODUCT">Produto Específico</option>
                              </select>
                              
                              <select 
                                value={t.target_id} 
                                onChange={(e) => updateTargetRow(idx, 'target_id', e.target.value)} 
                                className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-lg p-2.5 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              >
                                <option value="">-- Selecione o Registro --</option>
                                {getOptionsForTargetType(t.target_type).map((opt: any) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <button onClick={() => removeTargetRow(idx)} className="mt-1 p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors dark:hover:bg-rose-500/10">
                              <Trash2 className="w-4 h-4" />
                            </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
               )}
            </div>
         </motion.div>
      </div>

    </div>
  );
}
