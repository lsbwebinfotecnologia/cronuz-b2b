'use client';

import { useState, useEffect, Suspense } from 'react';
import { ArrowRightLeft, TrendingUp, TrendingDown, Building2, Search, Filter, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function StatementPageContent() {
    const searchParams = useSearchParams();
    const initialAccountId = searchParams.get('accountId') || '';
    
    const [accounts, setAccounts] = useState<any[]>([]);
    const [statements, setStatements] = useState<any[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(true);
    const [loadingStatements, setLoadingStatements] = useState(false);
    
    const [filters, setFilters] = useState({
        account_id: initialAccountId,
        start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        fetchAccounts();
    }, []);

    useEffect(() => {
        if (filters.account_id) {
            fetchStatement();
        } else {
            setStatements([]);
        }
    }, [filters.account_id, filters.start_date, filters.end_date]);

    const fetchAccounts = async () => {
        setLoadingAccounts(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setAccounts(await res.json());
        } catch (e) {
            toast.error("Erro ao carregar contas");
        } finally {
            setLoadingAccounts(false);
        }
    };

    const fetchStatement = async () => {
        if (!filters.account_id) return;
        setLoadingStatements(true);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts/${filters.account_id}/statement`);
            if (filters.start_date) url.searchParams.append("start_date", filters.start_date);
            if (filters.end_date) url.searchParams.append("end_date", filters.end_date);
            
            const res = await fetch(url.toString(), {
                 headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setStatements(await res.json());
        } catch (e) { 
            toast.error("Erro ao buscar histórico do extrato"); 
        } finally {
            setLoadingStatements(false);
        }
    };

    const activeAccount = accounts.find(a => a.id.toString() === filters.account_id);

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <FileText className="h-8 w-8 text-indigo-500" />
                        Extrato Consolidado
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                        Consulte as movimentações e auditoria dos seus caixas com filtros por período.
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <Link href="/financial/accounts" className="px-5 py-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-semibold rounded-xl text-sm transition hover:bg-slate-200">
                        Voltar para Contas
                    </Link>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-slate-900 dark:border-slate-800 p-5 overflow-hidden flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Conta / Caixa</label>
                    <select value={filters.account_id} onChange={(e) => setFilters({...filters, account_id: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl dark:bg-slate-950 dark:border-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500">
                        <option value="">Selecione uma conta...</option>
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name} — {acc.type === 'CREDIT_CARD' ? 'Cartão' : 'Conta/Caixa'}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">A Partir De</label>
                    <input type="date" value={filters.start_date} onChange={(e) => setFilters({...filters, start_date: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl dark:bg-slate-950 dark:border-slate-800" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Até o Dia</label>
                    <input type="date" value={filters.end_date} onChange={(e) => setFilters({...filters, end_date: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl dark:bg-slate-950 dark:border-slate-800" />
                </div>
            </div>
            
            {filters.account_id && activeAccount && (
                 <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm pt-4">
                    <div className="px-6 py-4 flex flex-col md:flex-row justify-between md:items-center bg-slate-50/50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 gap-4">
                         <div className="flex items-center gap-3">
                             <div className="w-12 h-12 bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 rounded-full flex items-center justify-center">
                                 <Building2 className="w-6 h-6" />
                             </div>
                             <div>
                                 <h2 className="text-xl font-bold text-slate-800 dark:text-white">{activeAccount.name}</h2>
                                 <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{activeAccount.type}</p>
                             </div>
                         </div>
                         <div className="text-left md:text-right">
                             <p className="text-xs uppercase font-bold text-slate-400 mb-1">Saldo Consolidado Atual da Conta</p>
                             <p className={`text-2xl font-black ${activeAccount.current_balance < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                 {new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(activeAccount.current_balance)}
                             </p>
                         </div>
                    </div>
                
                    <div className="p-0">
                        {loadingStatements ? (
                            <div className="py-20 flex justify-center text-indigo-500">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                            </div>
                        ) : statements.length === 0 ? (
                            <div className="text-center text-slate-500 py-20 flex flex-col items-center">
                                <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold">Nenhuma Movimentação</h3>
                                <p className="text-sm">Nenhum registro encontrado neste período para esta conta.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                     <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-400">
                                         <tr>
                                             <th className="px-6 py-4 font-semibold">Data/Hora</th>
                                             <th className="px-6 py-4 font-semibold">Descrição do Título</th>
                                             <th className="px-6 py-4 font-semibold text-right">Valor Operação</th>
                                             <th className="px-6 py-4 font-semibold text-right">Saldo Logo Após</th>
                                             <th className="px-6 py-4 font-semibold text-center">Audit ID</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         {statements.map((log: any) => (
                                              <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                                 <td className="px-6 py-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                                                     {new Date(log.created_at).toLocaleString('pt-BR')}
                                                 </td>
                                                 <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
                                                    <div className={`p-1.5 rounded-full flex-shrink-0 ${log.movement_type === '+' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}`}>
                                                        {log.movement_type === '+' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                                    </div>
                                                    <span className="truncate max-w-[250px] md:max-w-xs">{log.description}</span>
                                                 </td>
                                                 <td className={`px-6 py-4 font-black text-right whitespace-nowrap ${log.movement_type === '+' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                     {log.movement_type} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(log.amount)}
                                                 </td>
                                                 <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-300 text-right whitespace-nowrap">
                                                     {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(log.progressive_balance)}
                                                 </td>
                                                 <td className="px-6 py-4 text-center">
                                                     <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded font-mono text-slate-500">
                                                         #{log.id}
                                                     </span>
                                                 </td>
                                              </tr>
                                         ))}
                                     </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                 </div>
            )}
            
            {!filters.account_id && (
                <div className="py-24 text-center">
                    <Building2 className="w-16 h-16 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-400 dark:text-slate-600">Selecione uma conta no topo</h2>
                    <p className="text-slate-400 dark:text-slate-600 font-medium">para visualizar o histórico de pagamentos e recebimentos consolidado.</p>
                </div>
            )}
        </div>
    );
}

export default function StatementPage() {
    return (
        <Suspense fallback={<div className="p-12 text-center text-slate-500">Carregando Tela de Extrato...</div>}>
            <StatementPageContent />
        </Suspense>
    );
}
