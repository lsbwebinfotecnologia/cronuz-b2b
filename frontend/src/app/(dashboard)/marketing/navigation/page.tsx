'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Plus, GripVertical, Trash2, Save, LayoutList, Check, Tag } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

type NavItem = {
    id?: number;
    external_id: string;
    label: string;
    item_type: 'CATEGORY' | 'BRAND';
    position: number;
    is_active: boolean;
};

export default function NavigationBuilderPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [companyId, setCompanyId] = useState<number | null>(null);
    const [items, setItems] = useState<NavItem[]>([]);

    // Adição Manual
    const [newItemType, setNewItemType] = useState<'CATEGORY'|'BRAND'>('CATEGORY');
    const [newExternalId, setNewExternalId] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    const [availableOptions, setAvailableOptions] = useState<{categories: any[], brands: any[]}>({categories: [], brands: []});
    const [loadingAvailable, setLoadingAvailable] = useState(false);

    useEffect(() => {
        const user = getUser();
        if (user?.company_id) {
            setCompanyId(user.company_id);
            fetchNavItems();
            fetchAvailable();
        } else {
            setLoading(false);
        }
    }, []);

    const fetchNavItems = async () => {
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing-navigation`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (e) {
            console.error("Failed to load navigation items", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailable = async () => {
        setLoadingAvailable(true);
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing-navigation/available`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableOptions(data);
            }
        } catch (e) {
            console.error("Failed to load available catalog", e);
        } finally {
            setLoadingAvailable(false);
        }
    };

    const handleAddItem = async () => {
        if (!newLabel || !newExternalId) {
            toast.error("O Nome e o Código são obrigatórios.");
            return;
        }

        setSaving(true);
        try {
            const token = getToken();
            const payload = {
                item_type: newItemType,
                label: newLabel,
                external_id: newExternalId,
                position: items.length + 1,
                is_active: true
            };

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing-navigation`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Erro ao adicionar item');
            }

            const addedItem = await res.json();
            setItems([...items, addedItem]);
            setNewLabel('');
            setNewExternalId('');
            toast.success("Item adicionado ao menu!");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Deseja realmente remover este item do menu?')) return;
        
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing-navigation/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                setItems(items.filter(i => i.id !== id));
                toast.success("Item removido");
            }
        } catch (e) {
            toast.error("Erro ao remover item");
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!companyId) {
        return <div className="p-8 text-center text-slate-500">Acesso restrito a empresas.</div>;
    }

    const categories = items.filter(i => i.item_type === 'CATEGORY');
    const brands = items.filter(i => i.item_type === 'BRAND');

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-24">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <LayoutList className="w-6 h-6 text-indigo-500" />
                    Menu de Navegação da Loja
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    Crie manualmente as opções que aparecerão nos departamentos da sua loja B2B. 
                    Informe o ID da categoria/editora exatamente como é listado em seu ERP para que o filtro funcione adequadamente.
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-emerald-500" /> Adicionar Novo Item (Buscando {newItemType === 'CATEGORY' ? 'Categorias' : 'Marcas'})
                        {loadingAvailable && <Loader2 className="w-4 h-4 animate-spin text-indigo-500 ml-2" />}
                    </h3>
                </div>
                <div className="p-6">
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                        <div className="w-full md:w-1/3">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Tipo de Link</label>
                            <select 
                                value={newItemType}
                                onChange={(e) => {
                                    setNewItemType(e.target.value as any);
                                    setNewExternalId('');
                                    setNewLabel('');
                                    setSearchTerm('');
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-200"
                            >
                                <option value="CATEGORY">Categoria (Gênero)</option>
                                <option value="BRAND">Marca (Editora)</option>
                            </select>
                        </div>
                        <div className="w-full md:w-2/3 relative">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Buscar no Acervo Horus/Cronuz</label>
                            <input 
                                type="text"
                                placeholder="Digite para buscar..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setShowDropdown(true);
                                }}
                                onFocus={() => setShowDropdown(true)}
                                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-bold text-indigo-700 dark:text-indigo-400 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                            />
                            {showDropdown && (
                                <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg max-h-60 overflow-auto">
                                    {(() => {
                                        const opts = newItemType === 'CATEGORY' ? availableOptions.categories : availableOptions.brands;
                                        const filteredOpts = opts.filter((o: any) => o.name.toLowerCase().includes(searchTerm.toLowerCase()));
                                        
                                        if (filteredOpts.length === 0) {
                                            return <li className="p-3 text-sm text-slate-500 text-center">Nenhum resultado...</li>;
                                        }

                                        return filteredOpts.map((opt: any, idx: number) => (
                                            <li 
                                                key={`${opt.id}-${idx}`}
                                                className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 last:border-0"
                                                onMouseDown={() => {
                                                    setNewExternalId(String(opt.id));
                                                    setNewLabel(opt.name);
                                                    setSearchTerm(opt.name);
                                                    setShowDropdown(false);
                                                }}
                                            >
                                                {opt.name} <span className="text-[10px] text-slate-400 ml-2 font-mono bg-slate-100 dark:bg-slate-950 px-1 py-0.5 rounded">ID: {opt.id}</span>
                                            </li>
                                        ));
                                    })()}
                                </ul>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 dark:bg-slate-800/20 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                        <div className="w-full md:w-1/2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Nome Personalizado (Pode Editar!)</label>
                            <input 
                                type="text"
                                placeholder="Nome para o menu"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-200"
                            />
                        </div>
                        <div className="w-full md:w-1/4">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">Cód. Sistema</label>
                            <input 
                                type="text"
                                value={newExternalId}
                                readOnly
                                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono rounded-xl px-4 py-3 outline-none text-slate-500 cursor-not-allowed"
                            />
                        </div>
                        <div className="w-full md:w-auto mt-2 md:mt-0">
                            <button 
                                onClick={() => {
                                    handleAddItem().then(() => {
                                        setSearchTerm(''); // Clear combobox after adding
                                    });
                                }}
                                disabled={saving}
                                className="w-full md:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4" />} Incluir no Menu
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Categorias Mapped */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2 mb-6">
                        <Tag className="w-5 h-5 text-indigo-500" /> Categorias Registradas
                    </h3>
                    
                    {categories.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400 text-sm">
                            Nenhuma categoria mapeada.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {categories.map((cat) => (
                                <div key={cat.id} className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl group">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{cat.label}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded">ID: {cat.external_id}</span>
                                            {cat.is_active && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase flex items-center gap-1"><Check className="w-3 h-3"/> Ativo</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(cat.id!)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Marcas Mapped */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2 mb-6">
                        <LayoutList className="w-5 h-5 text-blue-500" /> Marcas/Editoras Registradas
                    </h3>
                    
                    {brands.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400 text-sm">
                            Nenhuma editora mapeada.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {brands.map((brand) => (
                                <div key={brand.id} className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 p-4 rounded-2xl group">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{brand.label}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded">ID: {brand.external_id}</span>
                                            {brand.is_active && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase flex items-center gap-1"><Check className="w-3 h-3"/> Ativo</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(brand.id!)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
