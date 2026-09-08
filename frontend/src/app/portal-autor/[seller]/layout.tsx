'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Feather } from 'lucide-react';
import Link from 'next/link';

interface PortalInfo {
  company_id: number;
  name: string;
  logo: string | null;
  login_background_url: string | null;
  favicon_url: string | null;
  seo_title: string;
  seo_description: string;
  modulo_autores_ativo: boolean;
  seller_slug: string;
}

interface AuthorPortalContextType {
  portalInfo: PortalInfo | null;
  loading: boolean;
}

export const AuthorPortalContext = createContext<AuthorPortalContextType>({
  portalInfo: null,
  loading: true
});

export const useAuthorPortal = () => useContext(AuthorPortalContext);

export default function AuthorPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const seller = params?.seller as string;
  const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!seller) return;
    const fetchInfo = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiUrl}/portal-autor/info/${seller}`);
        if (res.ok) {
          const data = await res.json();
          setPortalInfo(data);
        } else {
          setNotFound(true);
        }
      } catch (e) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [seller]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-xs text-slate-400 font-medium">Carregando Portal do Autor...</p>
        </div>
      </div>
    );
  }

  if (notFound || !portalInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="text-center max-w-md w-full p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          <div className="w-14 h-14 mx-auto bg-rose-50 dark:bg-rose-950/40 rounded-2xl flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-rose-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Editora Não Encontrada</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Não localizamos nenhuma editora parceira associada ao endereço informado.
          </p>
        </div>
      </div>
    );
  }

  // Verificação de Módulo Ativo
  if (!portalInfo.modulo_autores_ativo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="text-center max-w-md w-full p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
          {portalInfo.logo ? (
            <img src={portalInfo.logo} alt={portalInfo.name} className="h-12 max-w-[180px] mx-auto mb-6 object-contain" />
          ) : (
            <div className="w-14 h-14 mx-auto bg-amber-50 dark:bg-amber-950/40 rounded-2xl flex items-center justify-center mb-6">
              <Feather className="h-7 w-7 text-amber-500" />
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Portal Temporariamente Indisponível</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
            O <strong>Portal do Autor</strong> de <strong>{portalInfo.name}</strong> está temporariamente desativado ou em manutenção.
          </p>
          <p className="text-xs text-slate-400">
            Em caso de dúvidas sobre suas vendas ou direitos autorais, entre em contato diretamente com o departamento editorial da sua editora.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthorPortalContext.Provider value={{ portalInfo, loading }}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
        {children}
      </div>
    </AuthorPortalContext.Provider>
  );
}
