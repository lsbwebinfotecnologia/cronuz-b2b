'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Lock, Mail, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/auth';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFaCode, setTwoFaCode] = useState('');
  const [is2FA, setIs2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const res = await fetch('http://localhost:8000/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Falha na autenticação');
      }

      const data = await res.json();

      // MOCK: In the next phase, the JWT will verify if 2FA is needed
      if (data.requires_2fa && !is2FA) {
        setIs2FA(true);
        toast.info("Por segurança, enviamos um código de 6 dígitos para o seu email.");
        setLoading(false);
        return;
      }
      
      // se tá no modo 2FA, ele bateria noutra rota /verify-2fa e checaria.
      // mas como o backend ainda aceita direto, a gente loga.
      if (is2FA && twoFaCode.length !== 6) {
        throw new Error('Código de 2 fatores inválido');
      }

      setToken(data.access_token, data.user);
      toast.success('Login aprovado. Redirecionando...');
      router.push('/');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-primary-base)]/20 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[var(--color-secondary-base)]/10 rounded-full blur-[150px] mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/50 p-8 backdrop-blur-xl shadow-2xl backdrop-saturate-150">
          <div className="flex flex-col items-center mb-8">
            <div className="relative h-16 w-36 mb-4">
              <img 
                src="/images/cronuz-logo.png" 
                alt="Cronuz Logo" 
                className="object-contain w-full h-full"
              />
            </div>
            <p className="text-sm text-slate-400 mt-2 text-center">
              Faça login para acessar o portal da sua empresa.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            {!is2FA ? (
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail corporativo"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 pl-11 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[var(--color-primary-base)]/50 focus:bg-slate-900/80 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-base)]/50 transition-all font-medium"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-3 pl-11 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[var(--color-primary-base)]/50 focus:bg-slate-900/80 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-base)]/50 transition-all font-medium"
                  />
                </div>
              </div>
            ) : (
               <motion.div 
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="space-y-4"
               >
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-indigo-200/90 leading-relaxed font-medium">
                    Autenticação em Duas Etapas obrigatória. Insira o código enviado para o seu dispositivo.
                  </p>
                </div>
                
                <div className="relative mt-4">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--color-primary-base)]" />
                  <input
                    type="text"
                    maxLength={6}
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value)}
                    placeholder="Código 2FA (6 dígitos)"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/50 py-4 pl-11 pr-4 text-base tracking-widest text-slate-200 placeholder:text-slate-500 focus:border-[var(--color-primary-base)]/50 focus:bg-slate-900/80 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary-base)]/50 transition-all font-bold text-center"
                  />
                </div>
               </motion.div>
            )}

            {!is2FA && (
              <div className="flex items-center justify-center p-3 mt-4 border border-slate-800/60 rounded-xl bg-slate-950/30">
                {/* Mock reCAPTCHA */}
                <div className="flex items-center gap-3">
                   <div className="h-5 w-5 rounded border border-slate-700 bg-slate-900 cursor-pointer flex items-center justify-center hover:border-slate-500 transition-colors"></div>
                   <span className="text-sm font-medium text-slate-400">Não sou um robô</span>
                </div>
                <div className="ml-auto flex items-center gap-1 opacity-50">
                  <img src="https://www.gstatic.com/recaptcha/api2/logo_48.png" className="h-6 w-6 grayscale" />
                </div>
              </div>
            )}

            {!is2FA && (
              <div className="flex items-center justify-between pb-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-800 bg-slate-950 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)]/50" />
                  <span className="text-sm text-slate-400">Lembrar de mim</span>
                </label>
                <Link href="#" className="text-sm font-medium text-[var(--color-primary-base)] hover:text-indigo-300 transition-colors">
                  Esqueceu a senha?
                </Link>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading || (is2FA && twoFaCode.length < 6)}
              className="group relative w-full overflow-hidden rounded-xl bg-[var(--color-primary-base)] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[var(--color-primary-hover)] hover:shadow-lg hover:shadow-[var(--color-primary-base)]/25 active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 disabled:shadow-none mt-4"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (is2FA ? 'Confirmar Acesso' : 'Entrar')}
                {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
              </span>
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
            </button>
          </form>
        </div>
        
        <p className="text-center text-xs text-slate-500 mt-6 font-medium">
          Deseja integrar sua empresa ao Cronuz IA? <Link href="#" className="text-[var(--color-primary-base)] hover:underline">Fale conosco</Link>
        </p>
      </motion.div>
    </div>
  );
}
