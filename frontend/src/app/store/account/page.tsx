'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Building2, Phone, ShieldCheck, KeyRound, Save, Loader2, FileText, TrendingUp, Package, Clock, Receipt, Banknote, BookOpen, AlertCircle, Download, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getUser, getToken } from '@/lib/auth';
import Link from 'next/link';
import HorusConsignmentManager from "@/components/HorusConsignmentManager";

export default function CustomerProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [ordersSummary, setOrdersSummary] = useState({ total_spent: 0, order_count: 0, recent_orders: [] as any[]});
  
  const [activeTab, setActiveTab] = useState('resumo'); // resumo, notas, boletos, consignacao

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Financial States
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [debits, setDebits] = useState<any[]>([]);
  const [loadingDebits, setLoadingDebits] = useState(false);

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

  useEffect(() => {
    if (activeTab === 'notas' && invoices.length === 0) fetchInvoices();
    if (activeTab === 'boletos' && debits.length === 0) fetchDebits();
  }, [activeTab]);

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
          recent_orders: orders.slice(0, 3)
        });
      }
    } catch(e) {
       console.error("Failed to fetch orders for summary", e);
    }
  };

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      // Buscar ultimos 30 dias
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
      const pad = (n: number) => n < 10 ? '0'+n : n;
      const dataIni = `${pad(thirtyDaysAgo.getDate())}/${pad(thirtyDaysAgo.getMonth()+1)}/${thirtyDaysAgo.getFullYear()}`;
      const dataFim = `${pad(today.getDate())}/${pad(today.getMonth()+1)}/${today.getFullYear()}`;
      
      const res = await fetch(`${apiUrl}/me/invoices?data_ini=${dataIni}&data_fim=${dataFim}&xml_base64=N`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && !data[0]?.Falha) {
           setInvoices(data);
        } else if (data && data.Falha) {
           toast.error(data.Mensagem || "Erro ao buscar notas fiscais");
        }
      }
    } catch(e) {
       toast.error("Falha na conexão com Horus.");
    } finally {
      setLoadingInvoices(false);
    }
  };

  const fetchDebits = async () => {
    setLoadingDebits(true);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      // Boletos de um periodo grande para pegar abertos passados e futuros
      const res = await fetch(`${apiUrl}/me/debits?data_ini=01/01/2020&data_fim=31/12/2030&arq_base64=S`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && !data[0]?.Falha) {
           // Filtra apenas status AB (Aberto)
           setDebits(data.filter((d: any) => d.STA_LANCTO_CRECEBER === "AB"));
        } else if (data && data.Falha) {
           toast.error(data.Mensagem || "Erro ao buscar boletos");
        }
      }
    } catch(e) {
       toast.error("Falha na conexão com Horus.");
    } finally {
      setLoadingDebits(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem!');
      return;
    }
    // ... password logic
    toast.success('Senha atualizada em sistema de demonstração...');
  };

  const downloadBase64PDF = (base64String: string, filename: string) => {
    try {
      const linkSource = `data:application/pdf;base64,${base64String}`;
      const downloadLink = document.createElement("a");
      downloadLink.href = linkSource;
      downloadLink.download = filename;
      downloadLink.click();
    } catch (e) {
      toast.error("Falha ao gerar o PDF.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  const token = getToken();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
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

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 mb-8 pb-4 scrollbar-hide border-b border-slate-200 dark:border-slate-800">
          <button 
             onClick={() => setActiveTab('resumo')}
             className={`px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'resumo' ? 'bg-[var(--color-primary-base)] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
          >
             <User className="w-4 h-4" /> Meus Dados & Pedidos
          </button>
          <button 
             onClick={() => setActiveTab('boletos')}
             className={`px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'boletos' ? 'bg-[var(--color-primary-base)] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
          >
             <Banknote className="w-4 h-4" /> Boletos e Débitos
          </button>
          <button 
             onClick={() => setActiveTab('notas')}
             className={`px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'notas' ? 'bg-[var(--color-primary-base)] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
          >
             <Receipt className="w-4 h-4" /> Últimas Notas
          </button>
          <button 
             onClick={() => setActiveTab('consignacao')}
             className={`px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 whitespace-nowrap transition-all ${activeTab === 'consignacao' ? 'bg-[var(--color-primary-base)] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
          >
             <BookOpen className="w-4 h-4" /> Gestão de Consignação
          </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'resumo' && (
          <motion.div 
            key="resumo"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-1 space-y-8">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
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
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" /> Alterar Senha
                </h2>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                   <div><input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Senha Atual" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl outline-none" /></div>
                   <div><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova Senha" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl outline-none" /></div>
                   <div><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirmar Nova Senha" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl outline-none" /></div>
                   <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">Salvar</button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex items-center gap-4">
                   <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] flex items-center justify-center shrink-0">
                     <Package className="w-6 h-6" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-slate-500">Pedidos B2B</p>
                     <p className="text-2xl font-black">{ordersSummary.order_count}</p>
                   </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-100 p-6 flex items-center gap-4">
                   <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                     <TrendingUp className="w-6 h-6" />
                   </div>
                   <div>
                     <p className="text-sm font-medium text-slate-500">Total Investido (R$)</p>
                     <p className="text-2xl font-black text-emerald-600">{ordersSummary.total_spent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                   </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                 <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Clock className="w-5 h-5"/> Pedidos Recentes</h2>
                 </div>
                 <div className="p-0">
                    {ordersSummary.recent_orders.length === 0 ? <div className="p-8 text-center text-slate-500">Nenhum pedido efetuado.</div> : 
                      <div className="divide-y divide-slate-100">
                        {ordersSummary.recent_orders.map(order => 
                           <div key={order.id} className="flex justify-between p-6">
                              <div><p className="font-bold text-sm">Pedido #{order.id}</p> <span className="text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</span></div>
                              <div className="text-right"><p className="font-bold text-sm">R$ {order.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p> <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold">{order.status}</span></div>
                           </div>
                        )}
                      </div>
                    }
                 </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'boletos' && (
          <motion.div key="boletos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                       <Banknote className="w-5 h-5 text-indigo-500" /> Títulos em Aberto
                    </h2>
                    <button onClick={fetchDebits} className="text-sm font-bold text-indigo-500 hover:text-indigo-600 px-4 py-2 bg-indigo-50 rounded-xl">Atualizar</button>
                </div>
                
                {loadingDebits ? (
                   <div className="flex flex-col items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4"/><p className="text-slate-500 font-medium">Comunicando com o ERP Horus...</p></div>
                ) : debits.length === 0 ? (
                   <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                       <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
                       <h3 className="text-xl font-bold text-emerald-900">Tudo Certo!</h3>
                       <p className="text-emerald-700 mt-2">Você não possui boletos ou pendências financeiras em aberto.</p>
                   </div>
                ) : (
                   <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                         <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold uppercase text-xs">
                            <tr>
                               <th className="px-6 py-4 rounded-tl-xl">Lançamento / Tipo</th>
                               <th className="px-6 py-4">Ref. NFE</th>
                               <th className="px-6 py-4">Vencimento</th>
                               <th className="px-6 py-4">Valor (R$)</th>
                               <th className="px-6 py-4 rounded-tr-xl flex justify-end">Ação</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {debits.map((d, i) => (
                               <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                  <td className="px-6 py-4">
                                     <div className="font-bold text-slate-900 dark:text-white">{d.NRO_LANCTO_CRECEBER}</div>
                                     <div className="text-xs text-slate-500">{d.NOM_FORMA}</div>
                                  </td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{d.NRO_NOTA_FISCAL || '-'}</td>
                                  <td className="px-6 py-4 font-bold text-rose-600">{d.DAT_VENC_CRECEBER}</td>
                                  <td className="px-6 py-4 font-black">R$ {parseFloat(d.VLR_LANCTO_CRECEBER || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                                  <td className="px-6 py-4 flex justify-end">
                                      {d.PDF_Base64 && !d.PDF_Base64.includes('ERRO') ? (
                                        <button onClick={() => downloadBase64PDF(d.PDF_Base64, `Boleto_${d.NRO_LANCTO_CRECEBER}.pdf`)} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs font-bold flex items-center gap-2">
                                           <Download className="w-3.5 h-3.5" /> Baixar Boleto
                                        </button>
                                      ) : (
                                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">Boleto Indisponível</span>
                                      )}
                                  </td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                )}
             </div>
          </motion.div>
        )}

        {activeTab === 'notas' && (
          <motion.div key="notas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                       <Receipt className="w-5 h-5 text-indigo-500" /> Notas Fiscais (Últimos 30 Dias)
                    </h2>
                    <button onClick={fetchInvoices} className="text-sm font-bold text-indigo-500 hover:text-indigo-600 px-4 py-2 bg-indigo-50 rounded-xl">Atualizar</button>
                </div>
                
                {loadingInvoices ? (
                   <div className="flex flex-col items-center justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4"/><p className="text-slate-500 font-medium">Buscando documentos no ERP Horus...</p></div>
                ) : invoices.length === 0 ? (
                   <div className="p-8 text-center text-slate-500">Nenhuma Nota fiscal localizada nos últimos 30 dias.</div>
                ) : (
                   <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                         <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold uppercase text-xs">
                            <tr>
                               <th className="px-6 py-4 rounded-tl-xl">NF-e</th>
                               <th className="px-6 py-4">Data Emissão</th>
                               <th className="px-6 py-4">Chave de Acesso</th>
                               <th className="px-6 py-4">Itens</th>
                               <th className="px-6 py-4 rounded-tr-xl flex justify-end">Vlr. Líquido (R$)</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {invoices.map((inv, i) => (
                               <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                  <td className="px-6 py-4">
                                     <div className="font-bold text-slate-900 dark:text-white">{inv.NRO_NOTA_FISCAL}</div>
                                     <div className="text-[10px] text-slate-500 uppercase">{inv.STATUS} / Série {inv.SERIE_FISCAL}</div>
                                  </td>
                                  <td className="px-6 py-4 font-bold text-slate-600">{inv.DAT_EMISSAO_NF}</td>
                                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{inv.CHAVE_ACESSO_NFE || '---'}</td>
                                  <td className="px-6 py-4 font-bold text-slate-700">{inv.ITENS ? inv.ITENS.length : 0} vol(s)</td>
                                  <td className="px-6 py-4 font-black flex justify-end">R$ {parseFloat(inv.VLR_LIQUIDO_NF || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                )}
             </div>
          </motion.div>
        )}

        {activeTab === 'consignacao' && (
          <motion.div key="consignacao" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
             {/* Componente Modular do Horus para lidar nativamente com a Consignacao */}
             <div className="bg-white shadow-sm border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl overflow-hidden min-h-[600px]">
                 {token && <HorusConsignmentManager apiBaseUrl="/me/consignment" token={token} />}
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
