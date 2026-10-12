'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Coffee, 
  Clock, 
  CheckCircle2, 
  Play, 
  Check, 
  X, 
  RefreshCw, 
  Loader2, 
  AlertTriangle,
  User,
  UtensilsCrossed,
  Filter,
  Calendar,
  ChefHat,
  Bell,
  Send
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

interface KdsItem {
  id: number;
  tab_id: number;
  tab_number: string;
  table_number?: string;
  customer_name?: string;
  title: string;
  quantity: number;
  notes?: string;
  modifiers?: any[];
  category_name?: string;
  prep_sector?: 'BEVERAGE' | 'KITCHEN' | 'OTHER';
  prep_status: 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
  created_at: string;
  elapsed_minutes?: number;
  kitchen_alert?: string;
  kitchen_alert_at?: string;
  kitchen_alert_acknowledged?: boolean;
}

export default function CafeteriaKdsPage() {
  const [user, setUser] = useState<any>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [items, setItems] = useState<KdsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'>('ALL');
  const [sectorFilter, setSectorFilter] = useState<'ALL' | 'BEVERAGE' | 'KITCHEN' | 'OTHER'>('ALL');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Modal de Alerta da Cozinha/Barista para o Garçom
  const [itemToAlert, setItemToAlert] = useState<KdsItem | null>(null);
  const [alertMessage, setAlertMessage] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (currentUser?.company_id) {
      setCompanyId(currentUser.company_id);
    }
  }, []);

  const fetchKdsQueue = useCallback(async () => {
    if (!companyId) return;
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (sectorFilter !== 'ALL') {
        params.set('sector', sectorFilter);
      }
      if (dateFilter === 'custom' && customDate) {
        params.set('date', customDate);
      } else if (dateFilter !== 'all') {
        params.set('date', dateFilter);
      }

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/kds/queue${queryString}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setItems(await res.json());
      }
    } catch {
      // Falha silenciosa no auto-polling
    } finally {
      setLoading(false);
    }
  }, [companyId, statusFilter, sectorFilter, dateFilter, customDate]);

  // Polling automático a cada 10 segundos
  useEffect(() => {
    if (companyId) {
      fetchKdsQueue();
      const interval = setInterval(fetchKdsQueue, 10000);
      return () => clearInterval(interval);
    }
  }, [companyId, fetchKdsQueue]);

  // Atualizar status do pedido
  const handleUpdateStatus = async (itemId: number, newStatus: string) => {
    if (!companyId) return;
    setUpdatingId(itemId);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/kds/items/${itemId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prep_status: newStatus })
      });
      if (res.ok) {
        toast.success(
          newStatus === 'PREPARING'
            ? 'Preparo iniciado!'
            : newStatus === 'READY'
            ? 'Pedido marcado como Pronto!'
            : 'Entregue com sucesso!'
        );
        fetchKdsQueue();
      } else {
        toast.error('Erro ao atualizar status');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setUpdatingId(null);
    }
  };

  // Enviar alerta da Cozinha/Barista para o Garçom no salão
  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !itemToAlert || !alertMessage.trim()) return;
    setSendingAlert(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/kds/items/${itemToAlert.id}/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: alertMessage.trim() })
      });
      if (res.ok) {
        toast.success(`Alerta enviado com sucesso para o garçom!`);
        setItemToAlert(null);
        setAlertMessage('');
        fetchKdsQueue();
      } else {
        toast.error('Erro ao enviar alerta');
      }
    } catch {
      toast.error('Erro de conexão ao enviar alerta');
    } finally {
      setSendingAlert(false);
    }
  };

  const pendingCount = items.filter(i => i.prep_status === 'PENDING').length;
  const preparingCount = items.filter(i => i.prep_status === 'PREPARING').length;
  const readyCount = items.filter(i => i.prep_status === 'READY').length;
  const deliveredCount = items.filter(i => i.prep_status === 'DELIVERED').length;
  const cancelledCount = items.filter(i => i.prep_status === 'CANCELLED').length;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header do KDS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-600">
            <Coffee className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Fila de Barista & Cozinha (KDS)
              </h1>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Painel de preparo de cafés, lanches e bebidas em tempo real com auto-sync (10s)
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchKdsQueue()}
          className="p-2.5 self-start sm:self-auto rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-2 text-xs font-bold"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar Fila
        </button>
      </div>

      {/* Barra de Filtros: Período, Setor e Status */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
        {/* Filtros de Data */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              Período:
            </span>
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                dateFilter === 'today'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Hoje (Ao Vivo)
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('yesterday')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                dateFilter === 'yesterday'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Ontem
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                dateFilter === 'all'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Todas as Datas
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                if (e.target.value) setDateFilter('custom');
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {customDate && (
              <button
                type="button"
                onClick={() => {
                  setCustomDate('');
                  setDateFilter('today');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 p-1"
                title="Limpar data"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filtro por Setor de Preparo */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5 text-amber-500" />
            Setor:
          </span>
          <button
            type="button"
            onClick={() => setSectorFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              sectorFilter === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Todos os Setores
          </button>
          <button
            type="button"
            onClick={() => setSectorFilter('BEVERAGE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              sectorFilter === 'BEVERAGE'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            Barista / Bebidas
          </button>
          <button
            type="button"
            onClick={() => setSectorFilter('KITCHEN')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              sectorFilter === 'KITCHEN'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-orange-600/10 text-orange-700 dark:text-orange-400 hover:bg-orange-600/20'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            Cozinha / Lanches
          </button>
          <button
            type="button"
            onClick={() => setSectorFilter('OTHER')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              sectorFilter === 'OTHER'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            Balcão / Outros
          </button>
        </div>

        {/* Filtros de Status (Tabs rápidas com contadores) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5 text-amber-500" />
            Status:
          </span>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todos ({items.length})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              statusFilter === 'PENDING'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-amber-600'
            }`}
          >
            A Fazer ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('PREPARING')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              statusFilter === 'PREPARING'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-blue-600'
            }`}
          >
            Em Preparo ({preparingCount})
          </button>
          <button
            onClick={() => setStatusFilter('READY')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              statusFilter === 'READY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-emerald-600'
            }`}
          >
            Prontos ({readyCount})
          </button>
          <button
            onClick={() => setStatusFilter('DELIVERED')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              statusFilter === 'DELIVERED'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-purple-600'
            }`}
          >
            Entregues ({deliveredCount})
          </button>
          <button
            onClick={() => setStatusFilter('CANCELLED')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              statusFilter === 'CANCELLED'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-rose-600'
            }`}
          >
            Cancelados ({cancelledCount})
          </button>
        </div>
      </div>

      {/* Grid de Pedidos do Barista */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mb-3 text-amber-500" />
          <p className="text-sm font-medium">Carregando fila do barista...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3 opacity-80" />
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-200">Fila Limpa! Nenhum pedido pendente</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Novos pedidos lançados nas mesas ou no balcão aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const elapsed = item.elapsed_minutes || 0;
            const isLate = elapsed >= 15;
            const isWarning = elapsed >= 8 && elapsed < 15;

            return (
              <div
                key={item.id}
                className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between transition-all ${
                  item.prep_status === 'CANCELLED'
                    ? 'bg-rose-50/30 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/40 opacity-75'
                    : item.prep_status === 'DELIVERED'
                    ? 'bg-purple-50/20 dark:bg-purple-950/10 border-purple-200 dark:border-purple-900/40'
                    : item.prep_status === 'READY'
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                    : item.prep_status === 'PREPARING'
                    ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800'
                    : isLate
                    ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 animate-pulse'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  {/* Topo do Card: Mesa/Comanda + Setor + Cronômetro */}
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-1 text-xs font-black rounded-lg bg-amber-500 text-white shadow-sm">
                        {item.table_number ? `Mesa ${item.table_number}` : `Comanda #${item.tab_number}`}
                      </span>
                      <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md flex items-center gap-1 ${
                        item.prep_sector === 'KITCHEN'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300'
                          : item.prep_sector === 'OTHER'
                          ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}>
                        {item.prep_sector === 'KITCHEN' ? <ChefHat className="w-3 h-3" /> : item.prep_sector === 'OTHER' ? <UtensilsCrossed className="w-3 h-3" /> : <Coffee className="w-3 h-3" />}
                        {item.category_name || (item.prep_sector === 'KITCHEN' ? 'Cozinha' : item.prep_sector === 'OTHER' ? 'Balcão' : 'Barista')}
                      </span>
                      {item.customer_name && (
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <User className="h-3 w-3" /> {item.customer_name}
                        </span>
                      )}
                    </div>

                    <div className={`flex items-center gap-1 text-xs font-extrabold px-2 py-0.5 rounded-md ${
                      item.prep_status === 'CANCELLED'
                        ? 'text-rose-600 bg-rose-100 dark:bg-rose-900/40'
                        : item.prep_status === 'DELIVERED'
                        ? 'text-purple-600 bg-purple-100 dark:bg-purple-900/40'
                        : isLate
                        ? 'text-rose-600 bg-rose-100 dark:bg-rose-900/40'
                        : isWarning
                        ? 'text-amber-600 bg-amber-100 dark:bg-amber-900/40'
                        : 'text-slate-500 bg-slate-100 dark:bg-slate-800'
                    }`}>
                      <Clock className="h-3.5 w-3.5" />
                      <span>{elapsed} min</span>
                    </div>
                  </div>

                  {/* Detalhes do Produto */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-lg font-black text-amber-600 dark:text-amber-400">
                        {Number(item.quantity)}x
                      </span>
                      <h4 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                        {item.title}
                      </h4>
                    </div>

                    {/* Modificadores / Opcionais em Destaque */}
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 space-y-1">
                        <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                          Adicionais & Opcionais:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.modifiers.map((mod: any, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-200/70 dark:bg-amber-400/20 text-amber-900 dark:text-amber-200"
                            >
                              ★ {mod.option_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Observações do Cliente */}
                    {item.notes && (
                      <div className="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/40 flex items-start gap-1.5 text-xs text-yellow-800 dark:text-yellow-200">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 mt-0.5" />
                        <span className="font-semibold italic">Obs: {item.notes}</span>
                      </div>
                    )}

                    {/* Alerta Ativo Enviado pela Cozinha */}
                    {item.kitchen_alert && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400">
                          <span className="flex items-center gap-1">
                            <Bell className="w-3.5 h-3.5 animate-bounce" />
                            Alerta enviado ao garçom:
                          </span>
                          <span>
                            {item.kitchen_alert_acknowledged ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✔ Ciente no Salão</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-bold">⏳ Aguardando leitura</span>
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-rose-900 dark:text-rose-200 font-medium italic">
                          "{item.kitchen_alert}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Botões de Ação do KDS (Grandes e táteis para touch) */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                  {item.prep_status === 'PENDING' && (
                    <button
                      onClick={() => handleUpdateStatus(item.id, 'PREPARING')}
                      disabled={updatingId === item.id}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                    >
                      {updatingId === item.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                      Iniciar Preparo
                    </button>
                  )}

                  {item.prep_status === 'PREPARING' && (
                    <button
                      onClick={() => handleUpdateStatus(item.id, 'READY')}
                      disabled={updatingId === item.id}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                    >
                      {updatingId === item.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                      Marcar como Pronto
                    </button>
                  )}

                  {item.prep_status === 'READY' && (
                    <button
                      onClick={() => handleUpdateStatus(item.id, 'DELIVERED')}
                      disabled={updatingId === item.id}
                      className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-black text-sm shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      {updatingId === item.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                      Entregue na Mesa
                    </button>
                  )}

                  {item.prep_status === 'DELIVERED' && (
                    <div className="w-full py-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-purple-200 dark:border-purple-800">
                      <CheckCircle2 className="h-4 w-4" />
                      Item Entregue
                    </div>
                  )}

                  {item.prep_status === 'CANCELLED' && (
                    <div className="w-full py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-rose-200 dark:border-rose-800">
                      <X className="h-4 w-4" />
                      Pedido Cancelado
                    </div>
                  )}

                  {/* Botão de Avisar Garçom (Falta de Produto / Insumo) */}
                  {item.prep_status !== 'DELIVERED' && item.prep_status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setItemToAlert(item);
                        setAlertMessage(item.kitchen_alert || '');
                      }}
                      className="w-full py-2 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      {item.kitchen_alert ? 'Atualizar Alerta ao Garçom' : 'Avisar Garçom (Falta / Dúvida)'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── MODAL DE AVISO DA COZINHA/BARISTA AO GARÇOM ────────────────── */}
      {itemToAlert && (
        <div
          onClick={() => !sendingAlert && setItemToAlert(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  <Bell className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Avisar Garçom no Salão
                  </h3>
                  <p className="text-xs text-slate-500">
                    {itemToAlert.table_number ? `Mesa ${itemToAlert.table_number}` : `Comanda #${itemToAlert.tab_number}`} • {itemToAlert.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={sendingAlert}
                onClick={() => setItemToAlert(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sugestões rápidas de 1 toque */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Sugestões Rápidas:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  'Item esgotado / sem estoque no momento',
                  'Falta ingrediente (verificar alternativa com o cliente)',
                  'Tempo de preparo estendido (+15 minutos)',
                  'Por favor, compareça à copa/cozinha'
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAlertMessage(sug)}
                    className="text-left px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
                  >
                    • {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Formulário de Envio */}
            <form onSubmit={handleSendAlert} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mensagem de Alerta ao Garçom *
                </label>
                <textarea
                  required
                  rows={3}
                  value={alertMessage}
                  onChange={(e) => setAlertMessage(e.target.value)}
                  placeholder="Ex: Sem leite de aveia. Pergunte se o cliente aceita leite de amêndoas ou integral."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={sendingAlert}
                  onClick={() => setItemToAlert(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingAlert || !alertMessage.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {sendingAlert ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando Alerta...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Enviar Alerta ao Garçom
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
