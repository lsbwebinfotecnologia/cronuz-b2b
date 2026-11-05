'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Plus, 
  RefreshCw,
  SlidersHorizontal,
  ArrowUpDown,
  Filter,
  Package,
  Database,
  CheckCircle2,
  Loader2,
  Sparkles,
  Scale,
  ListTree
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { ProductImage } from '@/components/store/ProductImage';

export default function ProductsPage() {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [coverBaseUrl, setCoverBaseUrl] = useState<string | null>(null);
  const [coverSecondaryBaseUrl, setCoverSecondaryBaseUrl] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<number>(1);
  const [categoryId, setCategoryId] = useState<string>('');
  const [orderBy, setOrderBy] = useState<string>('name');
  const [categories, setCategories] = useState<any[]>([]);

  // Horus -> Cronuz Sync Configuration (Catálogo Local & Estoque Incremental)
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [syncingHorus, setSyncingHorus] = useState(false);
  const [savingSyncConfig, setSavingSyncConfig] = useState(false);
  const [loadingHorusChars, setLoadingHorusChars] = useState(false);
  const [horusApiPreview, setHorusApiPreview] = useState<any | null>(null);
  const [syncConfig, setSyncConfig] = useState({
    horus_enabled: false,
    horus_url: '',
    horus_port: '',
    horus_company: '',
    horus_branch: '',
    horus_stock_local: '',
    horus_legacy_pagination: false,
    b2c_active: false,
    local_products_count: 0,
    cod_tpo_caract: '',
    cod_caract: '',
    characteristic_type_name: '',
    characteristic_value: '',
    auto_collect_bookinfo_covers: false,
    max_items: 10000,
    last_sync_at: null as string | null,
    last_sync_data_ini: null as string | null,
    last_sync_data_fim: null as string | null,
    last_sync_mode: null as string | null,
    last_synced_count: 0,
    last_created_count: 0,
    last_updated_count: 0,
    last_stock_updated_count: 0,
    last_horus_api_summary: null as any | null,
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const skip = (page - 1) * limit;
      let url = `${apiBase}/products/?source=admin&skip=${skip}&limit=${limit}`;
      if (searchTerm) {
        url += `&search=${encodeURIComponent(searchTerm)}`;
      }
      if (categoryId) {
        url += `&category_id=${categoryId}`;
      }
      if (orderBy) {
        url += `&order_by=${orderBy}`;
      }
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setTotal(data.total || 0);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Falha ao carregar catálogo.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao buscar produtos.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncConfig = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/b2c/products/sync-config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSyncConfig(prev => ({
          ...prev,
          horus_enabled: Boolean(data.horus_enabled),
          horus_url: data.horus_url || '',
          horus_port: data.horus_port || '',
          horus_company: data.horus_company || '',
          horus_branch: data.horus_branch || '',
          horus_stock_local: data.horus_stock_local || '',
          horus_legacy_pagination: Boolean(data.horus_legacy_pagination),
          b2c_active: Boolean(data.b2c_active),
          local_products_count: Number(data.local_products_count || 0),
          cod_tpo_caract: data.cod_tpo_caract || '',
          cod_caract: data.cod_caract || '',
          characteristic_type_name: data.characteristic_type_name || '',
          characteristic_value: data.characteristic_value || '',
          auto_collect_bookinfo_covers: Boolean(data.auto_collect_bookinfo_covers),
          last_sync_at: data.last_sync_at || null,
          last_sync_data_ini: data.last_sync_data_ini || null,
          last_sync_data_fim: data.last_sync_data_fim || null,
          last_sync_mode: data.last_sync_mode || null,
          last_synced_count: Number(data.last_synced_count || 0),
          last_created_count: Number(data.last_created_count || 0),
          last_updated_count: Number(data.last_updated_count || 0),
          last_stock_updated_count: Number(data.last_stock_updated_count || 0),
          last_horus_api_summary: data.last_horus_api_summary || null,
        }));
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        const compId = decoded.company_id || 1;
        setCompanyId(compId);
        
        const res = await fetch(`${apiBase}/companies/${compId}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
           const data = await res.json();
           setCoverBaseUrl(data.cover_image_base_url || null);
           setCoverSecondaryBaseUrl(data.cover_image_secondary_base_url || null);
        }
        
        // Load categories
        const catRes = await fetch(`${apiBase}/categories/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(Array.isArray(catData) ? catData : (catData.items || []));
        }

        await fetchSyncConfig();
      } catch (e) {
        console.error("Error loading settings", e);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  const handleFilterChange = (setter: any) => (e: any) => {
    setter(e.target.value);
    setPage(1);
  };

  const handleSaveSyncConfigOnly = async (resetLastSync: boolean = false) => {
    setSavingSyncConfig(true);
    try {
      const payload: any = {
        cod_tpo_caract: syncConfig.cod_tpo_caract,
        cod_caract: syncConfig.cod_caract,
        auto_collect_bookinfo_covers: syncConfig.auto_collect_bookinfo_covers,
      };
      if (resetLastSync) {
        payload.custom_data_ini = '';
      }
      const res = await fetch(`${apiBase}/b2c/products/sync-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(resetLastSync ? 'Data de execução limpa! A próxima sincronia fará carga completa.' : (data.message || 'Parâmetros do Horus salvos!'));
        await fetchSyncConfig();
      } else {
        toast.error(data.detail || 'Erro ao salvar configuração.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao salvar configuração.');
    } finally {
      setSavingSyncConfig(false);
    }
  };

  const handleTestHorusApi = async () => {
    setLoadingHorusChars(true);
    try {
      const qs = new URLSearchParams();
      if (syncConfig.cod_tpo_caract) qs.set('cod_tpo_caract', syncConfig.cod_tpo_caract);
      if (syncConfig.cod_caract) qs.set('cod_caract', syncConfig.cod_caract);
      const qStr = qs.toString() ? `?${qs.toString()}` : '';
      const res = await fetch(`${apiBase}/b2c/products/horus-characteristics${qStr}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      setHorusApiPreview(data);
      if (res.ok && data.ok) {
        if (data.detected_type_name || data.detected_char_value) {
          setSyncConfig(prev => ({
            ...prev,
            characteristic_type_name: data.detected_type_name || prev.characteristic_type_name,
            characteristic_value: data.detected_char_value || prev.characteristic_value,
          }));
        }
        toast.success(
          `API Horus validada com sucesso! ${
            data.detected_type_name ? `Característica: ${data.detected_type_name} = ${data.detected_char_value}` : ''
          }`
        );
      } else {
        toast.error(data.warning || data.detail || 'O Horus retornou um alerta de parâmetros. Veja o retorno abaixo.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao consultar a API do Horus.');
    } finally {
      setLoadingHorusChars(false);
    }
  };

  const handleRunHorusSync = async (forceFullSync: boolean = false) => {
    setSyncingHorus(true);
    try {
      const res = await fetch(`${apiBase}/b2c/products/sync-horus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          cod_tpo_caract: syncConfig.cod_tpo_caract,
          cod_caract: syncConfig.cod_caract,
          auto_collect_bookinfo_covers: syncConfig.auto_collect_bookinfo_covers,
          full_sync: forceFullSync,
          max_items: 10000,
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Produtos e estoques sincronizados com sucesso!');
        if (data.horus_api_summary) {
          setHorusApiPreview({
            ok: true,
            pagination_mode: data.horus_api_summary.pagination,
            detected_type_name: data.characteristic_type_name,
            detected_char_value: data.characteristic_value,
            horus_raw_response: data.horus_api_summary,
          });
        }
        await fetchSyncConfig();
        setPage(1);
        await fetchProducts();
      } else {
        setHorusApiPreview({
          ok: false,
          warning: data.detail || 'Falha retornada pela API do Horus.',
          horus_raw_response: data,
        });
        toast.error(data.detail || 'Falha ao sincronizar produtos do Horus.');
      }
    } catch (e) {
      toast.error('Erro de conexão durante a sincronização com o Horus.');
    } finally {
      setSyncingHorus(false);
    }
  };

  useEffect(() => {
    if(!loading) {
      setPage(1);
      fetchProducts();
    }
  }, [categoryId, orderBy]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Produtos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie os produtos cadastrados no Cronuz (nome, descrição, preço, peso, dimensões, características e capas).
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSyncPanel(prev => !prev)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 border transition-all ${
              showSyncPanel
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-indigo-300'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200'
            }`}
          >
            <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Sincronizar do Horus
          </button>

          <Link 
            href="/products/new"
            className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Adicionar Produto
          </Link>
        </div>
      </div>

      {/* Painel de Sincronização de Produtos & Estoque Horus ERP -> Tabela Cronuz */}
      <AnimatePresence>
        {showSyncPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 shadow-sm p-5 sm:p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Sincronização de Produtos & Estoque Horus ERP → Cronuz
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Importa o cadastro e atualiza o saldo disponível respeitando os filtros de característica (<code className="font-mono">COD_TPO_CARACT</code> e <code className="font-mono">COD_CARACT</code>), paginação <code className="font-mono">OFFSET/LIMIT</code> e a data da última execução com sucesso (<code className="font-mono">DATA_INI</code> / <code className="font-mono">DATA_FIM</code>).
                  </p>
                </div>

                {/* Badges de Configuração Ativa do Seller no Horus */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-mono">
                    Paginação API: <b>{syncConfig.horus_legacy_pagination ? 'Sem OFFSET/LIMIT (Legado)' : 'Com OFFSET/LIMIT'}</b>
                  </span>
                  {(syncConfig.horus_company || syncConfig.horus_branch) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-mono">
                      SD_*: <b>Emp {syncConfig.horus_company || '-'} / Fil {syncConfig.horus_branch || '-'} / Loc {syncConfig.horus_stock_local || '-'}</b>
                    </span>
                  )}
                  {(syncConfig.characteristic_type_name || syncConfig.characteristic_value) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold">
                      Horus: {syncConfig.characteristic_type_name} = {syncConfig.characteristic_value}
                    </span>
                  )}
                </div>
              </div>

              {/* Parâmetros do Horus + Controle de Data de Execução com Sucesso */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Cód. Tipo Característica (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 3 (ou vazio se sem restrição)"
                    value={syncConfig.cod_tpo_caract}
                    onChange={(e) => setSyncConfig(prev => ({ ...prev, cod_tpo_caract: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Parâmetro <code className="font-mono">COD_TPO_CARACT</code> na API do Horus
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Cód. da Característica (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 235 (obrigatório se informar o Tipo)"
                    value={syncConfig.cod_caract}
                    onChange={(e) => setSyncConfig(prev => ({ ...prev, cod_caract: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Parâmetro <code className="font-mono">COD_CARACT</code> na API do Horus
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Última Execução com Sucesso
                    </span>
                    {syncConfig.last_sync_at && (
                      <button
                        type="button"
                        onClick={() => handleSaveSyncConfigOnly(true)}
                        className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 underline"
                        title="Limpa a data da última execução para forçar uma nova carga completa na próxima vez"
                      >
                        Resetar data
                      </button>
                    )}
                  </div>
                  {syncConfig.last_sync_at ? (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {new Date(syncConfig.last_sync_at).toLocaleString('pt-BR')}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Modo: <b>{syncConfig.last_sync_mode === 'INCREMENTAL' ? 'Incremental (DATA_INI/FIM)' : 'Carga Completa'}</b> •{' '}
                        {syncConfig.last_created_count} novos, {syncConfig.last_updated_count} cadastros, {syncConfig.last_stock_updated_count} estoques
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      Nenhuma execução registrada ainda. A 1ª sincronização fará a <b>Carga Completa</b> e gravará a data base para as próximas coletas incrementais.
                    </p>
                  )}
                </div>
              </div>

              {/* Box de Diagnóstico / Retorno Real da API Horus */}
              {(horusApiPreview || syncConfig.last_horus_api_summary) && (
                <div
                  className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                    horusApiPreview && horusApiPreview.ok === false
                      ? 'bg-rose-50/70 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200'
                      : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold uppercase tracking-wider text-[11px]">
                      Retorno da API do Horus ERP {horusApiPreview ? '(Teste / Última Operação)' : '(Última Sincronia)'}
                    </span>
                    {horusApiPreview && (
                      <button
                        type="button"
                        onClick={() => setHorusApiPreview(null)}
                        className="text-[11px] underline opacity-75 hover:opacity-100"
                      >
                        Ocultar retorno
                      </button>
                    )}
                  </div>

                  {horusApiPreview?.warning && (
                    <p className="font-semibold text-rose-700 dark:text-rose-300">
                      Mensagem do Horus: {horusApiPreview.warning}
                    </p>
                  )}

                  <pre className="text-[11px] font-mono bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-48">
                    {JSON.stringify(
                      horusApiPreview?.horus_raw_response || horusApiPreview || syncConfig.last_horus_api_summary,
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={syncConfig.auto_collect_bookinfo_covers}
                    onChange={(e) => setSyncConfig(prev => ({ ...prev, auto_collect_bookinfo_covers: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    Coletar capas automaticamente na <b>Bookinfo</b> (quando não houver capa no Horus/local)
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleTestHorusApi}
                    disabled={loadingHorusChars}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                  >
                    {loadingHorusChars ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListTree className="w-3.5 h-3.5" />}
                    Testar / Ver Retorno da API Horus
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveSyncConfigOnly(false)}
                    disabled={savingSyncConfig}
                    className="px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center gap-1.5"
                  >
                    {savingSyncConfig && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Salvar Parâmetros
                  </button>

                  {syncConfig.last_sync_at && (
                    <button
                      type="button"
                      onClick={() => handleRunHorusSync(true)}
                      disabled={syncingHorus}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                      title="Ignora a data da última execução e reimporta todos os produtos da característica no Horus"
                    >
                      {syncingHorus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                      Forçar Carga Completa
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRunHorusSync(false)}
                    disabled={syncingHorus}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {syncingHorus ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {syncingHorus
                      ? 'Sincronizando com o Horus...'
                      : syncConfig.last_sync_at
                        ? 'Sincronizar Alterações (Estoque & Cadastro)'
                        : 'Sincronizar Produtos do Horus'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
        
        {/* Superior Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between bg-slate-50/50 dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center gap-3 flex-1 min-w-[300px]">
            <button onClick={fetchProducts} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300">
              <RefreshCw className="h-4 w-4" />
            </button>
            <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Procurar por Nome, ISBN ou SKU..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-700 dark:text-white placeholder:text-slate-400"
              />
            </form>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">
              <ArrowUpDown className="h-4 w-4 text-slate-400" /> 
              <select 
                value={orderBy} 
                onChange={handleFilterChange(setOrderBy)}
                className="bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
              >
                <option value="name">A-Z</option>
                <option value="name_desc">Z-A</option>
                <option value="sku">SKU</option>
                <option value="price">Menor Preço</option>
                <option value="price_desc">Maior Preço</option>
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300">
              <Filter className="h-4 w-4 text-slate-400" />
              <select 
                value={categoryId} 
                onChange={handleFilterChange(setCategoryId)}
                className="bg-transparent border-none outline-none focus:ring-0 cursor-pointer w-28 truncate"
              >
                <option value="">Todas</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="px-3 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg font-medium ml-2 dark:bg-slate-800 dark:text-slate-300">
               {total > 0 ? `${(page - 1) * limit + 1} - ${Math.min(page * limit, total)} de ${total}` : '0 registros'}
            </div>
            {/* Pagination Controls */}
            <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
               <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-300 dark:hover:bg-slate-800"
               >
                 &larr;
               </button>
               <div className="w-px h-5 bg-slate-200 dark:bg-slate-700"></div>
               <button 
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= total}
                className="px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-slate-300 dark:hover:bg-slate-800"
               >
                 &rarr;
               </button>
            </div>
          </div>
        </div>

        {/* Datagrid / Table */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--color-primary-base)]/50 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400 dark:border-[var(--color-primary-base)]/30">
                <th className="p-4 w-12 text-center">
                   <input type="checkbox" className="rounded border-slate-300 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)]" />
                </th>
                <th className="p-4 whitespace-nowrap hidden sm:table-cell">Capa</th>
                <th className="p-4 whitespace-nowrap">Nome / Editora</th>
                <th className="p-4 whitespace-nowrap">ISBN / SKU</th>
                <th className="p-4 whitespace-nowrap hidden md:table-cell">Peso & Dimensões</th>
                <th className="p-4 whitespace-nowrap">Preço</th>
                <th className="p-4 whitespace-nowrap text-center">Saldo / Estoque</th>
                <th className="p-4 whitespace-nowrap text-right pr-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="h-6 w-6 animate-spin text-slate-400 mb-2" />
                      Carregando catálogo...
                    </div>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                      <Package className="h-10 w-10 text-slate-300 mb-3 dark:text-slate-600" />
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Nenhum produto listado na base local do Cronuz.</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Clique em <b>Sincronizar do Horus</b> no topo da página para configurar a característica e importar os produtos do Horus ERP, ou adicione manualmente.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={product.id}
                    onClick={() => router.push(`/products/${product.id}`)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer dark:hover:bg-slate-800/50"
                  >
                    <td className="p-4 text-center">
                      <input type="checkbox" onClick={(e) => e.stopPropagation()} className="rounded border-slate-300 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)] dark:border-slate-700 dark:bg-slate-950" />
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <div className="w-12 h-16 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700 relative overflow-hidden">
                        <ProductImage 
                          eanGtin={product.ean_gtin} 
                          alt={product.name}
                          baseUrl={coverBaseUrl}
                          secondaryBaseUrl={coverSecondaryBaseUrl}
                          companyIdProp={companyId}
                          coverUrl={product.cover_url}
                          className="w-full h-full object-contain p-0.5"
                          iconClassName="h-5 w-5 text-slate-400"
                        />
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        {product.brand_rel?.name || product.brand || 'Sem editora/marca'}
                        {product.model ? ` • ${product.model}` : ''}
                      </p>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 font-mono">{product.ean_gtin || 'Sem ISBN'}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          Cód. Horus: {product.horus_cod_item || product.sku}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex flex-col text-xs text-slate-600 dark:text-slate-400 font-mono">
                        <span>Peso: {product.weight_kg ? `${Number(product.weight_kg).toFixed(3)} kg` : '—'}</span>
                        <span>
                          Dim: {product.width_cm || product.height_cm || product.length_cm
                            ? `${product.width_cm || 0}x${product.height_cm || 0}x${product.length_cm || 0} cm`
                            : '—'}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        {product.promotional_price && product.promotional_price < product.base_price ? (
                          <>
                            <span className="text-xs text-slate-400 line-through dark:text-slate-500">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.base_price || 0)}
                            </span>
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.promotional_price)}
                            </span>
                          </>
                        ) : (
                           <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                             {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.base_price || 0)}
                           </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {Number(product.stock_quantity ?? product.stock ?? 0) > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {Number(product.stock_quantity ?? product.stock ?? 0)} un.
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          0 (Avise-me)
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right pr-6">
                      <span className={`text-sm font-bold ${product.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {product.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
