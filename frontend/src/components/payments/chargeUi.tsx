'use client';

import { getToken } from '@/lib/auth';

export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Charge {
  id: number;
  provider: string;
  environment: 'STAGE' | 'PRODUCTION';
  method: string;
  channel: string | null;
  origin_type: string;
  origin_ref: string | null;
  customer_id?: number | null;
  issue_date?: string | null;
  order_number?: string | null;
  pdv_coupon_number?: string | null;
  financial_launch_id?: string | null;
  installment_number?: string | null;
  invoice_number?: string | null;
  horus_cod_cli?: string | null;
  horus_id_guid?: string | null;
  origin_meta?: Record<string, any> | null;
  provider_charge_id: string | null;
  code: string | null;
  status: string;
  is_overdue: boolean;
  amount: number;
  total_paid: number | null;
  due_date: string | null;
  description: string | null;
  payer_name: string | null;
  payer_document: string | null;
  payer_email: string | null;
  payer: Record<string, any> | null;
  digitable_line: string | null;
  barcode: string | null;
  our_number: string | null;
  pix_emv: string | null;
  has_pdf: boolean;
  registered: boolean | null;
  paid_at: string | null;
  cancelled_at: string | null;
  replaces_charge_id: number | null;
  last_error: string | null;
  created_at: string | null;
  last_synced_at: string | null;
}

export interface ChargeSummary {
  total_qty: number;
  total_amount: number;
  due_qty: number;
  due_amount: number;
  overdue_qty: number;
  overdue_amount: number;
  paid_qty: number;
  paid_amount: number;
  cancelled_qty: number;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Processando',
  OPEN: 'Em aberto',
  LATE: 'Vencido',
  IN_PAYMENT: 'Em pagamento',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
  ERROR: 'Erro',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-300',
  OPEN: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300',
  LATE: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
  IN_PAYMENT: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300',
  PAID: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  CANCELLED: 'bg-slate-500/10 text-slate-500 border-slate-500/20 dark:text-slate-400',
  ERROR: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300',
};

export const ORIGIN_LABEL: Record<string, string> = {
  HORUS_SQL: 'Lançamento Horus (SQL)',
  HORUS_API: 'Lançamento Horus (API)',
  FINANCIAL: 'Financeiro Cronuz',
  B2B_ORDER: 'Pedido B2B',
  B2C_ORDER: 'Pedido B2C',
  PDV: 'Cupom PDV',
  SUBSCRIPTION: 'Assinatura',
  SERVICE_ORDER: 'Ordem de Serviço',
  MANUAL: 'Avulso',
};

const ORIGIN_STYLE: Record<string, string> = {
  HORUS_SQL: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-300',
  HORUS_API: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:text-indigo-300',
  FINANCIAL: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  B2B_ORDER: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300',
  B2C_ORDER: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300',
  PDV: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-300',
  MANUAL: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-300',
};

export function StatusBadge({ charge }: { charge: Pick<Charge, 'status' | 'is_overdue'> }) {
  const status = charge.is_overdue && charge.status === 'OPEN' ? 'LATE' : charge.status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${STATUS_STYLE[status] || STATUS_STYLE.PENDING}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function OriginBadge({ originType }: { originType: string }) {
  const style = ORIGIN_STYLE[originType] || ORIGIN_STYLE.MANUAL;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${style}`}>
      {ORIGIN_LABEL[originType] || originType}
    </span>
  );
}

export function OriginContextTags({ charge }: { charge: Charge }) {
  const tags: { label: string; value: string }[] = [];
  if (charge.financial_launch_id) {
    const parc = charge.installment_number ? `/${charge.installment_number}` : '';
    tags.push({ label: 'Lanç.', value: `#${charge.financial_launch_id}${parc}` });
  }
  if (charge.invoice_number) {
    tags.push({ label: 'NF', value: charge.invoice_number });
  }
  if (charge.order_number) {
    tags.push({ label: 'Pedido', value: `#${charge.order_number}` });
  }
  if (charge.pdv_coupon_number) {
    tags.push({ label: 'Cupom PDV', value: `#${charge.pdv_coupon_number}` });
  }
  if (tags.length === 0 && charge.origin_ref) {
    tags.push({ label: 'Ref', value: charge.origin_ref });
  }
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <OriginBadge originType={charge.origin_type} />
      {tags.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300">
          <span className="text-slate-400 font-sans">{t.label}:</span> {t.value}
        </span>
      ))}
    </div>
  );
}

export function EnvBadge({ env }: { env: string }) {
  if (env !== 'STAGE') return null;
  return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">STAGE</span>;
}

export const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '-';

export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR') : '-');

export const maskDoc = (d: string | null | undefined) => {
  if (!d) return '-';
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
};

export async function paymentsApi<T = any>(companyId: number | string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/companies/${companyId}/payments${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail
      : Array.isArray(body?.detail) ? body.detail.map((d: any) => d?.msg).filter(Boolean).join('; ') : '';
    throw new Error(detail || `Erro HTTP ${res.status}`);
  }
  return body as T;
}

export async function copyText(text: string | null | undefined) {
  if (!text) return false;
  await navigator.clipboard.writeText(text);
  return true;
}
