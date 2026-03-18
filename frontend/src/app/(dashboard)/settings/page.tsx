'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings2, Loader2, Save, Store, MonitorSmartphone, Receipt } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const currentUser = getUser();
  const companyId = currentUser?.company_id;

  const [settings, setSettings] = useState({
    pdv_type: 'NON_FISCAL',
    horus_api_mode: 'B2B',
    allow_backorder: false,
    max_backorder_qty: 0,
    pdv_allow_out_of_stock: false,
    cover_image_base_url: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar configurações');
      const data = await res.json();
      setSettings(prev => ({
        ...prev,
        pdv_type: data.pdv_type || 'NON_FISCAL',
        horus_api_mode: data.horus_api_mode || 'B2B',
        allow_backorder: data.allow_backorder || false,
        max_backorder_qty: data.max_backorder_qty || 0,
        pdv_allow_out_of_stock: data.pdv_allow_out_of_stock || false,
        cover_image_base_url: data.cover_image_base_url || '',
      }));
    } catch (error) {
      toast.error('Erro ao carregar as configurações.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (!res.ok) throw new Error('Falha ao salvar configurações');
      toast.success('Configurações atualizadas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-[var(--color-primary-base)]" />
          Configurações da Empresa
        </h1>
        <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
          Gerencie as preferências e parâmetros operacionais do seu negócio.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800"
      >
        <form onSubmit={handleSaveSettings}>
          <div className="p-6 md:p-8 space-y-8">
            {/* Seção PDV */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="p-2 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] rounded-lg">
                  <MonitorSmartphone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ponto de Venda (PDV)</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Configure o comportamento da sua frente de caixa.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 ${settings.pdv_type === 'NON_FISCAL' ? 'border-[var(--color-primary-base)] bg-[var(--color-primary-base)]/5 ring-1 ring-[var(--color-primary-base)]' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input
                    type="radio"
                    name="pdv_type"
                    value="NON_FISCAL"
                    className="sr-only"
                    checked={settings.pdv_type === 'NON_FISCAL'}
                    onChange={() => setSettings({ ...settings, pdv_type: 'NON_FISCAL' })}
                  />
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${settings.pdv_type === 'NON_FISCAL' ? 'bg-[var(--color-primary-base)]/20 text-[var(--color-primary-base)]' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        <Store className="h-5 w-5" />
                      </div>
                      <div className="text-sm">
                        <p className={`font-medium ${settings.pdv_type === 'NON_FISCAL' ? 'text-[var(--color-primary-base)]' : 'text-slate-900 dark:text-white'}`}>PDV Não-Fiscal</p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-normal break-words pr-4">Gerencie vendas como pedidos internos, sem emissão direta de NFC-e pela plataforma.</p>
                      </div>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border shrink-0 ${settings.pdv_type === 'NON_FISCAL' ? 'border-[var(--color-primary-base)] bg-[var(--color-primary-base)]' : 'border-slate-300 dark:border-slate-600'}`}>
                      {settings.pdv_type === 'NON_FISCAL' && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </label>

                <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 opacity-60`}>
                  <input
                    type="radio"
                    name="pdv_type"
                    value="FISCAL"
                    disabled
                    className="sr-only"
                    checked={settings.pdv_type === 'FISCAL'}
                    onChange={() => setSettings({ ...settings, pdv_type: 'FISCAL' })}
                  />
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div className="text-sm relative">
                        <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                          PDV Frente de Caixa Fiscal
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">EM BREVE</span>
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">Emissão automática de Cupom Fiscal Eletrônico (NFC-e e SAT).</p>
                      </div>
                    </div>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                  </div>
                </label>
              </div>
            </div>

            {/* Integração Horus */}
            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Integração Horus (Catálogo e Preços)</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Defina qual arquitetura a loja utilizará para buscar os produtos.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 ${settings.horus_api_mode === 'B2B' ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input
                    type="radio"
                    name="horus_api_mode"
                    value="B2B"
                    className="sr-only"
                    checked={settings.horus_api_mode === 'B2B'}
                    onChange={() => setSettings({ ...settings, horus_api_mode: 'B2B' })}
                  />
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-sm">
                        <p className={`font-medium ${settings.horus_api_mode === 'B2B' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>Utilizar B2B Horus</p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-normal break-words pr-4">Exige que o Vendedor do PDV identifique o cliente logado e respeita tabelas de preços/descontos configurados no ID_GUID.</p>
                      </div>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border shrink-0 ${settings.horus_api_mode === 'B2B' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                      {settings.horus_api_mode === 'B2B' && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </label>

                <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 ${settings.horus_api_mode === 'STANDARD' ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input
                    type="radio"
                    name="horus_api_mode"
                    value="STANDARD"
                    className="sr-only"
                    checked={settings.horus_api_mode === 'STANDARD'}
                    onChange={() => setSettings({ ...settings, horus_api_mode: 'STANDARD' })}
                  />
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-sm">
                        <p className={`font-medium ${settings.horus_api_mode === 'STANDARD' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>Utilizar API Padrão Horus</p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-normal break-words pr-4">O vendedor pesquisa no acervo da filial sem atrelar limites ou tabelas de desconto exclusivas do B2B.</p>
                      </div>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border shrink-0 ${settings.horus_api_mode === 'STANDARD' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                      {settings.horus_api_mode === 'STANDARD' && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </label>
              </div>
            </div>
            
            {/* Configurações de Estoque B2B */}
            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Configurações de Estoque do PDV</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Regras de negócio para produtos sem saldo disponível no ERP (Encomendas).</p>
                  </div>
                </div>
                <label className="relative flex items-center cursor-pointer shrink-0">
                  <span className="mr-3 text-sm font-medium text-slate-700 dark:text-slate-300">Vender sem Saldo / Encomendar no B2B</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={settings.allow_backorder} onChange={e => setSettings({ ...settings, allow_backorder: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 dark:bg-slate-700 dark:border-slate-600"></div>
                  </div>
                </label>
              </div>

              {settings.allow_backorder && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-1.5 pt-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                    Qtd. Máxima para Encomendar no Portal B2B
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-2 dark:bg-slate-800 dark:text-slate-400">Por Item</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full max-w-sm bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-amber-500/50 dark:placeholder:text-slate-600"
                    placeholder="Ex: 50 ou 0 para ilimitado"
                    value={settings.max_backorder_qty === 0 ? '' : settings.max_backorder_qty}
                    onChange={e => setSettings({ ...settings, max_backorder_qty: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Se configurado como 0, o cliente poderá encomendar quantidades ilimitadas de itens sem estoque.
                  </p>
                </motion.div>
              )}
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-2">
                <div className="flex items-center gap-2">
                   <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">Exclusivo PDV</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Permite adicionar livros sem saldo no carrinho do sistema de PDV local.</p>
                  </div>
                </div>
                <label className="relative flex items-center cursor-pointer shrink-0">
                  <span className="mr-3 text-sm font-medium text-indigo-600 dark:text-indigo-400">Vender sem Saldo no PDV</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={settings.pdv_allow_out_of_stock} onChange={e => setSettings({ ...settings, pdv_allow_out_of_stock: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 dark:bg-slate-700 dark:border-slate-600"></div>
                  </div>
                </label>
              </div>
            </div>

            {/* Configurações Gerais */}
            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Configurações Gerais</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Configurações estáticas de exibição e integração de catálogo.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Servidor Local de Capas (Base URL)</label>
                <input
                  type="url"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-[var(--color-primary-base)]/50 dark:placeholder:text-slate-600"
                  placeholder="https://capas.cronuz.com.br"
                  value={settings.cover_image_base_url}
                  onChange={e => setSettings({ ...settings, cover_image_base_url: e.target.value })}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Caminho do diretório base que contém as imagens dos produtos, que serão consultadas via <b>ISBN.jpg</b> (ex: https://capas.site.com.br/978...jpg).
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-200 dark:bg-slate-900/60 dark:border-slate-800/60 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Salvar Parâmetros
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
