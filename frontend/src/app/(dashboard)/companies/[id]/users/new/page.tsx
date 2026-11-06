'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../../context';
import { UserAccessForm, UserAccessFormValues } from '../UserAccessForm';

export default function NewSellerPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();

  const [loading, setLoading] = useState(false);
  const [formValues, setFormValues] = useState<UserAccessFormValues>({
    name: '',
    email: '',
    document: '',
    password: '',
    initialPage: 'DEFAULT',
    grantFullAccess: true,
    allowedModules: [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.name.trim() || !formValues.email.trim()) {
      return toast.error('Preencha nome e e-mail do usuário.');
    }
    if (formValues.password.trim().length < 6) {
      return toast.error('A senha inicial deve ter no mínimo 6 caracteres.');
    }

    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formValues.name.trim(),
          email: formValues.email.trim(),
          document: formValues.document.trim() || null,
          password: formValues.password,
          type: 'SELLER',
          company_id: parseInt(companyId, 10),
          initial_page: formValues.initialPage === 'DEFAULT' ? null : formValues.initialPage,
          allowed_modules: formValues.grantFullAccess ? null : formValues.allowedModules,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Erro ao cadastrar usuário Seller');
      }

      toast.success('Novo login de acesso criado com sucesso!');
      router.push(`/companies/${companyId}/users`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Link
            href={`/companies/${companyId}/users`}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Cadastrar Novo Login (Seller)
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
              Defina as credenciais na esquerda e os módulos liberados por categoria na direita.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
        <UserAccessForm
          mode="create"
          values={formValues}
          onChange={setFormValues}
          company={company}
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Link
            href={`/companies/${companyId}/users`}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="bg-teal-600 hover:bg-teal-500 text-white font-bold py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-600/20 disabled:opacity-70 cursor-pointer text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {loading ? 'Cadastrando...' : 'Finalizar e Liberar Acesso'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
