'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BookOpen, 
  Save, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Layers,
  Key
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

export default function MasterBookinfoMetadataPage() {
  const [token, setToken] = useState('');
  const [environment, setEnvironment] = useState<'prod' | 'sandbox'>('prod');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Test state
  const [testIsbn, setTestIsbn] = useState('9788532511010');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    book?: {
      title?: string;
      authors?: string;
      publisher?: string;
      cover_url?: string;
      price?: number;
      isbn?: string;
    } | null;
  } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    async function loadConfig() {
      const authToken = getToken();
      if (!authToken) return;

      try {
        const res = await fetch(apiUrl + '/master/bookinfo-metadata/config', {
          headers: { Authorization: 'Bearer ' + authToken },
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.token || '');
          setEnvironment(data.environment === 'sandbox' ? 'sandbox' : 'prod');
          setUpdatedAt(data.updated_at || null);
        } else if (res.status === 403) {
          toast.error('Acesso exclusivo para administradores Master.');
        }
      } catch (err) {
        console.error('Erro ao carregar configurações Bookinfo:', err);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [apiUrl]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);

    const authToken = getToken();
    try {
      const res = await fetch(apiUrl + '/master/bookinfo-metadata/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + authToken,
        },
        body: JSON.stringify({ token, environment }),
      });

      if (res.ok) {
        toast.success('Token Padrão da Bookinfo gravado com sucesso!');
        setUpdatedAt(new Date().toISOString());
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao gravar configurações.');
      }
    } catch {
      toast.error('Erro de conexão com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!token.trim()) {
      toast.error('Informe um token para realizar o teste de conexão.');
      return;
    }

    setTesting(true);
    setTestResult(null);

    const authToken = getToken();
    try {
      const res = await fetch(apiUrl + '/master/bookinfo-metadata/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + authToken,
        },
        body: JSON.stringify({
          token: token.trim(),
          environment,
          test_isbn: testIsbn,
        }),
      });

      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success(data.message || 'Conexão validada com sucesso!');
      } else {
        toast.error(data.message || 'Falha ao validar token.');
      }
    } catch {
      setTestResult({
        success: false,
        message: 'Erro de comunicação ao testar endpoint.',
      });
      toast.error('Erro ao testar Bookinfo.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00b4b4]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#00b4b4]/10 text-[#00b4b4]">
              <BookOpen className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Bookinfo — Token Padrão Global (Metadados)
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Configure o token global de catálogo da API Bookinfo (v1.5). Este token é herdado automaticamente por todos os sellers do Cronuz que não possuírem convênio individual próprio, permitindo consulta imediata de capas, autores e fichas de livros no Busca Preço.
          </p>
        </div>

        {updatedAt && (
          <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg shrink-0 self-start sm:self-auto">
            Última alteração: {new Date(updatedAt).toLocaleString('pt-BR')}
          </span>
        )}
      </div>

      {/* Banner Informativo */}
      <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20 p-5 flex flex-col sm:flex-row gap-4 items-start">
        <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div className="space-y-1 text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
          <p className="font-bold text-sm">Hierarquia de Busca por Seller</p>
          <p>
            1. Se o <strong>Seller</strong> tiver seu próprio token de metadados cadastrado na sua página de integrações, o sistema usará as credenciais dele.
          </p>
          <p>
            2. Se o Seller <strong>não</strong> tiver token cadastrado, o sistema utilizará este <strong>Token Global do Master</strong> com total transparência.
          </p>
        </div>
      </div>

      {/* Formulário Principal */}
      <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Ambiente da API Bookinfo
            </label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as 'prod' | 'sandbox')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 px-4 text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[#00b4b4] focus:border-transparent cursor-pointer"
            >
              <option value="prod">Produção (https://api.bookinfometadados.com.br/api/v1.5)</option>
              <option value="sandbox">Sandbox / Homologação (https://sandbox.bookinfometadados.com.br/api/v1.5)</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Recomendado manter em Produção para obter os metadados de editoras em tempo real.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-[#00b4b4]" />
              Token Bearer Global de Metadados (Catálogo)
            </label>
            <span className="text-[11px] text-slate-400">API Bookinfo v1.5</span>
          </div>
          <textarea
            rows={4}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole aqui o Token Bearer da Bookinfo para a API de Metadados..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 py-3 px-4 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#00b4b4] focus:border-transparent resize-none break-all"
          />
        </div>

        {/* Bloco de Teste de Conexão */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-blue-500" />
                Testar Autenticação com a Bookinfo
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Valida se o token informado é aceito pela API da Bookinfo e busca um livro de teste.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testIsbn}
                onChange={(e) => setTestIsbn(e.target.value)}
                placeholder="ISBN de teste (ex: 9788532511010)"
                className="w-48 sm:w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-3 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !token.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {testing ? 'Testando...' : 'Testar Token'}
              </button>
            </div>
          </div>

          {/* Resultado do Teste */}
          {testResult && (
            <div
              className={`rounded-xl border p-4 text-xs ${
                testResult.success
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                  : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold mb-1">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>

              {testResult.book && (
                <div className="mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-900/60 flex items-start gap-3">
                  {testResult.book.cover_url && (
                    <img
                      src={testResult.book.cover_url}
                      alt=""
                      className="w-12 h-16 object-contain rounded bg-white shadow-xs shrink-0"
                    />
                  )}
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {testResult.book.title}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Autor: {testResult.book.authors || '—'} | Editora: {testResult.book.publisher || '—'}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500">
                      ISBN: {testResult.book.isbn} {testResult.book.price ? `• R$ ${Number(testResult.book.price).toFixed(2).replace('.', ',')}` : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botão Salvar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Gravando...' : 'Salvar Configuração Global'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
