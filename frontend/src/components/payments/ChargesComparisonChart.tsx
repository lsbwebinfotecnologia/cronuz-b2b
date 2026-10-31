'use client';

import { useMemo, useState } from 'react';
import { brl } from './chargeUi';

export interface SeriesPoint {
  month: string;            // YYYY-MM
  generated_qty: number;
  generated_amount: number;
  paid_qty: number;
  paid_amount: number;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Gráfico de barras agrupadas (gerados × pagos) em SVG puro — sem dependências. */
export default function ChargesComparisonChart({ series }: { series: SeriesPoint[] }) {
  const [mode, setMode] = useState<'amount' | 'qty'>('amount');
  const [hover, setHover] = useState<number | null>(null);

  const values = useMemo(() => series.map(s => ({
    gen: mode === 'amount' ? s.generated_amount : s.generated_qty,
    paid: mode === 'amount' ? s.paid_amount : s.paid_qty,
  })), [series, mode]);
  const max = Math.max(1, ...values.flatMap(v => [v.gen, v.paid]));

  const W = 720, H = 220, padL = 8, padB = 24, padT = 10;
  const slot = (W - padL) / Math.max(1, series.length);
  const barW = Math.max(4, Math.min(22, slot / 3));
  const y = (v: number) => H - padB - ((H - padB - padT) * v) / max;
  const fmt = (v: number) => (mode === 'amount' ? brl(v) : `${v}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Gerados</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Pagos</span>
        </div>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-xs">
          {(['amount', 'qty'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md font-semibold ${mode === m ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500'}`}>
              {m === 'amount' ? 'Valor' : 'Quantidade'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px] h-56" role="img" aria-label="Comparativo de boletos gerados e pagos por mês">
          {[0.25, 0.5, 0.75, 1].map(t => (
            <line key={t} x1={padL} x2={W} y1={y(max * t)} y2={y(max * t)} className="stroke-slate-200 dark:stroke-slate-800" strokeDasharray="3 3" />
          ))}
          {series.map((s, i) => {
            const cx = padL + slot * i + slot / 2;
            const v = values[i];
            return (
              <g key={s.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + slot * i} y={padT} width={slot} height={H - padB - padT} className={hover === i ? 'fill-slate-100 dark:fill-slate-800/60' : 'fill-transparent'} />
                <rect x={cx - barW - 1} y={y(v.gen)} width={barW} height={Math.max(0, H - padB - y(v.gen))} rx={3} className="fill-sky-500" />
                <rect x={cx + 1} y={y(v.paid)} width={barW} height={Math.max(0, H - padB - y(v.paid))} rx={3} className="fill-emerald-500" />
                <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">{label(s.month)}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && series[hover] && (
          <div className="pointer-events-none absolute top-2 left-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow dark:border-slate-700 dark:bg-slate-900/95">
            <p className="font-bold mb-1">{label(series[hover].month)}</p>
            <p className="text-sky-600">Gerados: {series[hover].generated_qty} · {brl(series[hover].generated_amount)}</p>
            <p className="text-emerald-600">Pagos: {series[hover].paid_qty} · {brl(series[hover].paid_amount)}</p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500">Escala máxima: {fmt(max)}. Gerados pelo mês de emissão; pagos pelo mês de pagamento.</p>
    </div>
  );
}
