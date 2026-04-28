'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, ShieldAlert, ArrowLeft, RefreshCw, Layers, Calendar, Hash, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';

export default function BankReconciliationPage() {
    const [installments, setInstallments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'PENDING' | 'CONCILIATED'>('PENDING');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [previousBalance, setPreviousBalance] = useState<number | null>(null);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    });
    const [installmentIdFilter, setInstallmentIdFilter] = useState('');
    const [accountFilter, setAccountFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [accounts, setAccounts] = useState<any[]>([]);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
                if (res.ok) setAccounts(await res.json());
            } catch (e) {}
        };
        fetchAccounts();
    }, []);

    useEffect(() => {
        fetchInstallments();
        setSelectedIds([]);
    }, [activeTab, accountFilter]);

    const handleSearch = () => {
        fetchInstallments();
    };

    const fetchInstallments = async () => {
        setLoading(true);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments`);
            url.searchParams.append('status', 'PAID');
            url.searchParams.append('page_size', '3000');
            
            if (activeTab === 'CONCILIATED') {
                if (startDate) url.searchParams.append('start_payment_date', startDate);
                if (endDate) url.searchParams.append('end_payment_date', endDate);
            }
            
            const idDigits = installmentIdFilter.replace(/\D/g, '');
            if (idDigits) url.searchParams.append('installment_id', idDigits);
            if (accountFilter) url.searchParams.append('account_id', accountFilter);
            if (customerFilter) url.searchParams.append('customer_id', customerFilter);

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                let itemsList = data.items || [];
                
                if (activeTab === 'CONCILIATED') {
                    itemsList = itemsList.sort((a: any, b: any) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
                    setInstallments(itemsList.filter((d: any) => d.is_conciliated));
                    
                    if (accountFilter) {
                        try {
                            const pbUrl = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts/${accountFilter}/previous_balance`);
                            if (startDate) pbUrl.searchParams.append('date', startDate);
                            const pbRes = await fetch(pbUrl.toString(), { headers: { 'Authorization': `Bearer ${getToken()}` } });
                            if (pbRes.ok) {
                                const pbData = await pbRes.json();
                                setPreviousBalance(pbData.previous_balance);
                            } else {
                                setPreviousBalance(0);
                            }
                        } catch(e) {
                            setPreviousBalance(0);
                        }
                    } else {
                        setPreviousBalance(null);
                    }
                } else {
                    setInstallments(itemsList.filter((d: any) => !d.is_conciliated));
                    setPreviousBalance(null);
                }
            }
        } catch (e) {
            toast.error("Erro ao carregar conciliação");
        } finally {
            setLoading(false);
        }
    };

    const handleConciliate = async (instId: number) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments/${instId}/conciliate`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success("Fechamento Oficializado!");
                fetchInstallments();
            } else {
                const js = await res.json();
                toast.error(js.detail || "Erro na auditoria");
            }
        } catch (e) {
            toast.error("Erro no servidor");
        }
    };

    const handleBulkConciliate = async () => {
        if (selectedIds.length === 0) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments/bulk_conciliate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ installment_ids: selectedIds })
            });
            if (res.ok) {
                toast.success("Lote conciliado com sucesso!");
                setSelectedIds([]);
                fetchInstallments();
            } else {
                const js = await res.json();
                toast.error(js.detail || "Erro ao conciliar lote");
            }
        } catch (e) {
            toast.error("Erro no servidor");
        }
    };

    const handleRevertConciliation = async (instId: number) => {
        if (!confirm("Tem certeza que deseja estornar e reabrir este lançamento?")) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments/${instId}/revert_conciliation`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success("Lançamento estornado e reaberto para edição!");
                fetchInstallments();
            } else {
                toast.error("Erro ao estornar lançamento");
            }
        } catch (e) { toast.error("Erro no servidor"); }
    };

    const toggleSelection = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleAll = () => {
        if (selectedIds.length === installments.length) setSelectedIds([]);
        else setSelectedIds(installments.map(i => i.id));
    };

    const exportToCSV = () => {
        if (installments.length === 0) {
            toast.error("Não há dados para exportar");
            return;
        }

        const headers = ["Status", "Lançamento", "Vencimento", "Pagamento", "Origem / Destino", "Descrição", "Conta Bancária", "Valor"];
        const rows = installments.map(inst => [
            activeTab === 'CONCILIATED' ? 'Conciliado' : 'Pendente',
            inst.id,
            inst.due_date ? new Date(inst.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
            inst.payment_date ? new Date(inst.payment_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
            inst.customer_name || 'Diversos',
            inst.description,
            accounts.find(a => a.id === inst.account_id)?.name || 'N/A',
            (inst.type === 'RECEIVABLE' ? inst.amount : -inst.amount).toFixed(2).replace('.', ',')
        ]);

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + headers.join(";") + "\n" 
            + rows.map(e => e.join(";")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `conciliacao_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    let runningBalance = previousBalance !== null ? previousBalance : 0;

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <Link href="/financial" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 dark:text-slate-400 dark:hover:text-white font-medium mb-2 w-fit">
                <ArrowLeft className="w-4 h-4"/> Voltar para Finanças
            </Link>

            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Layers className="h-8 w-8 text-[var(--color-primary-base)]" />
                        Conciliação Bancária
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 dark:text-slate-400 max-w-2xl">
                        Valide os lançamentos que foram pagos e efetive-os como "Conciliados". O saldo oficial das contas só será movimentado após o fechamento nesta tela. Estornos também são realizados aqui.
                    </p>
                </div>
                
                {activeTab === 'PENDING' && selectedIds.length > 0 && (
                    <button onClick={handleBulkConciliate} className="px-5 py-2.5 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-2 text-sm whitespace-nowrap">
                        <CheckCircle className="w-4 h-4" /> Conciliar Selecionados ({selectedIds.length})
                    </button>
                )}
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-800 gap-8">
                <button onClick={() => setActiveTab('PENDING')} className={`pb-3 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'PENDING' ? 'border-[var(--color-primary-base)] text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}>A Conciliar (Auditoria)</button>
                <button onClick={() => setActiveTab('CONCILIATED')} className={`pb-3 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'CONCILIATED' ? 'border-[var(--color-primary-base)] text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}>Já Conciliados (Fechados)</button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex flex-wrap items-center gap-3 w-full">
                        {activeTab === 'CONCILIATED' && (
                            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 h-11 shadow-sm shrink-0">
                                <span className="text-xs font-semibold uppercase text-slate-400 select-none mr-3 hidden sm:inline">Período Mov.</span>
                                <input type="date" title="Data Inicial" value={startDate} onChange={e=>setStartDate(e.target.value)} className="bg-transparent text-sm font-medium outline-none w-[115px] text-slate-700 dark:text-slate-300" />
                                <span className="text-slate-400 mx-2">-</span>
                                <input type="date" title="Data Final" value={endDate} onChange={e=>setEndDate(e.target.value)} className="bg-transparent text-sm font-medium outline-none w-[115px] text-slate-700 dark:text-slate-300" />
                            </div>
                        )}
                        
                        <select value={accountFilter} onChange={(e)=>setAccountFilter(e.target.value)} className="w-full sm:w-auto min-w-[200px] px-3 h-11 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl text-sm font-medium outline-none text-slate-700 dark:text-slate-200 shadow-sm shrink-0">
                            <option value="">Todas as Contas (Bancos)</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>

                        <div className="w-full sm:w-auto min-w-[220px] shrink-0 h-11">
                            <CustomerAutocomplete 
                                value={customerFilter}
                                onChange={(id) => setCustomerFilter(id)}
                                placeholder="Cliente / Fornecedor"
                                className="h-full [&>div]:h-full [&>div]:py-0 [&>div]:rounded-xl"
                            />
                        </div>
                        
                        <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 h-11 shadow-sm shrink-0 w-full sm:w-auto">
                            <Hash className="w-4 h-4 text-slate-400 mr-2"/>
                            <input type="text" placeholder="Lançamento" value={installmentIdFilter} onChange={e=>setInstallmentIdFilter(e.target.value)} className="bg-transparent text-sm outline-none w-28 font-medium placeholder-slate-400 text-slate-700 dark:text-slate-300" />
                        </div>

                        <button type="submit" className="px-6 h-11 bg-[var(--color-primary-base)] text-white font-bold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2 text-sm shadow-sm w-full sm:w-auto md:ml-auto shrink-0">
                            <Search className="w-4 h-4" /> Buscar
                        </button>
                        <button type="button" onClick={exportToCSV} className="px-5 h-11 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm shadow-sm w-full sm:w-auto shrink-0">
                            <Download className="w-4 h-4" /> Excel
                        </button>
                    </form>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-xs">
                            <tr>
                                {activeTab === 'PENDING' && (
                                    <th className="px-6 py-4 w-12 text-center">
                                        <input type="checkbox" checked={installments.length > 0 && selectedIds.length === installments.length} onChange={toggleAll} className="w-4 h-4 rounded border-slate-300 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)] cursor-pointer" />
                                    </th>
                                )}
                                <th className="px-6 py-4">Transação (Origem / Destino)</th>
                                <th className="px-6 py-4">Vencimento</th>
                                <th className="px-6 py-4">Pagamento</th>
                                <th className="px-6 py-4">Descrição</th>
                                <th className="px-6 py-4">Valor</th>
                                {activeTab === 'CONCILIATED' && accountFilter && (
                                    <th className="px-6 py-4 text-right">Saldo Atualizado</th>
                                )}
                                <th className="px-6 py-4 text-right">Efetivação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={activeTab === 'PENDING' ? 6 : 5} className="py-12 text-center text-slate-500">Listando auditoria...</td></tr>
                            ) : installments.length === 0 ? (
                                <tr>
                                    <td colSpan={activeTab === 'PENDING' ? 6 : 5} className="py-16 text-center text-slate-400 dark:text-slate-500">
                                        {activeTab === 'PENDING' ? (
                                            <div className="flex flex-col items-center gap-3 text-emerald-500 font-bold">
                                                <CheckCircle className="w-10 h-10"/> <span className="text-lg text-slate-500 font-medium">Nenhuma conciliação pendente. Tudo em dia!</span>
                                            </div>
                                        ) : "Nenhum fechamento validado no período selecionado."}
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {activeTab === 'CONCILIATED' && accountFilter && (
                                        <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800">
                                            <td colSpan={4} className="px-6 py-4 font-semibold text-slate-500 text-right uppercase text-xs tracking-wider">
                                                Saldo Inicial (Até {startDate ? new Date(startDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'o Início'})
                                            </td>
                                            <td className="px-6 py-4 font-black text-slate-700 dark:text-slate-300 text-right">
                                                {previousBalance === null ? (
                                                    <span className="text-slate-400 text-sm font-medium">Calculando...</span>
                                                ) : (
                                                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(previousBalance)
                                                )}
                                            </td>
                                            <td></td>
                                        </tr>
                                    )}
                                    {installments.map(inst => {
                                        const val = inst.type === 'RECEIVABLE' ? inst.amount : -inst.amount;
                                        if (activeTab === 'CONCILIATED' && accountFilter) {
                                            runningBalance += val;
                                        }
                                        return (
                                        <tr key={inst.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                                            {activeTab === 'PENDING' && (
                                                <td className="px-6 py-4 text-center">
                                                    <input type="checkbox" checked={selectedIds.includes(inst.id)} onChange={()=>toggleSelection(inst.id)} className="w-4 h-4 rounded border-slate-300 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)] cursor-pointer" />
                                                </td>
                                            )}
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-500 text-xs">#{inst.id}</span>
                                                        {activeTab === 'PENDING' ? (
                                                            <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 font-bold px-2 py-0.5 rounded text-[9px] tracking-wider">A FECHAR</span>
                                                        ) : (
                                                            <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400 font-bold px-2 py-0.5 rounded text-[9px] tracking-wider">FECHADO</span>
                                                        )}
                                                    </div>
                                                    <p className="font-bold text-[var(--color-primary-base)] text-sm truncate max-w-[200px]" title={inst.customer_name || 'Diversos'}>{inst.customer_name || 'Diversos'}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                                {inst.due_date ? new Date(inst.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                                {inst.payment_date ? new Date(inst.payment_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Sem data'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="font-medium text-slate-900 dark:text-white max-w-[200px] truncate" title={inst.description}>{inst.description}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`font-bold ${inst.type === 'RECEIVABLE' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {inst.type === 'RECEIVABLE' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(inst.amount)}
                                                </span>
                                            </td>
                                            {activeTab === 'CONCILIATED' && accountFilter && (
                                                <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-300 text-right">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(runningBalance)}
                                                </td>
                                            )}
                                            <td className="px-6 py-4 text-right">
                                                {activeTab === 'PENDING' ? (
                                                    <button onClick={()=>handleConciliate(inst.id)} className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 ml-auto text-xs">
                                                        <RefreshCw className="w-3.5 h-3.5" /> Conciliar
                                                    </button>
                                                ) : (
                                                    <button onClick={()=>handleRevertConciliation(inst.id)} className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 font-bold rounded-lg transition flex items-center gap-1.5 ml-auto text-xs">
                                                        Estornar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                    {activeTab === 'CONCILIATED' && accountFilter && installments.length > 0 && (
                                        <tr className="bg-indigo-50/50 dark:bg-indigo-900/10 border-t-2 border-indigo-100 dark:border-indigo-900/50">
                                            <td colSpan={4} className="px-6 py-4 font-bold text-indigo-700 dark:text-indigo-400 text-right uppercase text-sm tracking-wider">
                                                Saldo Final no Período
                                            </td>
                                            <td className="px-6 py-4 font-black text-indigo-700 dark:text-indigo-400 text-right text-base text-nowrap">
                                                {previousBalance === null ? (
                                                    <span className="text-indigo-400/50 text-sm font-medium">Calculando...</span>
                                                ) : (
                                                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(runningBalance)
                                                )}
                                            </td>
                                            <td></td>
                                        </tr>
                                    )}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
