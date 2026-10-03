'use client';

import { useState, useEffect } from 'react';
import { 
  Store, 
  Plus, 
  CheckCircle2, 
  Calendar, 
  X, 
  Loader2, 
  Lock, 
  Sparkles,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

export interface POSSessionData {
  id: number;
  code: string;
  title: string;
  status: string;
  catalog_source: string;
  source_reference?: string;
  branch_id?: number;
  branch_name?: string;
  validate_stock?: boolean;
  initial_cash_amount?: number;
  closed_cash_amount?: number;
  expected_cash_amount?: number;
  cash_difference?: number;
  closing_notes?: string;
  products_count?: number;
  customer_name?: string;
  total_sales_count: number;
  total_sales_amount: number;
  opened_at: string;
  closed_at?: string;
}

export interface POSBranch {
  id: number;
  nome: string;
  cod_empresa: string;
  cod_filial: string;
  cod_local?: string;
  active: boolean;
}

interface POSSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: POSSessionData | null;
  onSelectSession: (session: POSSessionData | null) => void;
}

export default function POSSessionModal({
  isOpen,
  onClose,
  activeSession,
  onSelectSession
}: POSSessionModalProps) {
  const [sessions, setSessions] = useState<POSSessionData[]>([]);
  const [branches, setBranches] = useState<POSBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCatalogSource, setNewCatalogSource] = useState<'GENERAL' | 'SPREADSHEET' | 'CONSIGNMENT' | 'HORUS_REALTIME'>('GENERAL');
  const [newSourceReference, setNewSourceReference] = useState('');
  const [newValidateStock, setNewValidateStock] = useState<boolean>(true);
  const [newInitialCash, setNewInitialCash] = useState<string>('0.00');
  const [creating, setCreating] = useState(false);

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  useEffect(() => {
    if (isOpen && companyId) {
      fetchSessions();
      fetchBranches();
    }
  }, [isOpen, companyId]);

  async function fetchBranches() {
    try {
      setLoadingBranches(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/branches`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setBranches(data);
        if (data.length > 0 && !selectedBranchId) {
          setSelectedBranchId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Falha ao carregar filiais do PDV:', e);
    } finally {
      setLoadingBranches(false);
    }
  }

  async function fetchSessions() {
    try {
      setLoading(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSession() {
    if (!newTitle.trim()) {
      toast.error('Informe o nome do evento / sessão');
      return;
    }
    if (newCatalogSource === 'HORUS_REALTIME' && !selectedBranchId) {
      toast.error('Selecione uma filial para a pesquisa no Horus');
      return;
    }
    try {
      setCreating(true);
      const token = getToken();
      const initialCashNum = parseFloat(newInitialCash.replace(',', '.') || '0');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: newTitle.trim(),
            catalog_source: newCatalogSource,
            source_reference: newSourceReference.trim() || undefined,
            branch_id: newCatalogSource === 'HORUS_REALTIME' ? selectedBranchId : undefined,
            validate_stock: newValidateStock,
            initial_cash_amount: isNaN(initialCashNum) ? 0 : initialCashNum,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao criar sessão');
      }
      const created = await res.json();
      toast.success(`Sessão "${created.title}" iniciada!`);
      onSelectSession(created);
      setNewTitle('');
      setNewCatalogSource('GENERAL');
      setNewSourceReference('');
      setNewValidateStock(true);
      setNewInitialCash('0.00');
      setShowCreateForm(false);
      fetchSessions();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao abrir sessão');
    } finally {
      setCreating(false);
    }
  }

  async function handleCloseSession(sessionId: number) {
    if (!confirm('Deseja realmente fechar esta sessão de PDV?')) return;
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/pos/sessions/${sessionId}/close`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        toast.info('Sessão encerrada com sucesso.');
        if (activeSession?.id === sessionId) {
          onSelectSession(null);
        }
        fetchSessions();
      }
    } catch (e) {
      toast.error('Erro ao fechar sessão');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sessões & Eventos de Venda</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Organize e agrupe as vendas do PDV por feira, bienal ou caixa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* Active Session Card */}
          {activeSession ? (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Sessão Ativa no Momento
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeSession.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeSession.code} • Aberta em {new Date(activeSession.opened_at).toLocaleDateString('pt-BR')}
                  </p>
                  {activeSession.branch_name && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                      📍 Filial: {activeSession.branch_name}
                    </span>
                  )}
                  {activeSession.catalog_source === 'HORUS_REALTIME' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
                      ⚡ Consulta em Tempo Real
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {activeSession.products_count ?? 0} produtos vinculados
                    </span>
                  )}
                  {activeSession.validate_stock !== false ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      🛡️ Valida Estoque
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      ⚡ Venda Livre (Sem Trava)
                    </span>
                  )}
                  {Number(activeSession.initial_cash_amount || 0) > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      💵 Fundo: R$ {Number(activeSession.initial_cash_amount).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => onSelectSession(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300"
              >
                Desvincular
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span>Nenhuma sessão específica vinculada. As vendas são salvas como vendas gerais do PDV.</span>
            </div>
          )}

          {/* Create Button / Form */}
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4 text-emerald-500" />
              Abrir Nova Sessão / Evento
            </button>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                Nova Sessão / Evento
              </h4>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nome do Evento / Caixa
                </label>
                <input
                  type="text"
                  placeholder="Ex: Bienal do Livro 2026 - Estande Principal"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Origem Principal dos Produtos
                </label>
                <select
                  value={newCatalogSource}
                  onChange={(e: any) => setNewCatalogSource(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="GENERAL">Catálogo Geral da Editora</option>
                  <option value="HORUS_REALTIME">Consulta em Tempo Real no Horus (por Filial)</option>
                  <option value="SPREADSHEET">Planilha Excel/CSV (Importar no PDV)</option>
                  <option value="CONSIGNMENT">Contrato de Consignação Horus</option>
                </select>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  {newCatalogSource === 'HORUS_REALTIME' && 'Busca produtos e consulta preço de venda e saldo de estoque em tempo real na API do Horus (Busca_Acervo + Estoque) para a filial selecionada.'}
                  {newCatalogSource === 'SPREADSHEET' && 'Após abrir a sessão, utilize o botão "Carga de Produtos / Offline" para subir sua planilha. Os produtos ficarão gravados nesta sessão e carregarão automaticamente nos celulares!'}
                  {newCatalogSource === 'CONSIGNMENT' && 'Após abrir a sessão, utilize "Carga de Produtos / Offline" para puxar os itens do contrato de consignação.'}
                  {newCatalogSource === 'GENERAL' && 'Usa os produtos ativos cadastrados no sistema.'}
                </p>
              </div>

              {newCatalogSource === 'HORUS_REALTIME' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Filial para Consulta de Estoque / Saldo no Horus *
                  </label>
                  {loadingBranches ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando filiais...
                    </div>
                  ) : branches.length === 0 ? (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                      Nenhuma filial ativa encontrada. Configure as filiais em Logística Horus → Filiais do Seller.
                    </div>
                  ) : (
                    <select
                      value={selectedBranchId || ''}
                      onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome} (Empresa: {b.cod_empresa} / Filial: {b.cod_filial})
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Ao consultar ou bipar produtos nesta sessão, o saldo de estoque será obtido desta filial em tempo real.
                  </p>
                </div>
              )}

              {newCatalogSource === 'CONSIGNMENT' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Número / Referência do Contrato (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CTR-2026-0042"
                    value={newSourceReference}
                    onChange={(e) => setNewSourceReference(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              {/* Validação de Saldo de Estoque */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Validar Saldo de Estoque?
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {newValidateStock 
                        ? 'Sim — Bloqueia a venda se o produto não possuir estoque suficiente.' 
                        : 'Não — Permite vender livremente mesmo com estoque zerado.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewValidateStock(!newValidateStock)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      newValidateStock ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        newValidateStock ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Fundo de Troco Inicial */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Fundo de Troco Inicial (Dinheiro em Gaveta)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newInitialCash}
                    onChange={(e) => setNewInitialCash(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Suprimento de dinheiro inserido no caixa na abertura para troco.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={creating}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirmar e Abrir
                </button>
              </div>
            </div>
          )}

          {/* Sessions List */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold uppercase text-slate-400">
              Histórico de Sessões
            </h4>
            {loading ? (
              <div className="py-8 flex justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Nenhuma sessão registrada.</p>
            ) : (
              sessions.map((s) => {
                const isActive = activeSession?.id === s.id;
                const isClosed = s.status === 'CLOSED';
                const pCount = s.products_count ?? 0;

                const sourceLabel = 
                  s.catalog_source === 'HORUS_REALTIME' ? 'Horus Tempo Real' :
                  s.catalog_source === 'SPREADSHEET' ? 'Planilha Excel' :
                  s.catalog_source === 'CONSIGNMENT' ? 'Contrato Consignação' : 'Geral';

                return (
                  <div
                    key={s.id}
                    className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {s.title}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isClosed
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {isClosed ? 'Fechada' : 'Aberta'}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {sourceLabel}
                        </span>
                        {s.branch_name && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            📍 {s.branch_name}
                          </span>
                        )}
                        {pCount > 0 && s.catalog_source !== 'HORUS_REALTIME' && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {pCount} produtos
                          </span>
                        )}
                        {s.validate_stock !== false ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            🛡️ Valida Estoque
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            ⚡ Venda Livre
                          </span>
                        )}
                        {Number(s.initial_cash_amount || 0) > 0 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            💵 R$ {Number(s.initial_cash_amount).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {s.code} • {s.total_sales_count} vendas (R$ {Number(s.total_sales_amount || 0).toFixed(2)})
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {!isClosed && !isActive && (
                        <button
                          onClick={() => {
                            onSelectSession(s);
                            onClose();
                          }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
                        >
                          Ativar
                        </button>
                      )}
                      {!isClosed && (
                        <button
                          onClick={() => handleCloseSession(s.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                          title="Fechar sessão"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
