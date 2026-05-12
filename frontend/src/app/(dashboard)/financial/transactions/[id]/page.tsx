'use client';

import { useState, useEffect, use } from 'react';
import { ArrowLeft, Clock, CheckCircle, Tag, TrendingUp, TrendingDown, DollarSign, Pencil, X, Save, FileText, QrCode, BookOpen, RefreshCw, Mail, Upload, Info } from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import Link from 'next/link';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';

const getCategoryHierarchyName = (cat: any, categories: any[]) => {
    let current = cat;
    let names = [];
    let safe = 0;
    while (current && safe < 10) {
        names.unshift(current.name);
        current = current.parent_id ? categories.find(c => c.id === current.parent_id) : null;
        safe++;
    }
    return names.join(' > ');
};

export default function FinancialTransactionDetailsPage({ params }: { params: any }) {
    const unwrappedParams = use(params) as { id: string };
    const [trans, setTrans] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [categories, setCategories] = useState<any[]>([]);
    const [interEnabled, setInterEnabled] = useState(false);

    const [editTransOpen, setEditTransOpen] = useState(false);
    const [editTransData, setEditTransData] = useState({ description: '', category_id: '', customer_id: '' });
    
    const [editingInst, setEditingInst] = useState<any>(null);
    const [instData, setInstData] = useState({ due_date: '', amount: 0 });
    const [saving, setSaving] = useState(false);

    // Email and Upload States
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [showEmailHistoryModal, setShowEmailHistoryModal] = useState(false);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateType, setSelectedTemplateType] = useState('FINANCIAL_INVOICE');
    const [toEmails, setToEmails] = useState('');
    const [attachInvoice, setAttachInvoice] = useState(true);
    const [attachBoletos, setAttachBoletos] = useState(true);
    const [sendingEmail, setSendingEmail] = useState(false);

    const fetchSettings = async (companyId: number) => {
        try {
            const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
            if (r.ok) {
                const d = await r.json();
                setInterEnabled(d.inter_enabled || false);
            }
        } catch(e) {}
    };

    useEffect(() => {
        fetchDetails();
        fetchCategories();
    }, []);

    const fetchDetails = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/transactions/${unwrappedParams.id}/details`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTrans(data);
                if (data.company_id) {
                    fetchSettings(data.company_id);
                } else {
                    const u = getUser();
                    if(u?.company_id) fetchSettings(u.company_id);
                }
                
                // Set initial template after fetch
                if ((window as any).__loadedTemplates) {
                    applyTemplate((window as any).__loadedTemplates, 'FINANCIAL_INVOICE', data);
                }
            }
            else toast.error("Transação não encontrada");
        } catch (e) {
            toast.error("Erro ao carregar detalhes");
        } finally {
            setLoading(false);
        }
    };

    const fetchTemplates = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/settings/email-templates`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
                (window as any).__loadedTemplates = data;
                if (trans) {
                    applyTemplate(data, 'FINANCIAL_INVOICE', trans);
                }
            }
        } catch (e) {}
    };

    const applyTemplate = (tpls: any[], type: string, transaction: any) => {
        const tpl = tpls.find(t => t.type === type);
        if (!tpl) return;
        
        const currentMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
        const cname = getUser()?.company_name || 'Nossa Empresa';
        const c_customer = transaction.customer ? transaction.customer.name : 'Cliente';
        const totalAmt = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(transaction.total_amount || 0);
        
        // Find next due date if any
        let dueDate = 'Vencimento';
        if (transaction.installments && transaction.installments.length > 0) {
            const nextInst = transaction.installments.find((i:any) => i.status !== 'PAID') || transaction.installments[0];
            dueDate = new Date(nextInst.due_date + "T12:00:00").toLocaleDateString('pt-BR');
        }
        
        const replacements: Record<string, string> = {
            '{month}': currentMonth,
            '{description}': transaction.description || 'Faturamento',
            '{company_name}': cname,
            '{customer_name}': c_customer,
            '{total_amount}': totalAmt,
            '{due_date}': dueDate
        };

        let sub = tpl.subject;
        let bdy = tpl.body_template;
        for (const [key, val] of Object.entries(replacements)) {
            sub = sub.replaceAll(key, val);
            bdy = bdy.replaceAll(key, val);
        }

        setEmailSubject(sub);
        setEmailBody(bdy);
        setSelectedTemplateType(type);
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            if (res.ok) setCategories(await res.json());
        } catch (e) {}
    };


    if (loading) return <div className="p-12 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
    if (!trans) return <div className="p-12 text-center text-slate-500">Transação não encontrada ou sem permissão.</div>;

    const isReceivable = trans.type === 'RECEIVABLE';

    const handleSaveTrans = async () => {
        if(!editTransData.description) return;
        setSaving(true);
        try {
            const payload = {
                description: editTransData.description,
                category_id: editTransData.category_id ? Number(editTransData.category_id) : null,
                customer_id: editTransData.customer_id ? Number(editTransData.customer_id) : null
            };
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/transactions/${trans.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            if(res.ok) {
                toast.success('Descrição atualizada');
                setEditTransOpen(false);
                fetchDetails();
            } else toast.error('Erro ao editar');
        } catch(e) { toast.error('Ocorreu um erro'); }
        setSaving(false);
    };

    const handleSaveInst = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${editingInst.id}/edit`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ due_date: instData.due_date, amount: Number(instData.amount) })
            });
            if(res.ok) {
                toast.success('Parcela atualizada');
                setEditingInst(null);
                fetchDetails();
            } else {
                const err = await res.json();
                toast.error(err.detail || 'Erro ao editar');
            }
        } catch(e) { toast.error('Ocorreu um erro'); }
        setSaving(false);
    };

    const handleIssueInterSlip = async (instId: number) => {
        const loadingId = toast.loading("Emitindo boleto no Banco Inter...");
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${instId}/issue-inter-slip`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            if (res.ok) {
                toast.success("Boleto emitido com sucesso!", { id: loadingId });
                fetchDetails(); // Reload to get PDF URL
            } else {
                const err = await res.json();
                toast.error(err.detail || "Erro ao emitir boleto", { id: loadingId });
            }
        } catch (e: any) {
            toast.error(e.message || "Falha na comunicação", { id: loadingId });
        }
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingPdf(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("transaction_id", trans.id.toString());

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/financial-invoice`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${getToken()}` },
                body: formData
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Erro ao fazer upload do PDF.");
            }
            toast.success("PDF da Nota Fiscal atrelado com sucesso!");
            fetchDetails();
        } catch (error: any) {
            toast.error(error.message || "Erro no upload do arquivo.");
        } finally {
            setUploadingPdf(false);
            e.target.value = '';
        }
    };

    const handleBoletoUpload = async (e: React.ChangeEvent<HTMLInputElement>, installmentId: number) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const loadingId = toast.loading("Enviando boleto...");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("installment_id", installmentId.toString());

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/financial-installment-boleto`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${getToken()}` },
                body: formData
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Erro ao fazer upload do PDF.");
            }
            toast.success("Boleto anexado com sucesso!", { id: loadingId });
            fetchDetails();
        } catch (error: any) {
            toast.error(error.message || "Erro no upload do arquivo.", { id: loadingId });
        } finally {
            e.target.value = '';
        }
    };

    const handleSendEmail = async () => {
        setSendingEmail(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/transactions/${trans.id}/send-email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    subject: emailSubject,
                    body: emailBody,
                    to_emails: toEmails,
                    attach_invoice: attachInvoice,
                    attach_boletos: attachBoletos
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Erro ao enviar e-mail.");
            }
            toast.success("E-mail enviado com sucesso para o cliente!");
            setShowEmailModal(false);
            fetchDetails();
        } catch (error: any) {
            toast.error(error.message || "Erro ao disparar e-mail.");
        } finally {
            setSendingEmail(false);
        }
    };

    const handleIssueAllBoletos = async () => {
        const pendingInsts = trans.installments.filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED' && !i.bank_slip_nosso_numero);
        if(pendingInsts.length === 0) {
            toast.info("Não há parcelas pendentes sem boleto emitido.");
            return;
        }
        if(!window.confirm(`Deseja emitir boletos para ${pendingInsts.length} parcela(s)?`)) return;
        
        const loadingId = toast.loading("Emitindo boletos...");
        let successCount = 0;
        for(const inst of pendingInsts) {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${inst.id}/issue-inter-slip`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${getToken()}` },
                });
                if(res.ok) successCount++;
            } catch(e) {}
        }
        if(successCount > 0) {
            toast.success(`${successCount} boleto(s) emitido(s) com sucesso!`, { id: loadingId });
            fetchDetails();
        } else {
            toast.error("Erro ao emitir boletos.", { id: loadingId });
        }
    };

    const openEmailModal = () => {
        // Find if we have customer email in trans.customer or we don't have it nested?
        // We might not have nested customer email. Let's just open modal.
        setShowEmailModal(true);
    };

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
            <Link href="/financial" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 dark:text-slate-400 dark:hover:text-white font-medium mb-2 w-fit">
                <ArrowLeft className="w-4 h-4"/> Voltar para Finanças
            </Link>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className={`p-8 border-b border-slate-200 dark:border-slate-800 ${isReceivable ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : 'bg-rose-50/30 dark:bg-rose-950/20'}`}>
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                        <div>
                            <div className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full mb-4 ${isReceivable ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400'}`}>
                                {isReceivable ? <TrendingUp className="w-4 h-4"/> : <TrendingDown className="w-4 h-4"/>}
                                {isReceivable ? 'RECEITA (ENTRADA)' : 'DESPESA (SAÍDA)'}
                            </div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
                                    {trans.description}
                                </h1>
                                {!trans.installments.some((i: any) => i.status === 'CANCELLED') && (
                                    <button onClick={()=>{
                                        setEditTransData({
                                            description: trans.description,
                                            category_id: trans.category_id || '',
                                            customer_id: trans.customer_id || ''
                                        }); 
                                        setEditTransOpen(true);
                                    }} className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg transition" title="Editar Escopo do Lançamento">
                                        <Pencil className="w-4 h-4"/>
                                    </button>
                                )}
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                                <Tag className="w-4 h-4"/> {trans.category_name}
                            </p>
                        </div>
                        <div className="text-left md:text-right">
                            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Valor Total Acordado</p>
                            <h2 className={`text-3xl font-black ${isReceivable ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500'}`}>
                                {new Intl.NumberFormat('pt-BR', {style: 'currency', currency:'BRL'}).format(trans.total_amount)}
                            </h2>
                        </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-slate-200/50 dark:border-slate-800/50 flex flex-wrap gap-3">
                        {isReceivable && interEnabled && (
                            <button onClick={handleIssueAllBoletos} className="px-4 py-2 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 rounded-xl font-bold text-sm transition flex items-center gap-2 shadow-sm border border-orange-200 dark:border-orange-800/50">
                                <QrCode className="w-4 h-4"/> Gerar Boletos
                            </button>
                        )}
                        <button onClick={openEmailModal} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition flex items-center gap-2 shadow-sm">
                            <Mail className="w-4 h-4"/> Enviar E-mail
                        </button>
                        {trans.email_sent_at && (
                            <button onClick={() => setShowEmailHistoryModal(true)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm transition flex items-center gap-2 shadow-sm border border-slate-200 dark:border-slate-700">
                                <Info className="w-4 h-4 text-emerald-500"/> Histórico de Envios
                            </button>
                        )}
                        <label className={`px-4 py-2 ${uploadingPdf ? 'bg-slate-300' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'} text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm transition flex items-center gap-2 cursor-pointer shadow-sm`}>
                            {uploadingPdf ? <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-b-transparent animate-spin"></div> : <Upload className="w-4 h-4"/>}
                            {uploadingPdf ? 'Enviando...' : 'Anexar NFS-e (PDF)'}
                            <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} disabled={uploadingPdf} />
                        </label>
                    </div>
                </div>

                <div className={`p-6 bg-slate-50/50 dark:bg-slate-900/50 grid grid-cols-1 ${(trans.order_id || trans.nfse_url || trans.nfse_number) ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-6`}>
                    <div className="p-4 bg-white dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Entidade / Cliente</p>
                        <p className="font-bold text-slate-900 dark:text-white">{trans.customer_name || 'Não Informado'}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Periodicidade</p>
                        <p className="font-bold text-slate-900 dark:text-white">{trans.is_fixed ? 'Recorrente (Mensalidade)' : 'Parcelado / Único'}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Data de Criação</p>
                        <p className="font-bold text-slate-900 dark:text-white">{new Date(trans.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                    {(trans.nfse_url || trans.nfse_number) && (
                        <div className="p-4 bg-white dark:bg-slate-950 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-900/10">
                            <p className="text-xs font-semibold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1">Nota Fiscal (NFS-e)</p>
                            {trans.nfse_number && (
                                <p className="font-bold text-slate-900 dark:text-white mb-2 max-w-[200px] truncate" title={trans.nfse_number}>
                                    Nº {(() => {
                                        const k = trans.nfse_number;
                                        if (k.startsWith('SUCESS_DUMMY_')) return k.replace('SUCESS_DUMMY_', '');
                                        if (k.length === 50) {
                                            const num = parseInt(k.substring(23, 36), 10);
                                            return num > 0 ? num : k.slice(-9);
                                        }
                                        return k;
                                    })()}
                                </p>
                            )}
                            {trans.nfse_url ? (
                                <a href={trans.nfse_url.startsWith('http') ? trans.nfse_url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${trans.nfse_url}`} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-900 dark:text-white hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1">
                                    <FileText className="w-4 h-4"/> Ver Documento PDF
                                </a>
                            ) : (
                                <span className="text-sm text-slate-500 dark:text-slate-400">PDF indisponível</span>
                            )}
                        </div>
                    )}
                    {trans.order_id && (
                        <div className="p-4 bg-white dark:bg-slate-950 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-900/10">
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider mb-1">Pedido Vinculado</p>
                            <Link href={`/orders/${trans.order_id}`} className="font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1">
                                Origem do sistema: #{trans.order_id}
                            </Link>
                        </div>
                    )}
                </div>

                <div className="p-8 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[var(--color-primary-base)]"/> Andamento de Parcelas
                    </h3>

                    <div className="space-y-4">
                        {trans.installments.map((inst: any, idx: number) => (
                            <div key={idx} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-[var(--color-primary-base)]/50 transition group">
                                <div className="flex items-center gap-4 mb-3 md:mb-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${inst.status === 'PAID' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                        {inst.number}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">Vencimento: {new Date(inst.due_date).toLocaleDateString('pt-BR')}</p>
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                            Valor: {new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(inst.amount)}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    {inst.status === 'PAID' ? (
                                        <div className="px-4 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 font-bold text-sm rounded-xl flex items-center gap-2 w-full md:w-auto justify-center">
                                            <CheckCircle className="w-4 h-4"/> Pago em {new Date(inst.payment_date).toLocaleDateString('pt-BR')}
                                        </div>
                                    ) : inst.status === 'OVERDUE' ? (
                                        <div className="px-4 py-2 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400 font-bold text-sm rounded-xl w-full md:w-auto text-center border border-rose-200 dark:border-rose-900">
                                            Atrasado
                                        </div>
                                    ) : inst.status === 'CANCELLED' ? (
                                        <div className="px-4 py-2 bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-bold text-sm rounded-xl w-full md:w-auto text-center border border-slate-300 dark:border-slate-700">
                                            Cancelado
                                        </div>
                                    ) : (
                                        <div className="px-4 py-2 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 font-bold text-sm rounded-xl w-full md:w-auto text-center border border-amber-200 dark:border-amber-900">
                                            Aberto / Pendente
                                        </div>
                                    )}
                                    {inst.bank_slip_nosso_numero && String(inst.bank_slip_nosso_numero).startsWith("V3_REQ|") ? (
                                        <button 
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                try {
                                                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/bank-slips/${inst.id}/sync-status`, {
                                                        method: 'PATCH',
                                                        headers: { 'Authorization': `Bearer ${getToken()}` }
                                                    });
                                                    if (res.ok) {
                                                        toast.success("Boleto sincronizado!");
                                                        fetchDetails();
                                                    } else {
                                                        const err = await res.json();
                                                        toast.error(err.detail || "Ainda em processamento.");
                                                    }
                                                } catch(err) { toast.error("Falha de rede"); }
                                            }}
                                            className="px-3 py-1.5 ml-1 hover:bg-slate-200 bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg shrink-0 flex items-center gap-1 font-bold text-xs border border-slate-300 dark:border-slate-600 cursor-pointer transition" title="Clique para sincronizar status atual">
                                            <RefreshCw className="w-3 h-3"/> Sincronizar
                                        </button>
                                    ) : inst.bank_slip_pdf_url || inst.bank_slip_nosso_numero ? (
                                        <a href={inst.bank_slip_pdf_url || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${inst.id}/bank-slip-pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 ml-1 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/50 dark:hover:bg-orange-900/70 text-orange-700 dark:text-orange-400 rounded-lg transition shrink-0 flex items-center gap-1 font-bold text-xs border border-orange-200 dark:border-orange-800" title="Ver Boleto (Inter/PDF)">
                                            <FileText className="w-3.5 h-3.5"/> Boleto PDF
                                        </a>
                                    ) : (
                                        <>
                                            {inst.status !== 'PAID' && inst.status !== 'CANCELLED' && isReceivable && interEnabled && (
                                                <button onClick={() => window.confirm("Deseja emitir boleto pelo Banco Inter para esta parcela?") && handleIssueInterSlip(inst.id)} className="p-2 ml-1 bg-slate-100 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-orange-900/30 text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg transition shrink-0 border border-transparent hover:border-orange-200 dark:hover:border-orange-800/50" title="Gerar Boleto Banco Inter">
                                                    <QrCode className="w-4 h-4"/>
                                                </button>
                                            )}
                                            {inst.status !== 'PAID' && inst.status !== 'CANCELLED' && (
                                                <label className="p-2 ml-1 cursor-pointer bg-slate-100 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-indigo-900/30 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition shrink-0" title="Anexar PDF do Boleto Manualmente">
                                                    <Upload className="w-4 h-4"/>
                                                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleBoletoUpload(e, inst.id)} />
                                                </label>
                                            )}
                                        </>
                                    )}

                                    {inst.status !== 'PAID' && inst.status !== 'CANCELLED' && (
                                        <button onClick={()=>{setInstData({due_date: new Date(inst.due_date).toISOString().split('T')[0], amount: inst.amount}); setEditingInst(inst);}} className="p-2 ml-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg transition shrink-0" title="Editar Valores da Parcela">
                                            <Pencil className="w-4 h-4"/>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {editTransOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Editar Transação</h3>
                            <button onClick={()=>setEditTransOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Descrição Principal</label>
                                <input type="text" value={editTransData.description} onChange={e=>setEditTransData({...editTransData, description: e.target.value})} className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Classificação</label>
                                <select value={editTransData.category_id} onChange={e=>setEditTransData({...editTransData, category_id: e.target.value})} className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20">
                                    <option value="">Selecione...</option>
                                    {categories
                                        .map(c => ({...c, hierarchy: getCategoryHierarchyName(c, categories)}))
                                        .sort((a, b) => a.hierarchy.localeCompare(b.hierarchy))
                                        .map(c => <option key={c.id} value={c.id}>{c.hierarchy}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Cliente / Fornecedor</label>
                                <CustomerAutocomplete 
                                    value={editTransData.customer_id}
                                    onChange={(id) => setEditTransData({...editTransData, customer_id: id})}
                                    placeholder="Sem vínculo com Entidade"
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
                            <button onClick={()=>setEditTransOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition">Cancelar</button>
                            <button onClick={handleSaveTrans} disabled={saving} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] transition disabled:opacity-50 flex items-center gap-2">
                                {saving ? 'Salvando...' : <Save className="w-4 h-4"/>}
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingInst && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Editar Parcela {editingInst.number}</h3>
                            <button onClick={()=>setEditingInst(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Vencimento</label>
                                <input type="date" value={instData.due_date} onChange={e=>setInstData({...instData, due_date: e.target.value})} className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Valor (R$)</label>
                                <input type="number" step="0.01" value={instData.amount} onChange={e=>setInstData({...instData, amount: parseFloat(e.target.value)})} className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20" />
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
                            <button onClick={()=>setEditingInst(null)} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition">Cancelar</button>
                            <button onClick={handleSaveInst} disabled={saving} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] transition disabled:opacity-50 flex items-center gap-2">
                                {saving ? 'Salvando...' : <Save className="w-4 h-4"/>}
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showEmailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-900/10">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>
                                Enviar para Cliente
                            </h3>
                            <button onClick={()=>setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Para (E-mails separados por vírgula)</label>
                                <input type="text" value={toEmails} onChange={e=>setToEmails(e.target.value)} placeholder="cliente@email.com, financeiro@email.com" className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600/20" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Modelo da Mensagem (Template)</label>
                                <select 
                                    value={selectedTemplateType} 
                                    onChange={e => applyTemplate(templates, e.target.value, trans)}
                                    className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600/20 mb-3"
                                >
                                    <option value="FINANCIAL_INVOICE">Faturamento Padrão</option>
                                    <option value="FINANCIAL_LATE">Cobrança de Atraso</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Assunto</label>
                                <input type="text" value={emailSubject} onChange={e=>setEmailSubject(e.target.value)} className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600/20" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Mensagem</label>
                                <textarea value={emailBody} onChange={e=>setEmailBody(e.target.value)} rows={4} className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600/20" placeholder="Olá, segue em anexo o faturamento referente aos serviços prestados..." />
                            </div>
                            
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Anexos Automáticos</p>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                        <input type="checkbox" checked={attachInvoice} onChange={e=>setAttachInvoice(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
                                        <div>
                                            <p className="font-semibold text-slate-900 dark:text-white text-sm">Nota Fiscal de Serviço (NFS-e)</p>
                                            <p className="text-xs text-slate-500">Se o PDF da NFS-e estiver anexado no sistema, será enviado.</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                        <input type="checkbox" checked={attachBoletos} onChange={e=>setAttachBoletos(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
                                        <div>
                                            <p className="font-semibold text-slate-900 dark:text-white text-sm">Boletos Bancários</p>
                                            <p className="text-xs text-slate-500">Baixa e envia todos os PDFs dos boletos já emitidos pelo Inter.</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
                            <button onClick={()=>setShowEmailModal(false)} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition">Cancelar</button>
                            <button onClick={handleSendEmail} disabled={sendingEmail || !toEmails} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2">
                                {sendingEmail ? <div className="w-4 h-4 rounded-full border-2 border-white border-b-transparent animate-spin"></div> : <Mail className="w-4 h-4"/>}
                                {sendingEmail ? 'Enviando...' : 'Disparar E-mail'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Histórico de E-mails */}
            {showEmailHistoryModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEmailHistoryModal(false)}></div>
                    <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                                    <Info className="w-5 h-5"/>
                                </div>
                                <h2 className="text-lg font-black text-slate-800 dark:text-white">Histórico de Disparos</h2>
                            </div>
                            <button onClick={() => setShowEmailHistoryModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {trans.email_logs && trans.email_logs.length > 0 ? (
                                <div className="space-y-4">
                                    {[...trans.email_logs].reverse().map((log: any, idx: number) => (
                                        <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="w-4 h-4 text-emerald-500" />
                                                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{log.subject}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase px-2 py-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                                                    {new Date(log.sent_at).toLocaleString('pt-BR')}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                                                <p><strong>Para:</strong> {log.to}</p>
                                                <p><strong>Enviado por:</strong> {log.user || 'Sistema'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-slate-500">
                                    Nenhum histórico encontrado.
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button onClick={() => setShowEmailHistoryModal(false)} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
