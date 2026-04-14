'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LC116_CODES } from '@/lib/lc116';
import { Briefcase, Save, ArrowLeft, Settings2, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function CreateServicePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'GENERAL' | 'FISCAL'>('GENERAL');
    const [categories, setCategories] = useState<any[]>([]);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [newCategoryForm, setNewCategoryForm] = useState({ name: '', type: 'RECEIVABLE', dre_group: '', active: true });
    
    const [formData, setFormData] = useState({
        name: '',
        base_value: '0,00',
        default_description: '',
        category_id: '',
        codigo_lc116: '',
        cnae: '',
        aliquota_iss: '',
        reter_iss: false,
        reter_inss: false,
        reter_ir: false,
        reter_pis: false,
        reter_cofins: false,
        reter_csll: false
    });

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setCategories(data.filter((c: any) => c.type === 'RECEIVABLE'));
                }
            } catch (e) {}
        };
        fetchCategories();
    }, []);

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ name: newCategoryForm.name, type: newCategoryForm.type, dre_group: newCategoryForm.dre_group || null, active: newCategoryForm.active })
            });
            if (res.ok) {
                const newCat = await res.json();
                setCategories([...categories, newCat]);
                setFormData({...formData, category_id: newCat.id});
                setIsCategoryModalOpen(false);
                setNewCategoryForm({ name: '', type: 'RECEIVABLE', dre_group: '', active: true });
                toast.success('Categoria criada com sucesso!');
            } else {
                toast.error('Erro ao criar categoria.');
            }
        } catch (e) {
            toast.error('Ocorreu um erro no servidor.');
        }
    };

    const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, '');
        if (!value) {
            setFormData({...formData, base_value: ''});
            return;
        }
        const floatValue = parseInt(value, 10) / 100;
        setFormData({...formData, base_value: floatValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })});
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                base_value: parseFloat(formData.base_value.replace(/\./g, '').replace(',', '.') || '0'),
                aliquota_iss: formData.aliquota_iss ? parseFloat(formData.aliquota_iss.replace(',', '.')) : null,
                category_id: formData.category_id ? parseInt(formData.category_id) : null
            };

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/services`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success('Serviço criado com sucesso!');
                router.push('/services');
            } else {
                const js = await res.json();
                toast.error(js.detail || 'Erro ao criar serviço');
            }
        } catch (e) {
            toast.error('Ocorreu um erro no servidor.');
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/services" className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        Criar Novo Serviço
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                        Preencha as informações do serviço e as regras de impostos.
                    </p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
                
                {/* BOOTSTRAP-LIKE NAV TABS WITH TAILWIND */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-4 gap-6 bg-slate-50/50 dark:bg-slate-900/50">
                    <button 
                        onClick={() => setActiveTab('GENERAL')}
                        className={`pb-4 flex items-center gap-2 text-sm font-bold border-b-2 transition-all ${
                            activeTab === 'GENERAL' 
                                ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]' 
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                        }`}
                    >
                        <Settings2 className="w-4 h-4"/> Dados Gerais
                    </button>
                    <button 
                        onClick={() => setActiveTab('FISCAL')}
                        className={`pb-4 flex items-center gap-2 text-sm font-bold border-b-2 transition-all ${
                            activeTab === 'FISCAL' 
                                ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]' 
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                        }`}
                    >
                        <ReceiptText className="w-4 h-4"/> Configuração Fiscal (NFS-e)
                    </button>
                </div>

                <form id="service-form" onSubmit={handleSave} className="p-6 md:p-8 flex-1">
                    {/* TAB CONTENT: GENERAL */}
                    {activeTab === 'GENERAL' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nome do Serviço <span className="text-rose-500">*</span></label>
                                    <input 
                                        required 
                                        type="text" 
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:text-slate-200 transition-colors shadow-sm"
                                        placeholder="Ex: Consultoria Técnica"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Valor Base (Preço Padrão) <span className="text-rose-500">*</span></label>
                                    <input 
                                        required 
                                        type="text" 
                                        value={formData.base_value}
                                        onChange={handleCurrencyChange}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium focus:outline-none focus:border-[var(--color-primary-base)] dark:text-slate-200 transition-colors shadow-sm"
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Categoria Financeira Vinculada (DRE)</label>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsCategoryModalOpen(true)}
                                        className="text-xs font-bold text-[var(--color-primary-base)] hover:underline flex items-center gap-1"
                                    >
                                        + Nova Categoria
                                    </button>
                                </div>
                                <select 
                                    value={formData.category_id}
                                    onChange={(e) => setFormData({...formData, category_id: e.target.value})}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:text-slate-200 transition-colors shadow-sm"
                                >
                                    <option value="">Nenhuma Categoria (Opcional)</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Descrição Padrão (Corpo da NF)</label>
                                <textarea 
                                    rows={4}
                                    value={formData.default_description}
                                    onChange={(e) => setFormData({...formData, default_description: e.target.value})}
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:text-slate-200 transition-colors shadow-sm resize-none"
                                    placeholder="Texto a ser impresso na Nota Fiscal Eletrônica..."
                                />
                            </div>
                        </div>
                    )}

                    {/* TAB CONTENT: FISCAL */}
                    {activeTab === 'FISCAL' && (
                        <div className="space-y-8 max-w-3xl">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Código LC 116</label>
                                    <select 
                                        value={formData.codigo_lc116}
                                        onChange={(e) => setFormData({...formData, codigo_lc116: e.target.value})}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:text-slate-200 shadow-sm"
                                    >
                                        <option value="">Selecione...</option>
                                        {LC116_CODES.map((item) => (
                                            <option key={item.code} value={item.code}>{item.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">CNAE Vinculado</label>
                                    <input 
                                        type="text" 
                                        value={formData.cnae}
                                        onChange={(e) => setFormData({...formData, cnae: e.target.value})}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:text-slate-200 shadow-sm"
                                        placeholder="Ex: 6204-0/00"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Alíquota ISS (%)</label>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={formData.aliquota_iss}
                                        onChange={(e) => setFormData({...formData, aliquota_iss: e.target.value})}
                                        className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:text-slate-200 shadow-sm"
                                        placeholder="Ex: 3.50"
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                                    Toggles de Retenção de Impostos
                                </h3>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                    {[
                                        { key: 'reter_iss', label: 'ISS Retido' },
                                        { key: 'reter_inss', label: 'INSS Retido' },
                                        { key: 'reter_ir', label: 'IR Retido' },
                                        { key: 'reter_pis', label: 'PIS Retido' },
                                        { key: 'reter_cofins', label: 'COFINS Retido' },
                                        { key: 'reter_csll', label: 'CSLL Retido' }
                                    ].map((tax) => (
                                        <div key={tax.key} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{tax.label}</span>
                                            {/* CUSTOM TAILWIND SWITCH */}
                                            <button 
                                                type="button"
                                                onClick={() => setFormData({...formData, [tax.key]: !(formData as any)[tax.key]})}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                                    (formData as any)[tax.key] ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                                                }`}
                                            >
                                                <span 
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                        (formData as any)[tax.key] ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </form>

                <div className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6 flex justify-end">
                    <button 
                        type="submit" 
                        form="service-form"
                        className="px-8 py-3 bg-[var(--color-primary-base)] hover:opacity-90 text-white text-sm font-bold rounded-xl shadow-md transition flex items-center gap-2"
                    >
                        <Save className="w-4 h-4"/> Salvar Serviço
                    </button>
                </div>
            </div>

            {/* CATEGORY MODAL */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-primary-base)]"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
                                Nova Categoria
                            </h2>
                            <button type="button" onClick={()=>setIsCategoryModalOpen(false)} className="text-slate-400">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                        <form onSubmit={handleCreateCategory} className="space-y-4">
                            <div className="p-6 pb-2 space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome para Faturamento/Despesa</label>
                                    <input 
                                        required 
                                        autoFocus
                                        type="text" 
                                        value={newCategoryForm.name} 
                                        onChange={(e) => setNewCategoryForm({...newCategoryForm, name: e.target.value})} 
                                        className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm focus:border-[var(--color-primary-base)] outline-none" 
                                        placeholder="Ex: Consultoria Retida" 
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Natureza da Conta</label>
                                    <select disabled value={newCategoryForm.type} className="w-full px-4 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm opacity-80 cursor-not-allowed">
                                        <option value="RECEIVABLE">Contas A Receber (Receita)</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Grupo do DRE</label>
                                    <select value={newCategoryForm.dre_group} onChange={(e) => setNewCategoryForm({...newCategoryForm, dre_group: e.target.value})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm focus:border-[var(--color-primary-base)] outline-none">
                                        <option value="">Nenhum (Não Classificado)</option>
                                        <option value="1_Receita_Bruta">1 - Receita Bruta</option>
                                        <option value="2_Deducoes_Tributos">2 - Deduções / Tributos</option>
                                        <option value="3_Custo_Variavel">3 - Custo Variável (CPV)</option>
                                        <option value="4_Despesa_Fixa_Operacional">4 - Despesa Fixa / Operacional</option>
                                        <option value="5_Despesa_Nao_Operacional">5 - Despesa Não Operacional</option>
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">Isso determinará a posição desta categoria no Relatório DRE.</p>
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <input type="checkbox" id="modal-cat-active" checked={newCategoryForm.active} onChange={(e)=>setNewCategoryForm({...newCategoryForm, active: e.target.checked})} className="w-5 h-5 rounded border-slate-300 text-[var(--color-primary-base)]"/>
                                    <label htmlFor="modal-cat-active" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">Manter categoria ativada</label>
                                </div>
                            </div>
                            
                            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-3xl">
                                <button type="button" onClick={()=>setIsCategoryModalOpen(false)} className="px-5 py-2.5 font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition dark:text-slate-300 dark:hover:bg-slate-800 text-sm">
                                    Cancelar
                                </button>
                                <button type="submit" className="px-6 py-2.5 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-bold rounded-xl shadow-sm transition text-sm">
                                    Salvar Categoria
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
