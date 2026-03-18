'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, LayoutTemplate, MoreVertical, Search, Check, X, AlertCircle, Edit, Trash2 } from 'lucide-react';
import { getToken } from '@/lib/auth';

interface Showcase {
  id: number;
  name: string;
  rule_type: string;
  display_on_home: boolean;
  display_order: number;
}

export default function ShowcasesPage() {
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchShowcases = async () => {
      try {
        const token = getToken();
        if (!token) return;

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/showcases/`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          setShowcases(data);
        }
      } catch (err) {
        console.error('Error fetching showcases:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchShowcases();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover esta vitrine?')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/showcases/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setShowcases(showcases.filter(s => s.id !== id));
      } else {
        alert('Erro ao excluir a vitrine.');
      }
    } catch(err) {
      console.error(err);
    }
  };

  const translateRule = (rule: string) => {
    const rules: Record<string, string> = {
      'RECENT': 'Lançamentos Automáticos',
      'HIGH_STOCK': 'Maior Estoque (Mais Vendidos)',
      'CATEGORY': 'Filtrado por Categoria',
      'BRAND': 'Filtrado por Editora',
      'MANUAL': 'Seleção Manual'
    };
    return rules[rule] || rule;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <LayoutTemplate className="w-6 h-6 text-[var(--color-primary-base)]" />
            Vitrines da Loja
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie como os produtos aparecem para os clientes na página inicial (Home).
          </p>
        </div>
        
        <Link 
          href="/marketing/showcases/new"
          className="inline-flex items-center justify-center gap-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Nova Vitrine
        </Link>
      </div>

      {/* Info Alert */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 dark:bg-indigo-900/10 dark:border-indigo-800/30">
        <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-400">Limites de Exibição</h3>
          <p className="text-sm text-indigo-700/80 dark:text-indigo-300 mt-1">Você pode criar até 5 vitrines no total, mas apenas 3 podem ficar ativas na Home da loja simultaneamente.</p>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Carregando vitrines...</div>
        ) : showcases.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <LayoutTemplate className="w-12 h-12 text-slate-300 mb-4 dark:text-slate-700" />
            <p className="text-lg font-medium text-slate-900 dark:text-slate-300">Nenhuma vitrine configurada</p>
            <p className="text-sm">A página inicial da loja está usando o padrão listando catálogo geral.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-sm font-medium text-slate-500 dark:bg-slate-800/50 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-6 py-4">Nome da Vitrine</th>
                  <th className="px-6 py-4">Regra de Exibição</th>
                  <th className="px-6 py-4 text-center">Home</th>
                  <th className="px-6 py-4 text-center">Ordem</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {showcases.map((showcase) => (
                  <tr key={showcase.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                      {showcase.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {translateRule(showcase.rule_type)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {showcase.display_on_home ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold dark:bg-emerald-500/10 dark:text-emerald-400">
                          <Check className="w-3 h-3" /> Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold dark:bg-slate-800 dark:text-slate-400">
                          <X className="w-3 h-3" /> Oculta
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-mono text-slate-500">
                      #{showcase.display_order}
                    </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                           <Link href={`/marketing/showcases/${showcase.id}`} className="text-slate-400 hover:text-[var(--color-primary-base)] transition-colors p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg">
                             <Edit className="w-5 h-5" />
                           </Link>
                           <button onClick={() => handleDelete(showcase.id)} className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg">
                             <Trash2 className="w-5 h-5" />
                           </button>
                        </div>
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
