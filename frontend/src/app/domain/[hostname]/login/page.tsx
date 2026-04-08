'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Lock, Mail, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { setToken } from '@/lib/auth';
import { toast } from 'sonner';

export default function StorefrontLoginPage() {
  const params = useParams();
  const hostname = params.hostname as string;
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingInfo, setFetchingInfo] = useState(true);
  const [storeInfo, setStoreInfo] = useState<any>(null);

  useEffect(() => {
    const fetchStoreInfo = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiUrl}/storefront/domain/${hostname}`);
        if (res.ok) {
          const data = await res.json();
          setStoreInfo(data);
        } else {
          toast.error("Domínio não localizado.");
        }
      } catch (err) {
        console.error("Failed to fetch store info:", err);
      } finally {
        setFetchingInfo(false);
      }
    };
    
    if (hostname) {
      fetchStoreInfo();
    }
  }, [hostname]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      // To support the global multi-tenant API token path, users log in using their email
      formData.append('username', email);
      formData.append('password', password);
      
      if (storeInfo?.company_id) {
        formData.append('company_id', storeInfo.company_id.toString());
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'E-mail ou senha incorretos.');
      }

      const data = await res.json();
      
      // Store token and redirect to storefront home
      setToken(data.access_token, data.user);
      toast.success('Acesso liberado!');
      router.push('/store');
      router.refresh();
      
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
      </div>
    );
  }

  const primaryColor = storeInfo?.logo ? 'var(--color-primary-base)' : '#4f46e5'; // fallback indigo

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Sidebar - Login Form */}
      <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col items-center justify-center p-8 sm:p-12 lg:p-16 xl:p-24 relative z-10 bg-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          {/* Company Branding */}
          <div className="flex flex-col items-center mb-10">
            {storeInfo?.logo ? (
              <img 
                src={storeInfo.logo} 
                alt={storeInfo.name} 
                className="h-24 w-auto object-contain mb-8 origin-center hover:scale-105 transition-transform" 
              />
            ) : (
              <div className="text-3xl font-black italic tracking-tighter text-slate-800 mb-8 lowercase">
                {storeInfo?.name || 'Storefront B2B'}
              </div>
            )}
            <h2 className="text-xl font-bold text-slate-900 mb-2">Acesse sua conta</h2>
            <p className="text-sm text-slate-500 text-center font-medium">Faça login para ver preços e produtos exclusivos da empresa {storeInfo?.name || 'Distribuidora'}.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 pl-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Seu e-mail cadastrado"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3.5 pl-12 pr-4 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Senha</label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha secreta"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-3.5 pl-12 pr-4 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
                    required
                  />
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 disabled:shadow-none mt-8"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar na Loja'}
                {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
              </span>
            </button>
            <div className="text-center pt-8">
              {storeInfo?.tenant_id === 'horus' ? (
                <span className="text-[10px] font-medium text-slate-400">
                  Desenvolvido por lsbwebinfo em parceria com fmz tecnologia em sistemas.
                </span>
              ) : (
                <>
                  <span className="text-sm font-medium text-slate-500">Desenvolvido por </span>
                  <a href="https://cronuzb2b.com.br" target="_blank" rel="noopener noreferrer" className="text-sm font-black italic text-indigo-600 tracking-tight ml-1 hover:underline">CRONUZ</a>
                </>
              )}
            </div>
          </form>
        </motion.div>
      </div>

      {/* Right Sidebar - Custom Promotional Background */}
      <div className="hidden lg:flex flex-1 relative bg-slate-100 items-center justify-center overflow-hidden border-l border-slate-200 shadow-2xl">
        {storeInfo?.login_background_url ? (
          <>
            <img 
              src={storeInfo.login_background_url} 
              alt="Background" 
              className="absolute inset-0 w-full h-full object-cover" 
            />
            {/* Optional gradient overlay to ensure the image sits nicely */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent mix-blend-multiply opacity-50 pointer-events-none" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-indigo-100 flex flex-col items-center justify-center text-center p-12">
            <h1 className="text-5xl font-black text-indigo-900/10 uppercase tracking-tighter transform -skew-x-12 mb-8">
              B2B Storefront
            </h1>
            <p className="text-indigo-900/40 font-medium max-w-sm leading-relaxed">
              O administrador desta loja ainda não personalizou a vitrine de entrada. Insira uma imagem com resolução sugerida de 1920x1080.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
