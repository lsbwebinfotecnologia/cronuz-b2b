'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, Mail, Building2, Phone, ShieldCheck, KeyRound, Save, Loader2, FileText, TrendingUp, Package, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { getUser, getToken } from '@/lib/auth';
import Link from 'next/link';

export default function CustomerProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [ordersSummary, setOrdersSummary] = useState({ total_spent: 0, order_count: 0, recent_orders: [] as any[]});
  
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const usr = getUser();
    if (!usr) {
      router.push('/login');
      return;
    }
    setUser(usr);
    fetchCustomerDetails(usr.company_id);
    fetchOrderSummary();
  }, [router]);

  const fetchCustomerDetails = async (companyId: number) => {
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const res = await fetch(`${apiUrl}/customers?company_id=${companyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        const currentUser = getUser();
        const me = data.find((c: any) => 
          (c.email && c.email === currentUser?.email) || 
          (c.corporate_name && c.corporate_name === currentUser?.name) ||
          (c.name && c.name === currentUser?.name)
        );
        if (me) setCustomerData(me);
      }
    } catch (e) {
      console.error("Failed to fetch customer profile", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOrderSummary = async () => {
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/storefront/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const orders = await res.json();
        const total = orders.reduce((acc: number, o: any) => acc + (o.status !== 'CANCELLED' ? o.total : 0), 0);
        setOrdersSummary({
          total_spent: total,
          order_count: orders.length,
          recent_orders: orders.slice(0, 3) // Top 3 most recent
        });
      }
    } catch(e) {
       console.error("Failed to fetch orders for summary", e);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem!');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      const res = await fetch(`${apiUrl}/storefront/profile/password`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao atualizar senha');
      }

      toast.success('Senha atualizada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Header Profile Summary */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="bg-[var(--color-primary-base)] rounded-3xl p-8 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
             <User className="h-48 w-48" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="h-24 w-24 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-4 border-white/30 shrink-0 shadow-inner">
               <span className="text-4xl font-black text-white">
                 {user?.name?.charAt(0).toUpperCase()}
               </span>
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-3xl font-bold mb-2">Olá, {customerData?.fantasy_name || user?.name}!</h1>
              <p className="text-indigo-100 flex items-center justify-center md:justify-start gap-2 mb-1">
                 <Building2 className="w-4 h-4" /> {customerData?.corporate_name || "B2B Cronuz Cliente"}
              </p>
              <p className="text-indigo-200 text-sm flex items-center justify-center md:justify-start gap-2 font-mono">
                 CNPJ: {customerData?.document || "N/A"}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Info & Password */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Read Only Data */}
          <motion.div 
             initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
             className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-[var(--color-primary-base)]" /> Seus Dados
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 font-medium">Nome / Razão Social</label>
                <div className="mt-1 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {customerData?.corporate_name || user?.name}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">E-mail de Acesso</label>
                <div className="mt-1 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Mail className="w-4 h-4 opacity-50" /> {user?.email}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Telefone de Contato</label>
                <div className="mt-1 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Phone className="w-4 h-4 opacity-50" /> {customerData?.phone || "Não informado"}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              Para alterar os dados cadastrais da empresa acima, favor entrar em contato com o suporte ou seu gestor de vendas.
            </p>
          </motion.div>

          {/* Password Reset */}
          <motion.div 
             initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
             className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" /> Alterar Senha
            </h2>
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
               <div>
                 <div className="relative">
                   <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input
                     type="password"
                     required
                     value={currentPassword}
                     onChange={e => setCurrentPassword(e.target.value)}
                     placeholder="Senha Atual"
                     className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent outline-none transition-all dark:text-white placeholder:text-slate-400"
                   />
                 </div>
               </div>
               <div>
                 <div className="relative">
                   <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input
                     type="password"
                     required
                     value={newPassword}
                     onChange={e => setNewPassword(e.target.value)}
                     placeholder="Nova Senha"
                     className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent outline-none transition-all dark:text-white placeholder:text-slate-400"
                   />
                 </div>
               </div>
               <div>
                 <div className="relative">
                   <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input
                     type="password"
                     required
                     value={confirmPassword}
                     onChange={e => setConfirmPassword(e.target.value)}
                     placeholder="Confirmar Nova Senha"
                     className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent outline-none transition-all dark:text-white placeholder:text-slate-400"
                   />
                 </div>
               </div>
               <button 
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-[var(--color-primary-base)] dark:hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 group disabled:opacity-70"
               >
                 {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                 Salvar Nova Senha
               </button>
            </form>
          </motion.div>
        </div>

        {/* Right Column: Dashboard & Summaries */}
        <div className="lg:col-span-2 space-y-8">
          
          <motion.div 
             initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
             className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {/* KPI Card 1 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] flex items-center justify-center shrink-0">
                 <Package className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Pedidos B2B</p>
                 <p className="text-2xl font-black text-slate-900 dark:text-white">{ordersSummary.order_count}</p>
               </div>
            </div>

            {/* KPI Card 2 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 p-6 shadow-sm flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-800/50">
                 <TrendingUp className="w-6 h-6" />
               </div>
               <div>
                 <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Investido (R$)</p>
                 <p className="text-2xl font-black text-emerald-600 dark:text-emerald-500">
                   {ordersSummary.total_spent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                 </p>
               </div>
            </div>
          </motion.div>

          {/* Recent Orders Overview */}
          <motion.div 
             initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
             className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col"
          >
             <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 opacity-70" /> Pedidos Recentes
                </h2>
                <Link href="/store/orders" className="text-sm font-semibold text-[var(--color-primary-base)] hover:underline">
                  Ver todos os pedidos
                </Link>
             </div>
             <div className="p-0">
                {ordersSummary.recent_orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                    Você ainda não efetuou nenhum pedido.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {ordersSummary.recent_orders.map(order => (
                      <Link 
                        key={order.id} 
                        href={`/store/orders/${order.id}`}
                        className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                      >
                         <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[var(--color-primary-base)] transition-colors">
                              Pedido Interno #{order.id}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              Efetuado em {new Date(order.created_at).toLocaleDateString('pt-BR')}
                            </p>
                         </div>
                         <div className="text-right">
                           <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                             R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                           </p>
                           <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                              order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 
                              order.status === 'INVOICED' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-indigo-100 text-indigo-700'
                           }`}>
                             {order.status === "NEW" ? "Novo" : 
                              order.status === "PROCESSING" ? "Processando" :
                              order.status === "SENT_TO_HORUS" ? "Aprovado / ERP" :
                              order.status === "DISPATCH" ? "Em Separação" :
                              order.status === "INVOICED" ? "Faturado" :
                              order.status === "CANCELLED" ? "Cancelado" : order.status}
                           </span>
                         </div>
                      </Link>
                    ))}
                  </div>
                )}
             </div>
          </motion.div>
          
        </div>
      </div>
    </div>
  );
}
