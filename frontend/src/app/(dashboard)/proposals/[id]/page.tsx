"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { 
  ArrowLeft, FileText, Printer, Check, X, ShieldAlert, Edit, 
  ExternalLink, FileCheck2, Loader2, Calendar, FileClock, ClipboardCheck, 
  DollarSign, MapPin, Building2, User, Inbox, Info, Sparkles
} from 'lucide-react';
import Link from 'next/link';

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
  items: ProposalItem[];
}

const statusColorMap: Record<string, string> = {
  "DRAFT": "bg-slate-100 text-slate-800 border-slate-200",
  "SENT": "bg-sky-100 text-sky-800 border-sky-200",
  "ACCEPTED": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "REJECTED": "bg-rose-100 text-rose-800 border-rose-200",
  "EXPIRED": "bg-amber-100 text-amber-800 border-amber-200",
  "CONVERTED": "bg-indigo-100 text-indigo-800 border-indigo-200"
};

const statusLabelMap: Record<string, string> = {
  "DRAFT": "Rascunho",
  "SENT": "Enviada",
  "ACCEPTED": "Aceita",
  "REJECTED": "Recusada",
  "EXPIRED": "Expirada",
  "CONVERTED": "Convertida em Pedido"
};

export default function ProposalDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Conversion Wizard State
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<{
    order_id?: number;
    service_order_ids?: number[];
  } | null>(null);

  // Promotion Form (LEAD/MANUAL -> CUSTOMER)
  const [custName, setCustName] = useState('');
  const [custDoc, setCustDoc] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custType, setCustType] = useState('PJ'); // PJ or PF

  // Promotion Address
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [ibgeCode, setIbgeCode] = useState('');
  const [loadingCep, setLoadingCep] = useState(false);

  const fetchProposal = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/proposals/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProposal(data);
        setError('');

        // Populate promotion wizard form in case it is lead/manual
        setCustName(data.manual_name || '');
        setCustDoc(data.manual_document || '');
        setCustEmail(data.manual_email || '');
        setCustPhone(data.manual_phone || '');
      } else {
        setError('Não foi possível carregar os detalhes desta proposta.');
      }
    } catch (e) {
      console.error(e);
      setError('Erro de conexão ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposal();
  }, [id]);

  // Update Status
  const handleUpdateStatus = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/proposals/${id}/status?status=${newStatus}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const updated = await res.json();
        setProposal(updated);
        alert(`Status alterado com sucesso para ${statusLabelMap[newStatus]}!`);
      } else {
        const err = await res.json();
        alert(`Erro: ${err.detail || 'Falha ao alterar status'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Falha de conexão com o servidor.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Auto-complete Address using ViaCEP
  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      if (res.ok) {
        const data = await res.json();
        if (!data.erro) {
          setStreet(data.logradouro || '');
          setNeighborhood(data.bairro || '');
          setCity(data.localidade || '');
          setState(data.uf || 'SP');
          setIbgeCode(data.ibge || '');
        }
      }
    } catch (e) {
      console.error("CEP fetch failed", e);
    } finally {
      setLoadingCep(false);
    }
  };

  // Convert Proposal
  const handleConvert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setIsConverting(true);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const payload = {
        customer_name: proposal?.relation_type !== 'CUSTOMER' ? custName : null,
        customer_document: proposal?.relation_type !== 'CUSTOMER' ? custDoc : null,
        customer_email: proposal?.relation_type !== 'CUSTOMER' ? custEmail : null,
        customer_phone: proposal?.relation_type !== 'CUSTOMER' ? custPhone : null,
        customer_type: proposal?.relation_type !== 'CUSTOMER' ? custType : 'PJ',
        address_street: proposal?.relation_type !== 'CUSTOMER' ? street : null,
        address_number: proposal?.relation_type !== 'CUSTOMER' ? number : null,
        address_complement: proposal?.relation_type !== 'CUSTOMER' ? complement : null,
        address_neighborhood: proposal?.relation_type !== 'CUSTOMER' ? neighborhood : null,
        address_city: proposal?.relation_type !== 'CUSTOMER' ? city : null,
        address_state: proposal?.relation_type !== 'CUSTOMER' ? state : null,
        address_zip_code: proposal?.relation_type !== 'CUSTOMER' ? cep : null,
        address_ibge_code: proposal?.relation_type !== 'CUSTOMER' ? ibgeCode : null
      };

      const res = await fetch(`${apiUrl}/proposals/${id}/convert`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setConversionResult(data);
        // Refresh proposal locally to show status = CONVERTED
        fetchProposal();
      } else {
        const err = await res.json();
        alert(`Erro na conversão: ${err.detail || 'Verifique os dados de cliente'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao realizar comunicação com o servidor.");
    } finally {
      setIsConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary-base)]" />
        <p className="text-slate-500 text-sm">Carregando detalhes da proposta comercial...</p>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-4 mt-12">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Proposta Não Encontrada</h2>
        <p className="text-slate-500 text-sm">{error || "Não conseguimos carregar a proposta selecionada."}</p>
        <Link href="/proposals" className="inline-block bg-[var(--color-primary-base)] text-white px-4 py-2 rounded-xl text-sm font-medium">
          Voltar para listagem
        </Link>
      </div>
    );
  }

  const hasProducts = proposal.items.some(i => i.item_type === 'PRODUCT');
  const hasServices = proposal.items.some(i => i.item_type === 'SERVICE');

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      
      {/* Action Buttons Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/proposals" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-sm font-semibold text-slate-500">Voltar para Propostas</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Print button */}
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Imprimir PDF
          </button>

          {/* Copy Public Link button */}
          <button 
            onClick={() => {
              const publicUrl = `${window.location.origin}/public/proposals/${proposal.id}`;
              navigator.clipboard.writeText(publicUrl);
              toast.success("Link público copiado com sucesso!");
            }}
            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-sm border border-emerald-200/50"
          >
            <ExternalLink className="w-4 h-4" />
            Copiar Link Público
          </button>

          {/* Open Public Link button */}
          <a
            href={`/public/proposals/${proposal.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Link Público
          </a>

          {proposal.status !== 'CONVERTED' && (
            <>
              {/* Edit button */}
              <Link
                href={`/proposals/new?proposal_id=${proposal.id}`}
                className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-sm border border-indigo-200/50"
              >
                <Edit className="w-4 h-4" />
                Editar Proposta
              </Link>

              {/* Status fast actions */}
              <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-1 gap-1">
                {proposal.status === 'DRAFT' && (
                  <button
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('SENT')}
                    className="text-xs bg-sky-50 hover:bg-sky-100 text-sky-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all"
                  >
                    Marcar como Enviada
                  </button>
                )}
                {proposal.status === 'SENT' && (
                  <>
                    <button
                      disabled={isUpdatingStatus}
                      onClick={() => handleUpdateStatus('ACCEPTED')}
                      className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all"
                    >
                      <Check className="w-3.5 h-3.5" /> Aceitar
                    </button>
                    <button
                      disabled={isUpdatingStatus}
                      onClick={() => handleUpdateStatus('REJECTED')}
                      className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all"
                    >
                      <X className="w-3.5 h-3.5" /> Recusar
                    </button>
                  </>
                )}
              </div>

              {/* Convert Button */}
              <button
                onClick={() => {
                  if (proposal.relation_type === 'CUSTOMER') {
                    // Direct conversion
                    if (confirm("Deseja converter esta proposta diretamente em Pedido e/ou Ordem de Serviço?")) {
                      handleConvert();
                    }
                  } else {
                    // Open promotion wizard
                    setShowConvertModal(true);
                  }
                }}
                disabled={isConverting}
                className="flex items-center gap-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md ml-2"
              >
                {isConverting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="w-4 h-4" />
                )}
                Converter para Pedido / OS
              </button>
            </>
          )}
        </div>
      </div>

      {/* Converted Success Banner */}
      {proposal.status === 'CONVERTED' && (
        <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 dark:from-indigo-950/20 dark:to-indigo-900/10 border border-indigo-200 dark:border-indigo-800 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden shadow-sm">
          <div className="flex gap-3">
            <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-600 shrink-0">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Esta proposta foi convertida!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Os itens propostos foram promovidos a fluxos comerciais ativos. Veja abaixo os documentos gerados.
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 pt-2 md:pt-0">
            {conversionResult?.order_id && (
              <Link 
                href={`/orders/${conversionResult.order_id}`}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                Visualizar Pedido Venda #{conversionResult.order_id}
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
            {conversionResult?.service_order_ids && conversionResult.service_order_ids.map(soId => (
              <Link 
                key={soId}
                href={`/services/orders/${soId}`}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                Visualizar Ordem Serviço #{soId}
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Printable Sheet Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden print:shadow-none print:border-none">
        
        {/* Top Header Grid */}
        <div className="bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950/40 p-8 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex gap-4 items-center">
            <div className="p-3 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] rounded-2xl">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--color-primary-base)] uppercase tracking-widest">Orçamento Comercial</p>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mt-0.5">#{proposal.local_id} - {proposal.title}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 mt-2 rounded text-[10px] font-bold border ${statusColorMap[proposal.status] || "bg-slate-100 text-slate-800"}`}>
                {statusLabelMap[proposal.status] || proposal.status}
              </span>
            </div>
          </div>

          <div className="text-left md:text-right text-xs space-y-1.5 text-slate-500">
            <p className="flex md:justify-end items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Emitido em: <strong>{new Date(proposal.created_at).toLocaleDateString('pt-BR')}</strong></p>
            <p className="flex md:justify-end items-center gap-1.5"><FileClock className="w-3.5 h-3.5" /> Válido até: <strong className="text-amber-600 font-bold">{new Date(proposal.valid_until).toLocaleDateString('pt-BR')}</strong></p>
            <p>ID da proposta: <code>{proposal.id}</code></p>
          </div>
        </div>

        {/* Destinatário & Emissor info */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Informações do Destinatário</h3>
            {proposal.relation_type === 'CUSTOMER' ? (
              <div className="space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[var(--color-primary-base)]" />
                  Cliente Cadastrado ID #{proposal.customer_id}
                </p>
                <p className="text-xs text-slate-500">Relação direta sincronizada na base B2B.</p>
              </div>
            ) : proposal.relation_type === 'LEAD' ? (
              <div className="space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-sky-600" />
                  Lead: {proposal.lead_id}
                </p>
                <p className="text-xs text-slate-500">Contato comercial originado da fila de leads.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  {proposal.manual_name}
                </p>
                {proposal.manual_document && <p className="text-xs text-slate-500 font-mono">Documento: {proposal.manual_document}</p>}
                {proposal.manual_email && <p className="text-xs text-slate-500">Email: {proposal.manual_email}</p>}
                {proposal.manual_phone && <p className="text-xs text-slate-500">Telefone: {proposal.manual_phone}</p>}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Termos & Pagamento</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-400">Meio de pagamento:</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{proposal.payment_method || 'PIX'}</p>
              </div>
              <div>
                <p className="text-slate-400">Condições de Pagamento:</p>
                <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{proposal.payment_condition || 'A Vista'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="p-8">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Especificação dos Itens Propostos</h3>
          
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3">Tipo</th>
                  <th className="px-6 py-3">Descrição / Item</th>
                  <th className="px-6 py-3 text-right">Unitário</th>
                  <th className="px-6 py-3 text-center">Qtd</th>
                  <th className="px-6 py-3 text-right">Desconto</th>
                  <th className="px-6 py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {proposal.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        item.item_type === 'PRODUCT' 
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400' 
                          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400'
                      }`}>
                        {item.item_type === 'PRODUCT' ? 'Produto' : 'Serviço'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {item.item_type === 'PRODUCT' ? (item.product?.name || 'Produto') : (item.service?.name || 'Serviço')}
                        </span>
                        {item.item_type === 'PRODUCT' && item.product?.sku && (
                          <span className="text-xs text-slate-400 font-mono mt-0.5">SKU: {item.product.sku}</span>
                        )}
                        {item.custom_description && (
                          <span className="text-xs text-slate-500 mt-1 italic border-l-2 border-slate-300 dark:border-slate-700 pl-2">
                            "{item.custom_description}"
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700 dark:text-slate-300">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 text-right text-rose-600">
                      {item.discount > 0 ? `- R$ ${item.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-200">
                      R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes & Totals Grid */}
        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8 bg-slate-50/20 dark:bg-slate-900/10 border-t border-slate-200 dark:border-slate-800">
          <div className="md:col-span-2 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Observações adicionais</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
              {proposal.notes || "Sem observações adicionais anexadas."}
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>Subtotal bruto</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">R$ {proposal.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            {proposal.discount > 0 && (
              <div className="flex justify-between items-center text-rose-600 font-medium">
                <span>Desconto global</span>
                <span>- R$ {proposal.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {proposal.shipping_cost > 0 && (
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>Custo Frete</span>
                <span>R$ {proposal.shipping_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-lg font-black pt-3 border-t border-slate-200 dark:border-slate-800">
              <span className="text-slate-800 dark:text-slate-200">Total Proposto</span>
              <span className="text-[var(--color-primary-base)]">R$ {proposal.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Promotion Conversion Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white">Assistente de Conversão & Cadastro</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Promova este contato a Cliente cadastrado antes de gerar os pedidos.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowConvertModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConvert} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              {/* Basic Fields */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-1">1. Dados Básicos do Cliente</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome Fantasia / Razão Social</label>
                    <input
                      type="text"
                      value={custName}
                      onChange={e => setCustName(e.target.value)}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--color-primary-base)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Documento (CPF / CNPJ)</label>
                    <input
                      type="text"
                      value={custDoc}
                      onChange={e => setCustDoc(e.target.value)}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-[var(--color-primary-base)] font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email Principal</label>
                    <input
                      type="email"
                      value={custEmail}
                      onChange={e => setCustEmail(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tipo de Cliente</label>
                    <select
                      value={custType}
                      onChange={e => setCustType(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none"
                    >
                      <option value="PJ">Pessoa Jurídica</option>
                      <option value="PF">Pessoa Física</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Address Fields */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                  2. Endereço de Faturamento
                </h4>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">CEP</label>
                    <input
                      type="text"
                      placeholder="99999-999"
                      value={cep}
                      onChange={e => setCep(e.target.value)}
                      onBlur={handleCepBlur}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none font-mono"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Logradouro / Rua</label>
                    <input
                      type="text"
                      placeholder="Av. Paulista, etc"
                      value={street}
                      onChange={e => setStreet(e.target.value)}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Número</label>
                    <input
                      type="text"
                      placeholder="123"
                      value={number}
                      onChange={e => setNumber(e.target.value)}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Complemento (opcional)</label>
                    <input
                      type="text"
                      placeholder="Sala 12, Bloco B"
                      value={complement}
                      onChange={e => setComplement(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Bairro</label>
                    <input
                      type="text"
                      value={neighborhood}
                      onChange={e => setNeighborhood(e.target.value)}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Cidade</label>
                    <input
                      type="text"
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Estado</label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="SP"
                      value={state}
                      onChange={e => setState(e.target.value)}
                      required
                      className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 outline-none font-bold uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons inside Modal */}
              <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConvertModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  {isConverting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar e Converter
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
