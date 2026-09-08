import { AlertCircle, Feather } from 'lucide-react';
import Link from 'next/link';

export default function AuthorPortalIndisponivel() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="text-center max-w-md w-full p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
        <div className="w-14 h-14 mx-auto bg-amber-50 dark:bg-amber-950/40 rounded-2xl flex items-center justify-center mb-6">
          <Feather className="h-7 w-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Portal do Autor Indisponível</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
          O módulo de Portal do Autor está temporariamente desativado para esta editora. Entre em contato com a equipe editorial para mais informações.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 font-semibold text-sm transition-all"
        >
          Voltar à Página Inicial
        </Link>
      </div>
    </div>
  );
}
