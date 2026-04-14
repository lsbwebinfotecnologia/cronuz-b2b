'use client';

import React, { useState, useEffect, Fragment } from 'react';
import { Tag, Plus, CheckCircle, Trash2, Edit3, X, ArrowUpCircle, ArrowDownCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function CashflowCategoriesPage() {
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [formData, setFormData] = useState({ id: 0, name: '', type: 'PAYABLE', dre_group: '', active: true, is_system: false, parent_id: 0 as number | null });

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setCategories(await res.json());
        } catch (e) {
            toast.error("Erro ao puxar categorias");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let res;
            if (formData.id) {
                res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories/${formData.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                    body: JSON.stringify({ name: formData.name, active: formData.active, dre_group: formData.dre_group || null, parent_id: formData.parent_id || null })
                });
            } else {
                res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                    body: JSON.stringify({ name: formData.name, type: formData.type, active: formData.active, dre_group: formData.dre_group || null, parent_id: formData.parent_id || null })
                });
            }
            
            if (res.ok) {
                toast.success(formData.id ? "Categoria atualizada!" : "Categoria criada!");
                setIsEditModalOpen(false);
                fetchCategories();
            } else {
                const data = await res.json();
                toast.error(data.detail || "Erro ao salvar");
            }
        } catch(e) {
            toast.error("Servidor indisponível");
        }
    };

    const openEdit = (cat?: any) => {
        if (cat) {
            setFormData({ id: cat.id, name: cat.name, type: cat.type, dre_group: cat.dre_group || '', active: cat.active, is_system: cat.is_system, parent_id: cat.parent_id || 0 });
        } else {
            setFormData({ id: 0, name: '', type: 'PAYABLE', dre_group: '', active: true, is_system: false, parent_id: 0 });
        }
        setIsEditModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        if(!confirm("Atenção: Deletar esta categoria irá apaga-la permanentemente. Continuar?")) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories/${id}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success("Categoria removida");
                fetchCategories();
            } else {
                const js = await res.json();
                toast.error(js.detail || "Não foi possível excluir");
            }
        } catch(e) { toast.error("Erro de conexão"); }
    };

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <Link href="/financial" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 dark:text-slate-400 dark:hover:text-white font-medium mb-2">
                <ArrowLeft className="w-4 h-4"/> Voltar para Finanças
            </Link>

            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Tag className="h-8 w-8 text-[var(--color-primary-base)] dark:text-indigo-400" />
                        Plano de Contas
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
                        Estruture o seu plano macro: defina as categorias globais para suas Receitas e Despesas.
                    </p>
                </div>
                
                <button onClick={() => openEdit()} className="px-5 py-2.5 bg-[var(--color-primary-base)] text-white rounded-xl font-semibold hover:opacity-90 shadow-sm transition flex items-center gap-2 text-sm justify-center">
                    <Plus className="w-4 h-4"/> Adicionar Categoria
                </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-400">
                            <tr>
                                <th className="px-6 py-4 font-semibold w-12">Natureza</th>
                                <th className="px-6 py-4 font-semibold">Nome da Categoria</th>
                                <th className="px-6 py-4 font-semibold text-center">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary-base)] mx-auto"></div></td></tr>
                            ) : categories.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-12 text-slate-500">Nenhuma categoria criada no plano de contas.</td></tr>
                            ) : (
                                categories.filter(c => !c.parent_id).map(rootCat => (
                                    <Fragment key={rootCat.id}>
                                        <tr className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                            <td className="px-6 py-4">
                                                {rootCat.type === 'RECEIVABLE' ? 
                                                    <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded w-fit text-xs dark:bg-emerald-950/30">
                                                        <ArrowUpCircle className="w-4 h-4" /> Receita
                                                    </div> : 
                                                    <div className="flex items-center gap-2 text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded w-fit text-xs dark:bg-rose-950/30">
                                                        <ArrowDownCircle className="w-4 h-4" /> Despesa
                                                    </div>
                                                }
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                                {rootCat.name}
                                                {rootCat.is_system && <span className="ml-3 text-[10px] uppercase font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full dark:bg-slate-800">Sistema</span>}
                                                <div className="text-[10px] text-slate-400 font-mono mt-1 w-fit bg-slate-50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded font-normal">
                                                    DRE: {rootCat.dre_group ? rootCat.dre_group : 'Não Classificado'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {rootCat.active ? (
                                                    <span className="px-2.5 py-1 text-xs font-bold rounded bg-emerald-100 text-emerald-700">Ativo</span>
                                                ) : (
                                                    <span className="px-2.5 py-1 text-xs font-bold rounded bg-slate-200 text-slate-500">Inativo</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button onClick={()=>openEdit(rootCat)} className="text-slate-400 hover:text-[var(--color-primary-base)] p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                                                    <Edit3 className="w-5 h-5"/>
                                                </button>
                                                {!rootCat.is_system && (
                                                    <button onClick={()=>handleDelete(rootCat.id)} className="text-slate-400 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 transition">
                                                        <Trash2 className="w-5 h-5"/>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {categories.filter(sub => sub.parent_id === rootCat.id).map(subCat => (
                                            <tr key={subCat.id} className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/10 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                                <td className="px-6 py-3"></td>
                                                <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                    <div className="w-4 h-4 border-l-2 border-b-2 border-slate-300 dark:border-slate-600 rounded-bl-lg -mt-3 ml-2"></div>
                                                    {subCat.name}
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    {subCat.active ? (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-700">Ativo</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-200 text-slate-500">Inativo</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-right flex justify-end gap-1">
                                                    <button onClick={()=>openEdit(subCat)} className="text-slate-400 hover:text-[var(--color-primary-base)] p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition scale-90">
                                                        <Edit3 className="w-4 h-4"/>
                                                    </button>
                                                    <button onClick={()=>handleDelete(subCat.id)} className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 transition scale-90">
                                                        <Trash2 className="w-4 h-4"/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* EDIT CATEGORY MODAL */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-md w-full flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Tag className="w-5 h-5 text-[var(--color-primary-base)]"/> 
                                {formData.id ? 'Editar Categoria' : 'Nova Categoria'}
                            </h2>
                            <button onClick={()=>setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="p-6">
                           <form id="cat-form" onSubmit={handleSave} className="space-y-4">
                                {formData.is_system && (
                                    <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-xs font-medium border border-amber-200 mb-4">
                                        Esta é uma categoria base do sistema. Você só pode alterar o seu nome ou bloqueá-la (estado).
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome para Faturamento/Despesa</label>
                                    <input required value={formData.name} onChange={(e)=>setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm focus:ring-2 focus:ring-[var(--color-primary-base)]/20" placeholder="Ex: Conta de Energia"/>
                                </div>
                                {!formData.id && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Natureza da Conta</label>
                                        <select required value={formData.type} onChange={(e)=>setFormData({...formData, type: e.target.value, parent_id: 0})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-medium">
                                            <option value="PAYABLE">Contas A Pagar (Despesa)</option>
                                            <option value="RECEIVABLE">Contas A Receber (Receita)</option>
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Pertence à qual Categoria Principal?</label>
                                    <select value={formData.parent_id || 0} onChange={(e)=>setFormData({...formData, parent_id: Number(e.target.value) || null})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-medium">
                                        <option value={0}>Nenhuma (Esta é uma Categoria Macro)</option>
                                        {categories.filter(c => c.type === formData.type && !c.parent_id && c.id !== formData.id).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">Ao selecionar uma categoria, ela vira uma subcategoria.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Grupo do DRE</label>
                                    <select value={formData.dre_group} onChange={(e)=>setFormData({...formData, dre_group: e.target.value})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-medium text-slate-500">
                                        <option value="">Nenhum (Não Classificado)</option>
                                        <option value="1_Receita_Bruta">1 - Receita Bruta</option>
                                        <option value="2_Deducoes_Tributos">2 - Deduções / Tributos</option>
                                        <option value="3_Custo_Variavel">3 - Custo Variável (CPV)</option>
                                        <option value="4_Despesa_Fixa_Operacional">4 - Despesa Fixa / Operacional</option>
                                        <option value="5_Despesa_Nao_Operacional">5 - Despesa Não Operacional</option>
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">Isso determinará a posição desta categoria no Relatório DRE.</p>
                                </div>

                                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <input type="checkbox" id="cat-active" checked={formData.active} onChange={(e)=>setFormData({...formData, active: e.target.checked})} className="w-5 h-5 rounded border-slate-300 text-[var(--color-primary-base)]"/>
                                    <label htmlFor="cat-active" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">Manter categoria ativada</label>
                                </div>
                           </form>
                        </div>
                        
                        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-3xl">
                            <button type="button" onClick={()=>setIsEditModalOpen(false)} className="px-5 py-2 font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition dark:text-slate-300 dark:hover:bg-slate-800">
                                Cancelar
                            </button>
                            <button type="submit" form="cat-form" className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-sm transition">
                                Salvar Categoria
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
