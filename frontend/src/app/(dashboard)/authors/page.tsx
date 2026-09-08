'use client';

import { useState, useEffect, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Search, Plus, Mail, ShieldCheck, CheckCircle2, 
  AlertCircle, Clock, Send, RefreshCw, Loader2, ExternalLink,
  Filter, Eye, Copy, X, Check, BookOpen, Feather, Sparkles
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface Author {
  id: number;
  cod_fornecedor: number;
  id_guid: string;
  id_doc: string;
  nome: string;
  nome_fantasia?: string;
  cnpj?: string;
  cpf?: string;
  emailb2b: string;
  end_email?: string;
  num_telefone?: string;
  classificacao_autor: string;
  status: 'PENDENTE_ATIVACAO' | 'ATIVO' | 'INATIVO';
  b2b_mostrar_vendas: string;
  b2b_mostrar_da: string;
  last_login_at?: string;
  created_at: string;
}

interface HorusAuthor {
  COD_EMPRESA?: number;
  COD_FILIAL?: number;
  COD_FORNECEDOR: number;
  NOM_FORNECEDOR: string;
  NOM_FANTASIA?: string;
  CNPJ?: string;
  CPF?: string;
  INSC_ESTADUAL?: string;
  END_EMAIL?: string;
  EMAILB2B?: string;
  NUM_TELEFONE?: string;
  ID_GUID: string;
  B2B_MOSTRAR_VENDAS?: string;
  B2B_MOSTRAR_DA?: string;
}

const CLASSIFICACOES = [
  'Autor Principal',
  'Coautor',
  'Organizador',
  'Tradutor',
  'Ilustrador',
  'Prefaciador',
  'Colaborador',
  'Outro'
];

export default function AuthorsManagementPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Modal de Busca no Horus
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [horusSearch, setHorusSearch] = useState('');
  const [horusLoading, setHorusLoading] = useState(false);
  const [horusResults, setHorusResults] = useState<HorusAuthor[]>([]);
  
  // Autor Selecionado para Vínculo
  const [selectedHorusAuthor, setSelectedHorusAuthor] = useState<HorusAuthor | null>(null);
  const [formEmailB2B, setFormEmailB2B] = useState('');
  const [formClassificacao, setFormClassificacao] = useState('Autor Principal');
  const [formSendEmailNow, setFormSendEmailNow] = useState(true);
  const [savingAuthor, setSavingAuthor] = useState(false);

  // Ação de disparo de e-mail
  const [triggeringEmailId, setTriggeringEmailId] = useState<number | null>(null);
  const [lastActivationUrl, setLastActivationUrl] = useState<{ id: number; url: string } | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchAuthors = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (search) params.append('search', search);

      const res = await fetch(`${API_URL}/authors?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuthors(data.items || []);
      }
    } catch (e) {
      toast.error('Erro ao carregar lista de autores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthors();
  }, [statusFilter]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchAuthors();
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Busca de autores no Horus
  const handleHorusSearch = async () => {
    if (!horusSearch.trim()) return;
    setHorusLoading(true);
    setSelectedHorusAuthor(null);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        nom_fornecedor: horusSearch.trim()
      });
      const res = await fetch(`${API_URL}/authors/horus/search?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHorusResults(data || []);
        if (data.length === 0) {
          toast.info('Nenhum autor encontrado no Hórus com este termo.');
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao consultar o Hórus.');
      }
    } catch (e) {
      toast.error('Falha de conexão com a API.');
    } finally {
      setHorusLoading(false);
    }
  };

  const handleSelectHorusAuthor = (author: HorusAuthor) => {
    setSelectedHorusAuthor(author);
    setFormEmailB2B(author.EMAILB2B || author.END_EMAIL || '');
    setFormClassificacao('Autor Principal');
  };

  const handleSaveAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHorusAuthor) return;
    if (!formEmailB2B.trim()) {
      toast.error('O e-mail de acesso B2B é obrigatório.');
      return;
    }

    setSavingAuthor(true);
    try {
      const token = getToken();
      const idDoc = (selectedHorusAuthor.CNPJ || selectedHorusAuthor.CPF || '').replace(/\D/g, '');

      const payload = {
        cod_empresa: selectedHorusAuthor.COD_EMPRESA,
        cod_filial: selectedHorusAuthor.COD_FILIAL,
        cod_fornecedor: selectedHorusAuthor.COD_FORNECEDOR,
        id_guid: selectedHorusAuthor.ID_GUID,
        id_doc: idDoc,
        nome: selectedHorusAuthor.NOM_FORNECEDOR,
        nome_fantasia: selectedHorusAuthor.NOM_FANTASIA,
        cnpj: selectedHorusAuthor.CNPJ,
        cpf: selectedHorusAuthor.CPF,
        insc_estadual: selectedHorusAuthor.INSC_ESTADUAL,
        num_telefone: selectedHorusAuthor.NUM_TELEFONE,
        end_email: selectedHorusAuthor.END_EMAIL,
        emailb2b: formEmailB2B.trim().toLowerCase(),
        classificacao_autor: formClassificacao,
        b2b_mostrar_vendas: selectedHorusAuthor.B2B_MOSTRAR_VENDAS || 'S',
        b2b_mostrar_da: selectedHorusAuthor.B2B_MOSTRAR_DA || 'N',
        send_activation_email: formSendEmailNow
      };

      const res = await fetch(`${API_URL}/authors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success('Autor vinculado com sucesso!');
        setIsModalOpen(false);
        setSelectedHorusAuthor(null);
        setHorusSearch('');
        setHorusResults([]);
        fetchAuthors();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao vincular autor.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao salvar autor.');
    } finally {
      setSavingAuthor(false);
    }
  };

  const handleSendActivation = async (authorId: number) => {
    setTriggeringEmailId(authorId);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/authors/${authorId}/send-activation`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'E-mail disparado!');
        if (data.activation_url) {
          setLastActivationUrl({ id: authorId, url: data.activation_url });
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao disparar e-mail de ativação.');
      }
    } catch (e) {
      toast.error('Falha de rede ao disparar e-mail.');
    } finally {
      setTriggeringEmailId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Link de ativação copiado!');
  };

  const maskDoc = (doc?: string) => {
    if (!doc) return '—';
    const clean = doc.replace(/\D/g, '');
    if (clean.length === 11) {
      return `${clean.slice(0, 3)}.***.***-${clean.slice(-2)}`;
    }
    if (clean.length === 14) {
      return `${clean.slice(0, 2)}.***.***/${clean.slice(8, 12)}-${clean.slice(-2)}`;
    }
    return doc;
  };

  const getStatusBadge = (status: Author['status']) => {
    switch (status) {
      case 'ATIVO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
            <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
          </span>
        );
      case 'PENDENTE_ATIVACAO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40">
            <Clock className="w-3.5 h-3.5" /> Pendente Ativação
          </span>
        );
      case 'INATIVO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <AlertCircle className="w-3.5 h-3.5" /> Inativo
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Feather className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Gestão de Autores
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Vincule e gerencie os autores parceiros para acesso ao Portal do Autor integrado ao Horus ERP.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
            setSelectedHorusAuthor(null);
            setHorusSearch('');
            setHorusResults([]);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm transition-all duration-150 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Vincular Autor do Hórus
        </button>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou documento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-700 dark:text-slate-200 font-medium"
          >
            <option value="">Todos os Status</option>
            <option value="PENDENTE_ATIVACAO">Pendente Ativação</option>
            <option value="ATIVO">Ativo</option>
            <option value="INATIVO">Inativo</option>
          </select>

          <button
            onClick={fetchAuthors}
            title="Atualizar lista"
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabela de Autores */}
      <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-medium">
              <tr>
                <th className="px-5 py-3.5">Autor</th>
                <th className="px-5 py-3.5">E-mail B2B</th>
                <th className="px-5 py-3.5">Documento</th>
                <th className="px-5 py-3.5">Classificação</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-amber-500" />
                    Carregando autores...
                  </td>
                </tr>
              ) : authors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-slate-400">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                      <Feather className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">Nenhum autor vinculado</p>
                    <p className="text-xs text-slate-500 mt-1">Clique em "Vincular Autor do Hórus" para importar seus primeiros autores.</p>
                  </td>
                </tr>
              ) : (
                authors.map((author) => (
                  <tr key={author.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {author.nome}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          ID Horus: {author.cod_fornecedor}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                        {author.emailb2b}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        {maskDoc(author.id_doc)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {author.classificacao_autor}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {getStatusBadge(author.status)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {lastActivationUrl && lastActivationUrl.id === author.id && (
                          <button
                            onClick={() => copyToClipboard(lastActivationUrl.url)}
                            title="Copiar link de primeiro acesso"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                          >
                            <Copy className="w-3 h-3" /> Copiar Link
                          </button>
                        )}

                        <button
                          onClick={() => handleSendActivation(author.id)}
                          disabled={triggeringEmailId === author.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-amber-500 hover:text-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
                        >
                          {triggeringEmailId === author.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          Disparar E-mail
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Busca no Horus */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Pesquisar Autor no Hórus ERP
                    </h3>
                    <p className="text-xs text-slate-500">
                      Consulte a relação de autores e fornecedores configurados no seu ERP.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 overflow-y-auto space-y-5 flex-1">
                {/* Search Bar */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Digite o nome, CPF ou CNPJ do autor no Hórus..."
                      value={horusSearch}
                      onChange={(e) => setHorusSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleHorusSearch()}
                      className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>
                  <button
                    onClick={handleHorusSearch}
                    disabled={horusLoading || !horusSearch.trim()}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {horusLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Pesquisar
                  </button>
                </div>

                {/* Resultados Horus */}
                {!selectedHorusAuthor && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Resultados Encontrados ({horusResults.length})
                    </p>

                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                      {horusLoading ? (
                        <div className="p-8 text-center text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                          Consultando API do Hórus...
                        </div>
                      ) : horusResults.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs">
                          Faça uma busca acima para listar os autores do seu ERP.
                        </div>
                      ) : (
                        horusResults.map((ha) => (
                          <div
                            key={ha.ID_GUID}
                            onClick={() => handleSelectHorusAuthor(ha)}
                            className="p-3.5 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 cursor-pointer flex items-center justify-between transition-colors"
                          >
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white text-sm">
                                {ha.NOM_FORNECEDOR}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                <span>Doc: {ha.CNPJ || ha.CPF || 'Não informado'}</span>
                                <span>Cód: {ha.COD_FORNECEDOR}</span>
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                              Selecionar →
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Formulário de Vínculo do Autor Selecionado */}
                {selectedHorusAuthor && (
                  <form onSubmit={handleSaveAuthor} className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-amber-200/50 dark:border-amber-900/30">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                          Autor Selecionado
                        </span>
                        <h4 className="font-bold text-slate-900 dark:text-white text-base">
                          {selectedHorusAuthor.NOM_FORNECEDOR}
                        </h4>
                        <p className="text-xs text-slate-500 font-mono">
                          ID_GUID: {selectedHorusAuthor.ID_GUID} | Doc: {selectedHorusAuthor.CNPJ || selectedHorusAuthor.CPF || 'S/N'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedHorusAuthor(null)}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        Trocar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          E-mail B2B de Acesso (Login)*
                        </label>
                        <input
                          type="email"
                          required
                          value={formEmailB2B}
                          onChange={(e) => setFormEmailB2B(e.target.value)}
                          placeholder="autor@editora.com.br"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Este será o e-mail que o autor usará para acessar o Portal.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Classificação do Autor
                        </label>
                        <select
                          value={formClassificacao}
                          onChange={(e) => setFormClassificacao(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                        >
                          {CLASSIFICACOES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-amber-200/50 dark:border-amber-900/30">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={formSendEmailNow}
                          onChange={(e) => setFormSendEmailNow(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                        />
                        Disparar convite de ativação por e-mail imediatamente
                      </label>

                      <button
                        type="submit"
                        disabled={savingAuthor}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
                      >
                        {savingAuthor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salvar Pré-Cadastro
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
