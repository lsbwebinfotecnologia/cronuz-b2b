'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText,
  Download,
  Copy,
  CheckCircle2,
  Building2,
  Calendar,
  QrCode,
  Barcode,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface BillingInstallment {
  id: number;
  number: number;
  due_date: string | null;
  amount: number;
  status: string;
  has_boleto: boolean;
  digitable_line: string | null;
  pix_emv: string | null;
  download_url: string | null;
}

interface PublicBillingPortalData {
  token: string;
  entity_type: string;
  entity_id: number;
  reference_title: string;
  service_name: string;
  description: string;
  total_amount: number;
  execution_date: string | null;
  company: {
    id: number;
    name: string;
    trade_name: string;
    document: string | null;
    logo: string | null;
  };
  customer: {
    name: string;
    document: string | null;
    email: string | null;
  };
  has_invoice_pdf: boolean;
  invoice_number: string | null;
  invoice_download_url: string | null;
  installments: BillingInstallment[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const formatBRL = (val: number) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateBR = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
};

export default function PublicBillingPortalPage() {
  const params = useParams();
  const token = params?.token as string;

  const [data, setData] = useState<PublicBillingPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/public/billing-portal/${encodeURIComponent(token)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.detail || 'Não foi possível carregar os dados desta fatura.');
        }
        setData(body);
      } catch (e: any) {
        setError(e.message || 'Erro ao carregar fatura.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleCopy = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label} copiado(a) com sucesso!`);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-600">Carregando documentos da fatura...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-6 text-center shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Fatura Indisponível</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            {error || 'O link de fatura informado é inválido ou expirou.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/80 py-6 px-3 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Cabeçalho da Empresa Emissora */}
        <div className="bg-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" /> Portal Seguro de Faturamento
              </div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                {data.company.name}
              </h1>
              {data.company.document && (
                <p className="text-xs text-slate-400 font-mono">CNPJ: {data.company.document}</p>
              )}
            </div>

            <div className="sm:text-right bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Valor Total
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400">
                {formatBRL(data.total_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Dados do Cliente e Serviço */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                {data.reference_title}
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">
                {data.service_name}
              </h2>
            </div>
            {data.execution_date && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/70 w-fit">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Competência: {formatDateBR(data.execution_date)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Tomador / Cliente
              </span>
              <p className="font-bold text-slate-900 text-sm">{data.customer.name}</p>
              {data.customer.document && (
                <p className="text-slate-500 font-mono mt-0.5">CPF/CNPJ: {data.customer.document}</p>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Discriminação
              </span>
              <p className="text-slate-700 font-medium whitespace-pre-line line-clamp-3">
                {data.description}
              </p>
            </div>
          </div>

          {/* Bloco de Download da Nota Fiscal (NFS-e) */}
          {data.has_invoice_pdf && data.invoice_download_url && (
            <div className="pt-2">
              <a
                href={`${API_BASE}${data.invoice_download_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-950 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-emerald-950">
                      Nota Fiscal de Serviço Eletrônica (NFS-e)
                    </p>
                    <p className="text-xs text-emerald-700">
                      Clique para abrir ou salvar o PDF oficial da Nota Fiscal
                    </p>
                  </div>
                </div>
                <span className="px-3.5 py-2 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 shadow-xs">
                  <Download className="w-4 h-4" /> Baixar NFS-e
                </span>
              </a>
            </div>
          )}
        </div>

        {/* Lista de Boletos / Parcelas */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Barcode className="w-5 h-5 text-indigo-600" />
              Boleto(s) e Formas de Pagamento
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              {data.installments.length}{' '}
              {data.installments.length === 1 ? 'parcela' : 'parcelas'}
            </span>
          </div>

          {data.installments.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Nenhuma parcela vinculada a esta fatura no momento.
            </p>
          ) : (
            <div className="space-y-3">
              {data.installments.map((inst) => {
                const isPaid = ['PAID', 'PAGO'].includes(inst.status.toUpperCase());
                return (
                  <div
                    key={inst.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold">
                          {inst.number}ª Parcela
                        </span>
                        <span className="text-xs font-semibold text-slate-600">
                          Vencimento: <strong className="text-slate-900">{formatDateBR(inst.due_date)}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-900">
                          {formatBRL(inst.amount)}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isPaid ? 'Pago' : 'Em Aberto'}
                        </span>
                      </div>
                    </div>

                    {/* Ações do Boleto: Download PDF, Copiar Linha Digitável, Copiar Pix */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {inst.has_boleto && inst.download_url && (
                        <a
                          href={`${API_BASE}${inst.download_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition"
                        >
                          <Download className="w-4 h-4" />
                          Baixar Boleto (PDF)
                        </a>
                      )}

                      {inst.digitable_line && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              inst.digitable_line!,
                              `line-${inst.id}`,
                              'Linha digitável'
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold transition cursor-pointer"
                        >
                          {copiedKey === `line-${inst.id}` ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4 text-slate-500" />
                          )}
                          Copiar Linha Digitável
                        </button>
                      )}

                      {inst.pix_emv && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(inst.pix_emv!, `pix-${inst.id}`, 'Código Pix Copia e Cola')
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-bold transition cursor-pointer"
                        >
                          {copiedKey === `pix-${inst.id}` ? (
                            <CheckCircle2 className="w-4 h-4 text-teal-600" />
                          ) : (
                            <QrCode className="w-4 h-4 text-teal-600" />
                          )}
                          Copiar Pix Copia e Cola
                        </button>
                      )}
                    </div>

                    {inst.digitable_line && (
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-[11px] text-slate-600 break-all select-all">
                        {inst.digitable_line}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400 pt-2">
          Ambiente seguro emitido por <strong>{data.company.name}</strong> via Cronuz B2B.
        </p>
      </div>
    </div>
  );
}
