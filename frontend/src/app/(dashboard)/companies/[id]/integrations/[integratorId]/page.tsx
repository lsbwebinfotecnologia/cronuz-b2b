'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Loader2, Layers } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

export default function IntegratorConfigurationPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  const integratorId = parseInt(params.integratorId as string);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrator, setIntegrator] = useState<any>(null);
  const [systemIntegrator, setSystemIntegrator] = useState<any>(null);
  const [dynamicForm, setDynamicForm] = useState<Record<string, any>>({});
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [companyId, integratorId]);

  async function fetchData() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;

      // Fetch company integrator
      const iRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/integrators/${companyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let intData = null;
      if (iRes.ok) {
        const list = await iRes.json();
        intData = list.find((i: any) => i.id === integratorId);
        if (intData) setIntegrator(intData);
      }
      
      if (!intData) throw new Error("Integração não encontrada");

      try {
         setDynamicForm(intData.credentials ? JSON.parse(intData.credentials) : {});
      } catch(e) {
         setDynamicForm({});
      }

      // Fetch system integrator catalog for groups
      const sRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (sRes.ok) {
        const sysList = await sRes.json();
        const sysInt = sysList.find((s: any) => s.code === intData.platform);
        if (sysInt) {
            setSystemIntegrator(sysInt);
            if (sysInt.groups && sysInt.groups.length > 0) {
               setActiveGroupId(sysInt.groups[0].id);
            }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar dados.");
      router.push(`/companies/${companyId}/integrations`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    
    // Validar visualmente requireds
    let hasError = false;
    for (const group of systemIntegrator?.groups || []) {
       for (const field of group.fields || []) {
          if (field.is_required && !dynamicForm[field.name]) {
             toast.error(`O campo "${field.label}" é obrigatório.`);
             setActiveGroupId(group.id);
             hasError = true;
             break;
          }
       }
       if (hasError) break;
    }
    if (hasError) return;

    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/integrators/${integratorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ credentials: JSON.stringify(dynamicForm) })
      });
      if (!res.ok) throw new Error('Falha ao salvar configurações');
      toast.success('Configurações salvas com sucesso!');
      router.push(`/companies/${companyId}/integrations`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-base)]" /></div>;
  }

  if (!integrator || !systemIntegrator) {
    return <div className="p-8 text-center text-slate-500">Dados não encontrados.</div>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-slate-900 sticky top-0 z-10">
         <Link href={`/companies/${companyId}/integrations`} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
         </Link>
         <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Configurar Integração: {systemIntegrator.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Preencha os campos abaixo para ativar a conectividade.</p>
         </div>
         <div className="flex items-center gap-2">
            <button
               type="button"
               onClick={() => handleSave()}
               disabled={saving}
               className="px-6 py-2.5 bg-[var(--color-primary-base)] hover:bg-opacity-90 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm text-sm transition-all"
            >
               {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
               Salvar
            </button>
         </div>
      </div>

      <div className="max-w-5xl mx-auto w-full p-6">
         {systemIntegrator.groups?.length === 0 ? (
            <div className="w-full p-8 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              Nenhuma configuração exigida para este integrador.
            </div>
         ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
               {/* TOP MENU TABS */}
               <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-4 pt-4 bg-slate-50/50 dark:bg-slate-950/50">
                  {systemIntegrator.groups?.map((group: any) => (
                     <button
                       key={group.id}
                       type="button"
                       onClick={() => setActiveGroupId(group.id)}
                       className={`px-6 pb-4 text-[15px] font-bold whitespace-nowrap border-b-[3px] transition-colors flex items-center gap-2 ${
                          activeGroupId === group.id 
                            ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                       }`}
                     >
                       {group.name}
                     </button>
                  ))}
               </div>
               
               {/* ÁREA DOS FORMULÁRIOS */}
               <div className="p-8 flex-1">
                 <form onSubmit={handleSave} className="flex flex-col h-full">
                    {systemIntegrator.groups?.map((group: any) => (
                      <div key={group.id} className={activeGroupId === group.id ? 'block space-y-6' : 'hidden'}>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                           {group.fields?.map((field: any) => (
                              <div key={field.id} className={`space-y-2 ${field.type === 'TEXT' || field.type === 'PASSWORD' ? 'md:col-span-2' : ''}`}>
                                 <label className="text-[14px] font-semibold text-slate-700 dark:text-slate-300 block">
                                   {field.label} {field.is_required && <span className="text-rose-500">*</span>}
                                 </label>
                                 {field.type === 'BOOLEAN' ? (
                                    <div className="my-[7px]">
                                      <input 
                                        type="checkbox" 
                                        checked={!!dynamicForm[field.name]} 
                                        onChange={e => setDynamicForm({...dynamicForm, [field.name]: e.target.checked})} 
                                        className="block mt-2 text-[var(--color-primary-base)] rounded w-5 h-5 cursor-pointer" 
                                      />
                                    </div>
                                 ) : (
                                    <input 
                                      type={field.type === 'PASSWORD' ? 'password' : field.type === 'NUMBER' ? 'number' : 'text'} 
                                      placeholder={`Insira ${field.label.toLowerCase()}`}
                                      value={dynamicForm[field.name] || ''}
                                      onChange={e => setDynamicForm({...dynamicForm, [field.name]: e.target.value})}
                                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950 p-3.5 text-[15px] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[var(--color-primary-base)] focus:ring-1 focus:ring-[var(--color-primary-base)] transition-all flex items-center"
                                    />
                                 )}
                              </div>
                           ))}
                         </div>
                      </div>
                    ))}
                 </form>
               </div>
            </div>
         )}
      </div>
    </motion.div>
  );
}
