'use client';

import { useState, useEffect } from 'react';
import { BarChart3, ArrowLeft, CalendarDays, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function DREPage() {
    const [reports, setReports] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [accountFilter, setAccountFilter] = useState('');
    const [monthYear, setMonthYear] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [regime, setRegime] = useState<'COMPETENCIA' | 'CAIXA'>('COMPETENCIA');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAccounts();
    }, []);

    useEffect(() => {
        fetchReports();
    }, [accountFilter, monthYear, regime]);

    const fetchAccounts = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setAccounts(await res.json());
        } catch (e) { toast.error("Erro ao carregar contas"); }
    };

    const fetchReports = async () => {
        setLoading(true);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/reports/dre`);
            url.searchParams.append('month_year', monthYear);
            url.searchParams.append('regime', regime);
            if (accountFilter) url.searchParams.append('account_id', accountFilter);
            
            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                setReports(await res.json());
            }
        } catch (e) {
            toast.error("Erro ao carregar DRE");
        } finally {
            setLoading(false);
        }
    };

    const getGroupTotal = (group: string) => reports.filter(r => r.dre_group === group).reduce((acc, curr) => acc + curr.total, 0);

    const receitaBrutaTotal = getGroupTotal('1_Receita_Bruta');
    const deducoesTotal = getGroupTotal('2_Deducoes_Tributos');
    const receitaLiquida = receitaBrutaTotal - deducoesTotal;
    
    const custoVariavelTotal = getGroupTotal('3_Custo_Variavel');
    const margemContribuicao = receitaLiquida - custoVariavelTotal;
    
    const despesasFixasTotal = getGroupTotal('4_Despesa_Fixa_Operacional');
    const ebitda = margemContribuicao - despesasFixasTotal;
    
    const despesasNaoOpTotal = getGroupTotal('5_Despesa_Nao_Operacional');
    const lucroLiquido = ebitda - despesasNaoOpTotal;

    const renderGroupRows = (group: string) => {
        const items = reports.filter(r => r.dre_group === group).sort((a:any, b:any) => b.total - a.total);
        if (items.length === 0) return <div className="text-xs text-slate-500 italic py-1">Sem movimentações nessa conta.</div>;
        
        return items.map((r, i) => {
            const pct = receitaBrutaTotal > 0 ? ((r.total / receitaBrutaTotal) * 100).toFixed(1) : '0.0';
            return (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-800/30 last:border-0 hover:bg-slate-800/50 -mx-4 px-8 transition">
                    <span className="text-sm text-slate-400 flex items-center pl-4">{r.category}</span>
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-slate-500 hidden sm:block">{pct}%</span>
                        <span className="text-sm font-medium text-slate-300 min-w-[100px] text-right">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(r.total)}</span>
                    </div>
                </div>
            )
        });
    };

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <Link href="/financial" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 dark:text-slate-400 dark:hover:text-white font-medium mb-2 w-fit">
                <ArrowLeft className="w-4 h-4"/> Voltar para Finanças
            </Link>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <BarChart3 className="h-8 w-8 text-[var(--color-primary-base)]" />
                        DRE Estruturado
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
                        Demonstrativo de Resultados do Exercício
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl shrink-0 border border-slate-200 dark:border-slate-800">
                        <button onClick={()=>setRegime('COMPETENCIA')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${regime === 'COMPETENCIA' ? 'bg-[var(--color-primary-base)] text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Competência</button>
                        <button onClick={()=>setRegime('CAIXA')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${regime === 'CAIXA' ? 'bg-[var(--color-primary-base)] text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Caixa (Realizado)</button>
                    </div>

                    <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 flex-1 min-w-[200px]">
                        <CalendarDays className="w-4 h-4 text-slate-400 shrink-0"/>
                        <input type="month" value={monthYear} onChange={(e)=>setMonthYear(e.target.value)} className="w-full bg-transparent py-2.5 text-sm font-semibold outline-none text-slate-700 dark:text-slate-200" />
                    </div>

                    <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 flex-1 min-w-[180px]">
                        <Filter className="w-4 h-4 text-slate-400 shrink-0"/>
                        <select value={accountFilter} onChange={(e)=>setAccountFilter(e.target.value)} className="w-full bg-transparent py-2.5 text-sm font-semibold outline-none text-slate-700 dark:text-slate-200">
                            <option value="">Consolidado global</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary-base)]"></div>
                </div>
            ) : (
                <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl text-slate-100 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-900 flex justify-between items-center border-b border-slate-800">
                        <span className="text-xs uppercase font-black tracking-widest text-[var(--color-primary-base)]">Indicadores / Contas</span>
                        <span className="text-xs uppercase font-black tracking-widest text-slate-500">Valores</span>
                    </div>
                    
                    <div className="flex flex-col">
                        {/* 1. RECEITA BRUTA */}
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-emerald-500/80 bg-slate-900/40">
                            <h3 className="font-semibold text-emerald-400 text-sm">1. Receita Bruta Total</h3>
                            <span className="font-bold text-emerald-400 text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(receitaBrutaTotal)}</span>
                        </div>
                        <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                            {renderGroupRows('1_Receita_Bruta')}
                        </div>

                        {/* 2. DEDUÇÕES */}
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-rose-500/80 bg-slate-900/40">
                            <h3 className="font-semibold text-rose-400 text-sm">2. Deduções, Abatimento e Impostos (-)</h3>
                            <span className="font-bold text-rose-400 text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(deducoesTotal)}</span>
                        </div>
                        <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                            {renderGroupRows('2_Deducoes_Tributos')}
                        </div>

                        {/* = RECEITA LIQUIDA */}
                        <div className="flex justify-between items-center px-4 py-3 bg-[var(--color-primary-base)]/10 border-b border-[var(--color-primary-base)]/30 border-l-2 border-l-[var(--color-primary-base)]">
                            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wide">= Receita Operacional Líquida (ROL)</h3>
                            <span className="font-bold text-[var(--color-primary-base)] text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(receitaLiquida)}</span>
                        </div>

                        {/* 3. CUSTOS VARIAVEIS */}
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-amber-500/80 bg-slate-900/40 mt-3 border-t">
                            <h3 className="font-semibold text-amber-400 text-sm">3. Custos Variáveis (CPV/CMV) (-)</h3>
                            <span className="font-bold text-amber-400 text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(custoVariavelTotal)}</span>
                        </div>
                        <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                            {renderGroupRows('3_Custo_Variavel')}
                        </div>

                        {/* = MARGEM DE CONTRIBUIÇÃO */}
                        <div className="flex justify-between items-center px-4 py-3 bg-[var(--color-primary-base)]/10 border-b border-[var(--color-primary-base)]/30 border-l-2 border-l-[var(--color-primary-base)]">
                            <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wide">= Margem de Contribuição</h3>
                            <span className="font-bold text-[var(--color-primary-base)] text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(margemContribuicao)}</span>
                        </div>

                        {/* 4. DESPESAS FIXAS */}
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-rose-500/80 bg-slate-900/40 mt-3 border-t">
                            <h3 className="font-semibold text-rose-400 text-sm">4. Despesas Fixas / Operacionais (-)</h3>
                            <span className="font-bold text-rose-400 text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(despesasFixasTotal)}</span>
                        </div>
                        <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                            {renderGroupRows('4_Despesa_Fixa_Operacional')}
                        </div>

                        {/* = EBITDA */}
                        <div className="flex justify-between items-center px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/30 border-l-2 border-l-indigo-400">
                            <h3 className="font-bold text-indigo-100 text-sm uppercase tracking-wide">= Resultado Operacional (LAJIDA)</h3>
                            <span className="font-bold text-indigo-400 text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(ebitda)}</span>
                        </div>

                        {/* 5. DESPESAS NAO OPERACIONAIS / IMPOSTOS C/ LUCRO */}
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-rose-500/80 bg-slate-900/40 mt-3 border-t">
                            <h3 className="font-semibold text-rose-400 text-sm">5. Resultado Não Operacional e IRPJ/CSLL (-)</h3>
                            <span className="font-bold text-rose-400 text-sm">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(despesasNaoOpTotal)}</span>
                        </div>
                        <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                            {renderGroupRows('5_Despesa_Nao_Operacional')}
                        </div>

                        {/* = LUCRO LIQUIDO */}
                        <div className={`flex justify-between items-center px-5 py-4 border-l-4 ${lucroLiquido >= 0 ? 'bg-emerald-900/40 border-l-emerald-500' : 'bg-rose-900/40 border-l-rose-500'}`}>
                            <h3 className="font-bold text-sm uppercase tracking-widest text-white">= {lucroLiquido >= 0 ? 'Lucro Líquido' : 'Prejuízo Líquido'} Final</h3>
                            <span className={`font-black text-lg ${lucroLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(lucroLiquido)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
