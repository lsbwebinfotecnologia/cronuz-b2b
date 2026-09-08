'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthorPortal } from '../layout';
import { Feather, Eye, EyeOff, Lock, Mail, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function AuthorLoginPage() {
  const params = useParams();
  const router = useRouter();
  const seller = params?.seller as string;
  const { portalInfo } = useAuthorPortal();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Preencha seu e-mail e senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/portal-autor/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          seller_slug: seller
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Salva token com isolamento por seller
        localStorage.setItem(`author_token_${seller}`, data.access_token);
        localStorage.setItem(`author_user_${seller}`, JSON.stringify(data.author));
        toast.success(`Bem-vindo(a), ${data.author?.nome || 'Autor'}!`);
        router.push(`/portal-autor/${seller}/dashboard`);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Falha ao autenticar.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao tentar fazer login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background Decorativo Suave */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_50rem_at_top,theme(colors.amber.100),theme(colors.slate.50))] dark:bg-[radial-gradient(45rem_50rem_at_top,theme(colors.amber.950/20),theme(colors.slate.950))] opacity-70" />

      <div className="w-full max-w-md">
        {/* Card Principal */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-7 sm:p-9 shadow-xl border border-slate-200/80 dark:border-slate-800 backdrop-blur-sm">
          {/* Logo e Nome da Editora */}
          <div className="text-center mb-8">
            {portalInfo?.logo ? (
              <img
                src={portalInfo.logo}
                alt={portalInfo.name}
                className="h-14 max-w-[200px] mx-auto mb-4 object-contain"
              />
            ) : (
              <div className="w-14 h-14 mx-auto bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mb-4">
                <Feather className="w-7 h-7" />
              </div>
            )}
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Portal do Autor
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {portalInfo?.name || 'Acesse sua conta para consultar relatórios'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                E-mail Cadastrado
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Senha
                </label>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer" onClick={() => toast.info('Para recuperar sua senha, solicite um novo convite de primeiro acesso ao departamento editorial.')}>
                  Esqueci minha senha
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all duration-150 flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Entrar no Portal <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Rodapé e Privacidade */}
          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Conexão Segura & Conformidade LGPD</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Acesso exclusivo para autores parceiros de {portalInfo?.name}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
