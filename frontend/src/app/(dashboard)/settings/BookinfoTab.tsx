'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, BookOpen, Key, RefreshCw, Play, Bell } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from './layout';

export function BookinfoTab() {
  const { company } = useCompany();
  const currentUser = getUser();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    bookinfo_api_key: '',
    bookinfo_sync_enabled: false,
    bookinfo_purchase_auto: false,
    bookinfo_purchase_interval_minutes: 15,
    bookinfo_notify_processing_early: false,
  });

  useEffect(() => {
    async function fetchSettings() {
      if (!company) return;
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFormData({
            bookinfo_api_key: data.bookinfo_api_key || '',
            bookinfo_sync_enabled: data.bookinfo_sync_enabled || false,
            bookinfo_purchase_auto: data.bookinfo_purchase_auto || false,
            bookinfo_purchase_interval_minutes: data.bookinfo_purchase_interval_minutes || 15,
            bookinfo_notify_processing_early: data.bookinfo_notify_processing_early || false,
          });
        }
      } catch (e) {
        console.error('Erro ao buscar configurações do Bookinfo:', e);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, [company]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: name === 'bookinfo_purchase_interval_minutes' ? parseInt(value) || 15 : value
      }));
    }
  };

  const handleToggle = (name: string, currentVal: boolean) => {
    setFormData(prev => ({ ...prev, [name]: !currentVal }));
  };

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error('Falha ao salvar configurações do Bookinfo');
      toast.success('Configurações da Bookinfo atualizadas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !company) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-4">
        <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
          <BookOpen className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center justify-between">
            <span>Integração Bookinfo</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${formData.bookinfo_sync_enabled ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
              {formData.bookinfo_sync_enabled ? 'Ativa' : 'Inativa'}
            </span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure as chaves e os parâmetros de automação para integração de pedidos de venda e compra com o Hub Bookinfo.
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6 pt-2">
        {/* API Token Section */}
        <div className="bg-slate-50/50 dark:bg-slate-900/20 p-6 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
            <Key className="w-4 h-4 text-indigo-500" />
            <h3>Credenciais de Acesso</h3>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">Token API / Chave de Acesso (API Key)</label>
            <input
              type="password"
              name="bookinfo_api_key"
              value={formData.bookinfo_api_key}
              onChange={handleInputChange}
              placeholder="Digite o Token de Integração fornecido pela Bookinfo"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 outline-none transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Sync Controls */}
        <div className="grid grid-cols-1 gap-4">
          {/* Sincronização de Vendas */}
          <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-5 shadow-sm flex items-center justify-between transition-all hover:border-slate-300 dark:hover:border-slate-700">
            <div className="space-y-1 flex-1 pr-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Sincronização de Pedidos de Venda</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ativa a importação automática e manual de pedidos de venda originados do Bookinfo Hub para o Cronuz B2B.
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              <button 
                type="button"
                onClick={() => handleToggle('bookinfo_sync_enabled', formData.bookinfo_sync_enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${formData.bookinfo_sync_enabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.bookinfo_sync_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Automação de Compras */}
          <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-5 shadow-sm flex flex-col gap-4 transition-all hover:border-slate-300 dark:hover:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Transmissão Automática de Compras</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Habilita o agendamento em segundo plano para envio de novos pedidos de compra automaticamente para a Bookinfo.
                </p>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                <button 
                  type="button"
                  onClick={() => handleToggle('bookinfo_purchase_auto', formData.bookinfo_purchase_auto)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${formData.bookinfo_purchase_auto ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.bookinfo_purchase_auto ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {formData.bookinfo_purchase_auto && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Intervalo de Execução (em minutos)</label>
                  <input
                    type="number"
                    name="bookinfo_purchase_interval_minutes"
                    min={5}
                    max={1440}
                    value={formData.bookinfo_purchase_interval_minutes}
                    onChange={handleInputChange}
                    className="w-full max-w-[200px] rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Recomendado: 15 minutos. Mínimo: 5 minutos.</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Aviso Prévio de Processamento */}
          <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-5 shadow-sm flex items-center justify-between transition-all hover:border-slate-300 dark:hover:border-slate-700">
            <div className="space-y-1 flex-1 pr-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Aviso Prévio de Processamento</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Se ativo, avisa antes de faturar ou prosseguir com o processamento dos pedidos vinculados à Bookinfo no ERP.
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              <button 
                type="button"
                onClick={() => handleToggle('bookinfo_notify_processing_early', formData.bookinfo_notify_processing_early)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${formData.bookinfo_notify_processing_early ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.bookinfo_notify_processing_early ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/60">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 text-[15px] rounded-xl font-bold flex items-center gap-2 transition-all bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary-base)]/25 active:scale-[0.98] transform hover:scale-[1.02] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </form>
    </div>
  );
}
