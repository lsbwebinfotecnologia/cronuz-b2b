'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Wallet, Building2, Plus, X, Trash2, ArrowRightLeft, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<any>(null);
    const [formData, setFormData] = useState({
        name: '', type: 'CURRENT', initial_balance: '', closing_day: '', due_day: '', adjustment_description: ''
    });
    
    // Transfer Modal
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferData, setTransferData] = useState({
        source_account_id: '', destination_account_id: '', amount: '', transfer_date: new Date().toISOString().split('T')[0], description: 'Transferência entre contas'
    });



    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setAccounts(await res.json());
        } catch (e) {
            toast.error("Erro ao carregar contas");
        } finally {
            setLoading(false);
        }
    };
    


    const openEdit = (acc: any) => {
        setEditingAccount(acc);
        setFormData({
            name: acc.name, 
            type: acc.type, 
            initial_balance: acc.current_balance || 0, 
            closing_day: acc.closing_day || '', 
            due_day: acc.due_day || '',
            adjustment_description: ''
        });
        setIsModalOpen(true);
    };

    const handleCreate = async () => {
        if (!formData.name) {
            toast.error("Preencha o nome da conta");
            return;
        }

        try {
            console.log("Saving account...", formData);
            const payload: any = {
                name: formData.name,
                type: formData.type,
                initial_balance: formData.initial_balance ? parseFloat(formData.initial_balance) : 0
            };
            if (formData.type === 'CREDIT_CARD') {
                payload.closing_day = formData.closing_day ? parseInt(formData.closing_day) : 10;
                payload.due_day = formData.due_day ? parseInt(formData.due_day) : 20;
            }
            
            let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts`;
            let method = 'POST';
            if (editingAccount) {
                url += `/${editingAccount.id}`;
                method = 'PATCH';
                delete payload.type;
                if (parseFloat(formData.initial_balance) !== editingAccount.current_balance) {
                    payload.current_balance = parseFloat(formData.initial_balance);
                    payload.adjustment_description = formData.adjustment_description;
                }
                delete payload.initial_balance;
            }
            
            console.log("Sending to", method, url, payload);
            
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            
            console.log("Response status:", res.status);
            
            if (res.ok) {
                toast.success(editingAccount ? "Conta atualizada!" : "Conta criada!");
                setIsModalOpen(false);
                setEditingAccount(null);
                setFormData({ name: '', type: 'CURRENT', initial_balance: '', closing_day: '', due_day: '', adjustment_description: '' });
                fetchAccounts();
            } else {
                let errText = "Erro desconhecido";
                try {
                    const js = await res.json();
                    errText = js.detail || JSON.stringify(js);
                } catch(e) {
                    errText = await res.text();
                }
                console.error("Backend Error:", errText);
                toast.error(errText || "Erro ao salvar conta");
            }
        } catch (e: any) { 
            console.error("Fetch Error:", e);
            toast.error(e.message || "Erro no servidor (Inalcançável)"); 
        }
    };

    const handleTransfer = async () => {
        if (!transferData.source_account_id || !transferData.destination_account_id || !transferData.amount) {
            toast.error("Preencha todos os campos obrigatórios");
            return;
        }
        try {
            const payload = {
                source_account_id: parseInt(transferData.source_account_id),
                destination_account_id: parseInt(transferData.destination_account_id),
                amount: parseFloat(transferData.amount.replace(/\./g, '').replace(',', '.')),
                transfer_date: transferData.transfer_date,
                description: transferData.description
            };
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success("Transferência realizada!");
                setIsTransferModalOpen(false);
                setTransferData({ source_account_id: '', destination_account_id: '', amount: '', transfer_date: new Date().toISOString().split('T')[0], description: 'Transferência entre contas' });
                fetchAccounts();
            } else {
                const js = await res.json();
                toast.error(js.detail || "Erro ao transferir");
            }
        } catch(e) { toast.error("Erro de conexão"); }
    };

    const handleDelete = async (id: number) => {
        if(!confirm("Atenção: Deletar a conta remove ela do seu financeiro, mas não apaga o saldo consolidado de faturas geradas. Continuar?")) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts/${id}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success("Conta removida");
                fetchAccounts();
            } else {
                const js = await res.json();
                toast.error(js.detail || "Erro ao remover a conta.");
            }
        } catch(e) { toast.error("Sem conexão segura."); }
    }

    const typeIcons: any = {
        'CURRENT': <Building2 className="w-6 h-6 text-indigo-500" />,
        'SAVINGS': <TrendingUp className="w-6 h-6 text-emerald-500" />,
        'WALLET': <Wallet className="w-6 h-6 text-amber-500" />,
        'CREDIT_CARD': <CreditCard className="w-6 h-6 text-rose-500" />
    };

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        Contas Múltiplas e Caixa
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                        Gerencie bancos, carteiras físicas e limites de cartões corporativos.
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <Link href="/financial" className="px-5 py-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-semibold rounded-xl text-sm transition hover:bg-slate-200">
                        Voltar
                    </Link>
                    <button onClick={() => {
                        setIsTransferModalOpen(true);
                    }} className="px-5 py-2 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 font-semibold rounded-xl text-sm shadow flex items-center gap-2 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition">
                        <ArrowRightLeft className="w-4 h-4"/> Transferência
                    </button>
                    <button onClick={() => {
                        setEditingAccount(null);
                        setFormData({ name: '', type: 'CURRENT', initial_balance: '', closing_day: '', due_day: '', adjustment_description: '' });
                        setIsModalOpen(true);
                    }} className="px-5 py-2 bg-[var(--color-primary-base)] text-white font-semibold rounded-xl text-sm shadow flex items-center gap-2 hover:opacity-90 transition">
                        <Plus className="w-4 h-4"/> Adicionar Conta
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {accounts.map(acc => (
                    <div key={acc.id} className="bg-white border text-center border-slate-200 rounded-2xl p-5 shadow-sm dark:bg-slate-900 dark:border-slate-800 flex flex-col items-start text-left relative overflow-hidden">
                        <div className="flex justify-between w-full items-start mb-4">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-100 transition" onClick={()=>openEdit(acc)}>
                                {typeIcons[acc.type] || <Building2/>}
                            </div>
                            <button onClick={()=>handleDelete(acc.id)} className="text-slate-400 hover:text-rose-500 transition"><Trash2 className="w-4 h-4"/></button>
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 cursor-pointer hover:underline" onClick={()=>openEdit(acc)}>{acc.name}</h3>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-6">
                            {acc.type === 'CURRENT' ? 'Conta Corrente' : acc.type === 'CREDIT_CARD' ? `Cartão (Vence dia ${acc.due_day})` : acc.type === 'WALLET' ? 'Caixa / Espécie' : 'Poupança'}
                        </p>
                        
                        <div className="w-full mt-auto">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">{acc.type === 'CREDIT_CARD' ? 'Limite Usado/Lançado' : 'Saldo Atual'}</p>
                                    <p className={`text-2xl font-black ${acc.current_balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.current_balance)}
                                    </p>
                                </div>
                                <Link href={`/financial/statement?accountId=${acc.id}`} className="text-xs font-bold text-[var(--color-primary-base)] border border-[var(--color-primary-base)]/20 bg-[var(--color-primary-base)]/5 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary-base)]/10 transition">
                                    Acessar Extrato
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
                
                {accounts.length === 0 && !loading && (
                    <div className="col-span-full border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
                        <Building2 className="w-12 h-12 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Seu cofre está vazio</h3>
                        <p className="text-slate-500 text-sm max-w-md">Você precisa adicionar contas bancárias ou Caixinhas físicas para poder dar baixa nos lançamentos.</p>
                        <button onClick={() => setIsModalOpen(true)} className="mt-6 px-6 py-2.5 bg-indigo-500 text-white font-bold rounded-xl text-sm shadow">
                            Adicionar Minha Primeira Conta
                        </button>
                    </div>
                )}
            </div>
            
            {/* Modal Novo Banco */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{editingAccount ? 'Editar Conta' : 'Nova Conta Bancária'}</h2>
                            <button onClick={()=>setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome de Exibição <span className="text-rose-500">*</span></label>
                                <input value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm" placeholder="Ex: Itaú Empresa, Cartão Black, Cofre..."/>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Tipo de Caixa <span className="text-rose-500">*</span></label>
                                <select disabled={!!editingAccount} value={formData.type} onChange={e=>setFormData({...formData, type: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm disabled:opacity-50">
                                    <option value="CURRENT">Conta Corrente / Pix</option>
                                    <option value="CREDIT_CARD">Cartão de Crédito</option>
                                    <option value="WALLET">Carteira / Dinheiro / Cofre Físico</option>
                                    <option value="SAVINGS">Conta Poupança / Investimento</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{editingAccount ? 'Saldo Atual (Editar gera ajuste)' : 'Saldo Atual (Opcional)'}</label>
                                <input type="number" step="0.01" value={formData.initial_balance} onChange={e=>setFormData({...formData, initial_balance: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm" placeholder="0.00"/>
                            </div>
                            
                            {editingAccount && parseFloat(formData.initial_balance) !== editingAccount.current_balance && (
                                <div>
                                    <label className="block text-sm font-semibold text-amber-600 dark:text-amber-500 mb-1">Motivo do Ajuste de Saldo</label>
                                    <input value={formData.adjustment_description} onChange={e=>setFormData({...formData, adjustment_description: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-sm" placeholder="Ex: Correção de erro de lançamento"/>
                                </div>
                            )}
                            
                            {formData.type === 'CREDIT_CARD' && (
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Dia de Fechamento</label>
                                        <input type="number" min="1" max="31" value={formData.closing_day} onChange={e=>setFormData({...formData, closing_day: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm text-center" placeholder="Ex: 5"/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Dia de Vencimento</label>
                                        <input type="number" min="1" max="31" value={formData.due_day} onChange={e=>setFormData({...formData, due_day: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm text-center" placeholder="Ex: 15"/>
                                    </div>
                                </div>
                            )}
                            
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={()=>setIsModalOpen(false)} className="px-5 py-2 font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition dark:text-slate-300">
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleCreate} className="px-6 py-2 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-bold rounded-xl shadow-sm transition">
                                    {editingAccount ? 'Salvar Alterações' : 'Configurar Conta'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Transferência */}
            {isTransferModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20">
                            <h2 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 flex items-center gap-2"><ArrowRightLeft className="w-5 h-5"/> Nova Transferência</h2>
                            <button onClick={()=>setIsTransferModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Conta de Origem (Sai dinheiro) <span className="text-rose-500">*</span></label>
                                <select value={transferData.source_account_id} onChange={e=>setTransferData({...transferData, source_account_id: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm bg-rose-50/50 dark:bg-rose-900/10">
                                    <option value="">Selecione a conta...</option>
                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} - Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.current_balance)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Conta de Destino (Entra dinheiro) <span className="text-rose-500">*</span></label>
                                <select value={transferData.destination_account_id} onChange={e=>setTransferData({...transferData, destination_account_id: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm bg-emerald-50/50 dark:bg-emerald-900/10">
                                    <option value="">Selecione a conta...</option>
                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} - Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.current_balance)}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Valor (R$) <span className="text-rose-500">*</span></label>
                                    <input type="text" value={transferData.amount} onChange={(e) => {
                                        let value = e.target.value.replace(/\D/g, '');
                                        if (!value) { setTransferData({...transferData, amount: ''}); return; }
                                        const floatValue = parseInt(value, 10) / 100;
                                        setTransferData({...transferData, amount: floatValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })});
                                    }} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-bold text-center" placeholder="0,00"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Data</label>
                                    <input type="date" value={transferData.transfer_date} onChange={e=>setTransferData({...transferData, transfer_date: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Motivo / Descrição</label>
                                <input value={transferData.description} onChange={e=>setTransferData({...transferData, description: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm" placeholder="Transferência entre contas"/>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={()=>setIsTransferModalOpen(false)} className="px-5 py-2 font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition dark:text-slate-300">
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleTransfer} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition">
                                    Transferir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}


        </div>
    )
}
