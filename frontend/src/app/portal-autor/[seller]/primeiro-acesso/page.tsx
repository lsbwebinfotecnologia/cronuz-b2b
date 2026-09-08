'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuthorPortal } from '../layout';
import { 
  Lock, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, 
  ShieldCheck, ArrowRight, Feather, KeyRound, Check, X
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function AuthorFirstAccessPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const seller = params?.seller as string;
  const token = searchParams.get('token') || '';
  const { portalInfo } = useAuthorPortal();

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setErrorMessage('Nenhum código de convite informado.');
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`${API_URL}/portal-autor/auth/verify-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          setTokenValid(true);
          setAuthorName(data.author_name || '');
          setAuthorEmail(data.emailb2b || '');
        } else {
          setTokenValid(false);
          setErrorMessage(data.detail || 'Este link de primeiro acesso é inválido ou já expirou.');
        }
      } catch (e) {
        setTokenValid(false);
        setErrorMessage('Falha ao conectar com o servidor para validar o convite.');
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  // Regras de força de senha
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[@$!%*?&#^_\-+=]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isPasswordStrong = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordStrong) {
      toast.error('Preencha os requisitos mínimos para criar uma senha segura.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/portal-autor/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        toast.success('Sua senha foi cadastrada com sucesso!');
      } else {
        toast.error(data.detail || 'Erro ao definir senha.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao salvar nova senha.');
    } finally {
      setSubmitting(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-sm text-slate-500 font-medium">Validando seu convite de acesso...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Convite Indisponível</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            {errorMessage}
          </p>
          <Link
            href={`/portal-autor/${seller}/login`}
            className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 font-semibold text-sm transition-all"
          >
            Ir para a Tela de Login
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full text-center border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Conta Ativada com Sucesso!</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            Sua senha foi configurada. Agora você já pode acessar o Portal do Autor com seu e-mail <strong>{authorEmail}</strong>.
          </p>
          <Link
            href={`/portal-autor/${seller}/login`}
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm shadow-md shadow-amber-500/20 transition-all"
          >
            Acessar Minha Conta <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-7 sm:p-9 shadow-xl border border-slate-200/80 dark:border-slate-800">
          {/* Top Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
              <KeyRound className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Primeiro Acesso
            </span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
              Olá, {authorName}!
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Crie uma senha de acesso para o Portal do Autor de <strong>{portalInfo?.name}</strong>.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* E-mail (Read-only) */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Seu e-mail de acesso
              </label>
              <input
                type="text"
                disabled
                value={authorEmail}
                className="w-full px-3.5 py-2 text-sm bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 cursor-not-allowed"
              />
            </div>

            {/* Nova Senha */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nova Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Defina sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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

            {/* Confirmação de Senha */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirmar Senha
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {/* Checklist de Força da Senha */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 space-y-2 text-xs">
              <p className="font-semibold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">
                Requisitos de Segurança:
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400'}`}>
                  {hasMinLength ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center font-bold">•</span>}
                  8+ caracteres
                </div>
                <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400'}`}>
                  {hasUppercase ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center font-bold">•</span>}
                  Letra maiúscula
                </div>
                <div className={`flex items-center gap-1.5 ${hasLowercase ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400'}`}>
                  {hasLowercase ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center font-bold">•</span>}
                  Letra minúscula
                </div>
                <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400'}`}>
                  {hasNumber ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center font-bold">•</span>}
                  Ao menos 1 número
                </div>
                <div className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400'}`}>
                  {hasSpecial ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center font-bold">•</span>}
                  Símbolo (@$!%*?...)
                </div>
                <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400'}`}>
                  {passwordsMatch ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 flex items-center justify-center font-bold">•</span>}
                  Senhas conferem
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !isPasswordStrong}
              className="w-full mt-2 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Ativar Minha Conta
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
