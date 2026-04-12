'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, CheckCircle, X, Shield, Percent, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';

export default function CommercialPoliciesPage() {
    const [policies, setPolicies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<any>(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: '',
        description: '',
        discount_sale_percent: 0,
        discount_consignment_percent: 0,
        max_installments: 1,
        min_installment_value: 50,
        is_active: true
    });

    useEffect(() => {
        fetchPolicies();
    }, []);

    const fetchPolicies = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/commercial-policies`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPolicies(data);
            }
        } catch (e) {
            toast.error("Erro ao carregar políticas comerciais.");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (policy: any = null) => {
        if (policy) {
            setEditingPolicy(policy.id);
            setForm({
                name: policy.name,
                description: policy.description || '',
                discount_sale_percent: policy.discount_sale_percent,
                discount_consignment_percent: policy.discount_consignment_percent,
                max_installments: policy.max_installments,
                min_installment_value: policy.min_installment_value,
                is_active: policy.is_active
            });
        } else {
            setEditingPolicy(null);
            setForm({
                name: '',
                description: '',
                discount_sale_percent: 0,
                discount_consignment_percent: 0,
                max_installments: 1,
                min_installment_value: 50,
                is_active: true
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.name) return toast.error("Preencha o nome da política.");
        setSaving(true);
        try {
            const method = editingPolicy ? 'PATCH' : 'POST';
            const url = editingPolicy 
                ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/commercial-policies/${editingPolicy}`
                : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/commercial-policies`;
            
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(form)
            });

            if (res.ok) {
                toast.success(`Política ${editingPolicy ? 'atualizada' : 'criada'} com sucesso!`);
                setIsModalOpen(false);
                fetchPolicies();
            } else {
                toast.error("Erro ao salvar política.");
            }
        } catch (e) {
            toast.error("Erro interno.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Tem certeza que deseja remover esta política? Clientes com ela atrelada podem ficar sem desconto.")) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/commercial-policies/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success("Política deletada.");
                fetchPolicies();
            } else {
                toast.error("Você não tem acesso para deletar ou a política não existe.");
            }
        } catch (e) {
            toast.error("Erro interno.");
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Shield className="h-8 w-8 text-[var(--color-primary-base)] dark:text-indigo-400" />
                        Políticas Comerciais
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
                        Defina margens de segurança, limites de desconto e faturamento por categoria de cliente nativo.
                    </p>
                </div>
                <button 
                    onClick={() => handleOpenModal()} 
                    className="bg-[var(--color-primary-base)] text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-sm dark:bg-indigo-600 dark:hover:bg-indigo-700"
                >
                    <Plus className="h-4 w-4"/>
                    Nova Política
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary-base)] mx-auto"></div></div>
            ) : policies.length === 0 ? (
                <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl shadow-sm dark:bg-slate-900 dark:border-slate-800">
                    <Shield className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-slate-900 dark:text-white">Nenhuma política cadastrada</h3>
                    <p className="text-slate-500 mt-2 mb-6 dark:text-slate-400">Crie regras automatizadas de precificação para seus vendedores.</p>
                    <button onClick={() => handleOpenModal()} className="text-[var(--color-primary-base)] font-medium">Cadastrar primeira política</button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {policies.map(p => (
                        <motion.div key={p.id} initial={{opacity:0, y:10}} animate={{opacity:1,y:0}} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm dark:bg-slate-900 dark:border-slate-800 hover:border-slate-300 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-bold text-slate-900 text-lg dark:text-white truncate" title={p.name}>{p.name}</h3>
                                <div className="flex gap-1">
                                    <button onClick={() => handleOpenModal(p)} className="p-1.5 text-slate-400 hover:text-[var(--color-primary-base)] transition-colors"><Edit2 className="w-4 h-4"/></button>
                                    <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4"/></button>
                                </div>
                            </div>
                            
                            <p className="text-sm text-slate-500 line-clamp-2 h-10 mb-4 dark:text-slate-400">{p.description || 'Sem descrição'}</p>
                            
                            <div className="space-y-3 mb-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium dark:text-slate-400">Desconto p/ Venda</span>
                                    <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-500/10 dark:text-emerald-400">{p.discount_sale_percent}%</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium dark:text-slate-400">Desconto p/ Consig.</span>
                                    <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full dark:bg-amber-500/10 dark:text-amber-400">{p.discount_consignment_percent}%</span>
                                </div>
                                <hr className="border-slate-100 dark:border-slate-800"/>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium dark:text-slate-400">Parcelamento Máx.</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{p.max_installments}x</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <motion.div initial={{scale:0.95, opacity:0}} animate={{scale:1, opacity:1}} className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                                <Percent className="h-5 w-5 text-[var(--color-primary-base)] dark:text-indigo-400"/>
                                {editingPolicy ? 'Editar Política' : 'Nova Política'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"><X className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Nome da Regra</label>
                                <input type="text" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-[var(--color-primary-base)] outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white" placeholder="Ex: Distribuidores Ouro"/>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">Descrição Opcional</label>
                                <textarea value={form.description} onChange={e=>setForm({...form, description: e.target.value})} rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white" placeholder="Para que serve essa regra..."/>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800/30">
                                    <label className="block text-xs font-semibold text-emerald-700 mb-2 dark:text-emerald-400 uppercase tracking-wide">Desconto: Venda</label>
                                    <CurrencyInput suffixStr="%" value={form.discount_sale_percent} onChangeValue={v => setForm({...form, discount_sale_percent: v})} className="w-full bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm outline-none dark:bg-slate-950 dark:border-emerald-800 dark:text-white"/>
                                </div>
                                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 dark:bg-amber-900/10 dark:border-amber-800/30">
                                    <label className="block text-xs font-semibold text-amber-700 mb-2 dark:text-amber-400 uppercase tracking-wide">Desconto: Consig.</label>
                                    <CurrencyInput suffixStr="%" value={form.discount_consignment_percent} onChangeValue={v => setForm({...form, discount_consignment_percent: v})} className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm outline-none dark:bg-slate-950 dark:border-amber-800 dark:text-white"/>
                                </div>
                            </div>
                            
                            <div>
                                 <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-slate-400"/> Regras de Faturamento</h4>
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                        <label className="block text-xs text-slate-500 mb-1 dark:text-slate-400">Parcelas Máx.</label>
                                        <input type="number" min="1" max="120" value={form.max_installments} onChange={e=>setForm({...form, max_installments: parseInt(e.target.value)||1})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                                     </div>
                                     <div>
                                        <label className="block text-xs text-slate-500 mb-1 dark:text-slate-400">Vlr. Mínimo da Parcela</label>
                                        <CurrencyInput prefixStr="R$ " value={form.min_installment_value} onChangeValue={v => setForm({...form, min_installment_value: v})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white"/>
                                     </div>
                                 </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 dark:bg-slate-900/50 dark:border-slate-800">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">Cancelar</button>
                            <button onClick={handleSave} disabled={saving} className="bg-[var(--color-primary-base)] text-white px-6 py-2 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                                {saving ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                                {saving ? 'Salvando...' : 'Salvar Política'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
