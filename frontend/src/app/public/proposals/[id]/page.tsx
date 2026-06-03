"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { 
  FileText, Calendar, FileClock, Building2, User, Inbox, Info, 
  X, Check, Loader2, ShieldAlert, Printer, Award, PenTool, Globe, AlertTriangle
} from 'lucide-react';

interface ProposalItem {
  id: number;
  item_type: 'PRODUCT' | 'SERVICE';
  product_id?: number;
  service_id?: number;
  quantity: number;
  unit_price: number;
  discount: number;
  total_price: number;
  custom_description?: string;
  product?: {
    id: number;
    name: string;
    sku: string;
  };
  service?: {
    id: number;
    name: string;
    description?: string;
  };
}

interface Proposal {
  id: number;
  local_id: number;
  title: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';
  valid_from: string;
  valid_until: string;
  relation_type: 'CUSTOMER' | 'LEAD' | 'MANUAL';
  customer_id?: number;
  lead_id?: string;
  manual_name?: string;
  manual_document?: string;
  manual_email?: string;
  manual_phone?: string;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  payment_method?: string;
  payment_condition?: string;
  notes?: string;
  created_at: string;
  converted_at?: string;
  
  signature_name?: string;
  signature_document?: string;
  signature_email?: string;
  signature_ip?: string;
  signature_at?: string;
  signature_user_agent?: string;
  
  company: {
    id: number;
    name: string;
    module_proposals: boolean;
  };
  items: ProposalItem[];
}

const statusColorMap: Record<string, string> = {
  "DRAFT": "bg-slate-100 text-slate-800 border-slate-200",
  "SENT": "bg-sky-100 text-sky-800 border-sky-200",
  "ACCEPTED": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "REJECTED": "bg-rose-100 text-rose-800 border-rose-200",
  "EXPIRED": "bg-amber-100 text-amber-850 border-amber-250",
  "CONVERTED": "bg-indigo-100 text-indigo-850 border-indigo-250"
};

const statusLabelMap: Record<string, string> = {
  "DRAFT": "Rascunho",
  "SENT": "Pendente de Aceite",
  "ACCEPTED": "Aceita & Assinada",
  "REJECTED": "Recusada",
  "EXPIRED": "Expirada",
  "CONVERTED": "Aprovada"
};

export default function PublicProposalViewPage() {
  const { id } = useParams() as { id: string };
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Sign Modal State
  const [showSignModal, setShowSignModal] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signName, setSignName] = useState('');
  const [signDoc, setSignDoc] = useState('');
  const [signEmail, setSignEmail] = useState('');

  const fetchProposal = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/proposals/public/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProposal(data);
        setError('');
      } else {
        if (res.status === 403) {
          setError('O módulo de propostas comerciais não está ativado para esta empresa.');
        } else {
          setError('A proposta comercial solicitada não foi encontrada ou não está disponível.');
        }
      }
    } catch (e) {
      console.error(e);
      setError('Erro de conexão ao carregar a proposta comercial.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposal();
  }, [id]);

  const isExpired = (validUntilStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validUntil = new Date(validUntilStr);
    validUntil.setHours(0, 0, 0, 0);
    return validUntil < today;
  };

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signName.trim() || !signDoc.trim() || !signEmail.trim()) {
      toast.error("Por favor, preencha todos os campos do termo de aceite.");
      return;
    }

    setIsSigning(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/proposals/public/${id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: signName,
          document: signDoc,
          email: signEmail
        })
      });

      if (res.ok) {
        const data = await res.json();
        setProposal(data);
        setShowSignModal(false);
        toast.success("Proposta comercial aceita e assinada digitalmente com sucesso!");
      } else {
        const err = await res.json();
        toast.error(`Erro: ${err.detail || 'Não foi possível registrar o aceite'}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexão com o servidor local.");
    } finally {
      setIsSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4 bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary-base)]" />
        <p className="text-slate-500 text-sm font-semibold">Carregando termos da proposta...</p>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
        <div className="p-8 max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center space-y-4 shadow-xl">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Proposta Indisponível</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{error || "Esta proposta comercial não pôde ser carregada."}</p>
        </div>
      </div>
    );
  }

  const proposalExpired = proposal.status === 'EXPIRED' || (proposal.status !== 'ACCEPTED' && proposal.status !== 'CONVERTED' && isExpired(proposal.valid_until));
  const canSign = proposal.status !== 'ACCEPTED' && proposal.status !== 'CONVERTED' && !proposalExpired;

  // Render correct title depending on state
  let finalStatusLabel = statusLabelMap[proposal.status] || proposal.status;
  let finalStatusClass = statusColorMap[proposal.status] || "bg-slate-100 text-slate-800 border-slate-200";

  if (proposalExpired) {
    finalStatusLabel = "Expirada";
    finalStatusClass = "bg-amber-100 text-amber-800 border-amber-200";
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950/40 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header toolbar */}
        <div className="flex flex-wrap justify-between items-center gap-4 print:hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Proposta de Negócio</p>
              <h1 className="text-sm font-black text-slate-850 dark:text-white mt-0.5">{proposal.company.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimir PDF
            </button>
            
            {canSign ? (
              <button
                onClick={() => setShowSignModal(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md"
              >
                <PenTool className="w-4 h-4" />
                Aceitar e Assinar
              </button>
            ) : (
              <div className={`px-4 py-2 border rounded-xl text-xs font-bold ${
                proposal.status === 'ACCEPTED' || proposal.status === 'CONVERTED' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400' 
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {proposal.status === 'ACCEPTED' || proposal.status === 'CONVERTED' ? '✓ Proposta Assinada' : 'Proposta Encerrada'}
              </div>
            )}
          </div>
        </div>

        {/* Signature Certificate info when signed */}
        {(proposal.status === 'ACCEPTED' || proposal.status === 'CONVERTED') && proposal.signature_name && (
          <div className="bg-gradient-to-r from-emerald-550/10 to-emerald-600/5 border border-emerald-200 dark:border-emerald-900/60 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-4 print:border-l-4 print:border-emerald-600">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl shrink-0">
              <Award className="w-7 h-7" />
            </div>
            <div className="space-y-2 flex-1">
              <h3 className="font-bold text-slate-850 dark:text-slate-100 text-base">Aceite e Assinatura Digital Efetuados</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Esta proposta comercial foi formalmente aceita e assinada digitalmente de acordo com as diretrizes locais.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2 text-xs border-t border-emerald-200/50 dark:border-emerald-900/30">
                <div>
                  <span className="text-slate-400 block">Signatário:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{proposal.signature_name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">CPF/CNPJ:</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono">{proposal.signature_document}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">E-mail de Contato:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{proposal.signature_email}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Data/Hora Assinatura:</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {proposal.signature_at ? new Date(proposal.signature_at).toLocaleString('pt-BR') : '-'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Endereço IP:</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-mono">{proposal.signature_ip}</strong>
                </div>
                <div className="sm:col-span-2 md:col-span-3">
                  <span className="text-slate-400 block">Assinatura do Dispositivo:</span>
                  <span className="text-[10px] text-slate-500 font-mono truncate block max-w-full" title={proposal.signature_user_agent}>
                    {proposal.signature_user_agent}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Budget Sheet Container */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-3xl shadow-xl overflow-hidden print:shadow-none print:border-none">
          
          {/* Cover & Brand details */}
          <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-950/20 p-8 border-b border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex gap-4 items-center">
              <div className="p-3 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] rounded-2xl">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold text-[var(--color-primary-base)] uppercase tracking-widest">Orçamento Comercial</p>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mt-0.5">#{proposal.local_id} - {proposal.title}</h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 mt-2 rounded-lg text-[10px] font-bold border ${finalStatusClass}`}>
                  {finalStatusLabel}
                </span>
              </div>
            </div>

            <div className="text-left md:text-right text-xs space-y-1.5 text-slate-500">
              <p className="flex md:justify-end items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Emitido em: <strong>{new Date(proposal.created_at).toLocaleDateString('pt-BR')}</strong></p>
              <p className="flex md:justify-end items-center gap-1.5"><FileClock className="w-3.5 h-3.5" /> Válido até: <strong className="text-amber-600 font-bold">{new Date(proposal.valid_until).toLocaleDateString('pt-BR')}</strong></p>
            </div>
          </div>

          {/* Supplier and Recipient Details */}
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Emitente</h3>
              <div className="space-y-1">
                <p className="font-extrabold text-slate-800 dark:text-slate-100 text-sm">{proposal.company.name}</p>
                <p className="text-xs text-slate-500">Documento emitido via Plataforma de Propostas Cronuz B2B.</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Destinatário</h3>
              {proposal.relation_type === 'CUSTOMER' ? (
                <div className="space-y-1">
                  <p className="font-bold text-slate-850 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[var(--color-primary-base)]" />
                    Cliente Corporativo Registrado
                  </p>
                  <p className="text-xs text-slate-500">Código de cadastro interno do cliente.</p>
                </div>
              ) : proposal.relation_type === 'LEAD' ? (
                <div className="space-y-1">
                  <p className="font-bold text-slate-850 dark:text-slate-100 text-sm flex items-center gap-2">
                    <Inbox className="w-4 h-4 text-sky-600" />
                    Contato Lead Comercial
                  </p>
                  <p className="text-xs text-slate-500">Cadastro prospectado para negociação comercial.</p>
                </div>
              ) : (
                <div className="space-y-1.5 text-xs text-slate-650 dark:text-slate-350">
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    {proposal.manual_name}
                  </p>
                  {proposal.manual_document && <p className="font-mono">Documento: {proposal.manual_document}</p>}
                  {proposal.manual_email && <p>Email: {proposal.manual_email}</p>}
                  {proposal.manual_phone && <p>Telefone: {proposal.manual_phone}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="p-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Especificação Comercial</h3>
            
            <div className="border border-slate-200 dark:border-slate-850 rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap md:whitespace-normal">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-850">
                  <tr>
                    <th className="px-6 py-3 w-24">Tipo</th>
                    <th className="px-6 py-3">Descrição do Item</th>
                    <th className="px-6 py-3 text-right w-32">Unitário</th>
                    <th className="px-6 py-3 text-center w-24">Qtd</th>
                    <th className="px-6 py-3 text-right w-28">Desconto</th>
                    <th className="px-6 py-3 text-right w-32">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-850">
                  {proposal.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          item.item_type === 'PRODUCT' 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/25 dark:text-amber-400' 
                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/25 dark:text-indigo-400'
                        }`}>
                          {item.item_type === 'PRODUCT' ? 'Produto' : 'Serviço'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col min-w-[200px] md:max-w-md">
                          <span className="font-semibold text-slate-855 dark:text-slate-100">
                            {item.item_type === 'PRODUCT' ? (item.product?.name || 'Produto') : (item.service?.name || 'Serviço')}
                          </span>
                          {item.item_type === 'PRODUCT' && item.product?.sku && (
                            <span className="text-xs text-slate-400 font-mono mt-0.5">SKU: {item.product.sku}</span>
                          )}
                          {item.custom_description && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic border-l-2 border-slate-300 dark:border-slate-700 pl-2 whitespace-pre-line">
                              {item.custom_description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-center font-extrabold text-slate-700 dark:text-slate-350">
                        {item.quantity}
                      </td>
                      <td className="px-6 py-4 text-right text-rose-600">
                        {item.discount > 0 ? `- R$ ${item.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-855 dark:text-slate-200">
                        R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes and Totals */}
          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8 bg-slate-50/20 dark:bg-slate-900/10 border-t border-slate-200 dark:border-slate-800/80">
            <div className="md:col-span-2 space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Condições Gerais & Observações</h4>
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-3 whitespace-pre-wrap">
                {proposal.payment_method && (
                  <p><strong>Meio de Pagamento Preferencial:</strong> {proposal.payment_method}</p>
                )}
                {proposal.payment_condition && (
                  <p><strong>Condição Comercial:</strong> {proposal.payment_condition}</p>
                )}
                {proposal.notes ? (
                  <p className="border-t border-slate-100 dark:border-slate-800/60 pt-2 mt-2">{proposal.notes}</p>
                ) : (
                  <p className="italic text-slate-400 mt-2">Nenhuma observação comercial adicional.</p>
                )}
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-slate-650 dark:text-slate-400">
                <span>Subtotal dos itens</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">R$ {proposal.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              {proposal.discount > 0 && (
                <div className="flex justify-between items-center text-rose-600 font-medium">
                  <span>Desconto concedido</span>
                  <span>- R$ {proposal.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              {proposal.shipping_cost > 0 && (
                <div className="flex justify-between items-center text-slate-650 dark:text-slate-400">
                  <span>Adicional Frete</span>
                  <span>R$ {proposal.shipping_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-lg font-black pt-3 border-t border-slate-200 dark:border-slate-800/80">
                <span className="text-slate-800 dark:text-slate-200">Valor Proposto</span>
                <span className="text-[var(--color-primary-base)]">R$ {proposal.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Acceptance & Sign Dialog */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/80 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-white">Assinatura Eletrônica da Proposta</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Preencha os dados do signatário para aceitar os termos comerciais.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSignModal(false)}
                className="text-slate-400 hover:text-slate-655 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSign} className="p-6 space-y-4">
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 uppercase tracking-wide mb-1">Nome Completo do Assinante <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos de Oliveira"
                    value={signName}
                    onChange={e => setSignName(e.target.value)}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-455 uppercase tracking-wide mb-1">CNPJ / CPF do Signatário <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Somente números (ex: 12345678909)"
                    value={signDoc}
                    onChange={e => setSignDoc(e.target.value)}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 font-mono dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-455 uppercase tracking-wide mb-1">E-mail Corporativo/Contato <span className="text-rose-500">*</span></label>
                  <input
                    type="email"
                    required
                    placeholder="carlos@empresa.com"
                    value={signEmail}
                    onChange={e => setSignEmail(e.target.value)}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                  />
                </div>
              </div>

              {/* Legal Notice */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800/80 rounded-2xl text-[10px] text-slate-500 space-y-1.5">
                <p className="font-bold flex items-center gap-1 text-amber-600 dark:text-amber-500">
                  <Info className="w-3.5 h-3.5" /> Declaração de Consentimento
                </p>
                <p>
                  Ao confirmar esta assinatura, você concorda com os preços, prazos, especificações e condições constantes neste documento.
                </p>
                <p>
                  Coletaremos seu endereço IP, data/hora e metadados de acesso para fins de validade e segurança do registro.
                </p>
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowSignModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-500 transition-colors"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={isSigning}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
                >
                  {isSigning && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar e Assinar
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
