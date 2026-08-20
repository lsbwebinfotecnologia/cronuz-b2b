'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { X, AlertTriangle, Info, CheckCircle, Bell } from 'lucide-react';

interface Alert {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'urgent';
  dismissible: boolean;
  scope: 'all' | 'home';
  pin_to_top: boolean;
}

interface StoreAlertBannerProps {
  companyId: number;
  /**
   * mode:
   *  'top'    → renderiza APENAS alertas com pin_to_top=true (acima do StoreHeader)
   *             Sem botão fechar — independe de dismissible
   *             Ideal para: instabilidade, manutenção, lançamentos críticos
   *  'inline' → renderiza APENAS alertas com pin_to_top=false (entre header e conteúdo)
   *             Com botão fechar quando dismissible=true
   */
  mode: 'top' | 'inline';
}

const TYPE_STYLES = {
  info:    { banner: 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/60 dark:border-sky-800 dark:text-sky-200',    top: 'bg-sky-600 text-white',    Icon: Info },
  warning: { banner: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-200', top: 'bg-amber-500 text-white',  Icon: AlertTriangle },
  success: { banner: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200', top: 'bg-emerald-600 text-white', Icon: CheckCircle },
  urgent:  { banner: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200', top: 'bg-rose-600 text-white',  Icon: Bell },
};

const DISMISSED_KEY = (id: number) => 'cronuz_dismissed_alerts_' + id;

function getDismissedIds(companyId: number): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DISMISSED_KEY(companyId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveDismissedId(companyId: number, id: number) {
  const current = getDismissedIds(companyId);
  if (!current.includes(id)) {
    localStorage.setItem(DISMISSED_KEY(companyId), JSON.stringify([...current, id]));
  }
}

export function StoreAlertBanner({ companyId, mode }: StoreAlertBannerProps) {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isHome = pathname === '/' || pathname === '';

  useEffect(() => {
    if (!companyId) return;
    const dismissed = getDismissedIds(companyId);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/store/alerts?company_id=${companyId}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Alert[]) => {
        const filtered = data.filter(a => {
          if (mode === 'top' && !a.pin_to_top) return false;
          if (mode === 'inline' && a.pin_to_top) return false;
          if (a.scope === 'home' && !isHome) return false;
          if (!a.pin_to_top && dismissed.includes(a.id)) return false;
          return true;
        });
        setAlerts(filtered);
        if (filtered.length > 0) setTimeout(() => setVisible(true), 50);
      })
      .catch(() => {});
  }, [companyId, mode, isHome]);

  useEffect(() => {
    if (alerts.length <= 1) return;
    rotateRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % alerts.length);
    }, 6000);
    return () => { if (rotateRef.current) clearInterval(rotateRef.current); };
  }, [alerts.length]);

  const handleDismiss = useCallback((alertId: number) => {
    setDismissingId(alertId);
    saveDismissedId(companyId, alertId);
    setTimeout(() => {
      setAlerts(prev => {
        const next = prev.filter(a => a.id !== alertId);
        if (next.length === 0) setVisible(false);
        return next;
      });
      setCurrentIndex(0);
      setDismissingId(null);
    }, 300);
  }, [companyId]);

  const goToSlide = (idx: number) => {
    if (rotateRef.current) clearInterval(rotateRef.current);
    setCurrentIndex(idx);
    if (alerts.length > 1) {
      rotateRef.current = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % alerts.length);
      }, 6000);
    }
  };

  if (alerts.length === 0) return null;

  const current = alerts[currentIndex] ?? alerts[0];
  const styles = TYPE_STYLES[current.type];
  const isDismissing = dismissingId === current.id;
  const Icon = styles.Icon;

  // MODO TOP — faixa sticky acima do header, sem dismiss, alta visibilidade
  if (mode === 'top') {
    return (
      <div className={`w-full ${styles.top} transition-all duration-300 ease-in-out overflow-hidden ${visible && !isDismissing ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-center gap-3 min-h-[36px]">
          <Icon className="w-4 h-4 shrink-0 opacity-90" aria-hidden="true" />
          <p className="text-sm font-semibold leading-tight text-center">
            <span className="font-bold">{current.title}</span>
            {current.message && <span className="font-normal opacity-90 ml-2">{current.message}</span>}
          </p>
          {alerts.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              {alerts.map((a, idx) => (
                <button
                  key={a.id}
                  onClick={() => goToSlide(idx)}
                  aria-label={`Alerta ${idx + 1}`}
                  className={`w-1.5 h-1.5 rounded-full transition-all bg-white ${idx === currentIndex ? 'opacity-100 scale-110' : 'opacity-40'}`}
                />
              ))}
            </div>
          )}
          {/* Sem botão fechar — pin_to_top sempre não dispensável */}
        </div>
      </div>
    );
  }

  // MODO INLINE — entre header e conteúdo, com dismiss opcional
  return (
    <div className={'border-b transition-all duration-300 ease-in-out overflow-hidden ' + styles.banner + (visible && !isDismissing ? ' max-h-20 opacity-100' : ' max-h-0 opacity-0')}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 min-h-[52px]">
        <Icon className="w-5 h-5 shrink-0 opacity-80" aria-hidden="true" />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm leading-tight">{current.title}</span>
          <span className="hidden sm:inline text-current opacity-40 select-none">·</span>
          <span className="text-sm leading-tight opacity-90">{current.message}</span>
        </div>
        {alerts.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            {alerts.map((a, idx) => (
              <button
                key={a.id}
                onClick={() => goToSlide(idx)}
                aria-label={`Alerta ${idx + 1}`}
                className={`w-1.5 h-1.5 rounded-full transition-all bg-current ${idx === currentIndex ? 'opacity-100 scale-110' : 'opacity-30'}`}
              />
            ))}
          </div>
        )}
        {current.dismissible && (
          <button
            onClick={() => handleDismiss(current.id)}
            aria-label="Fechar alerta"
            className="shrink-0 p-1 rounded-lg hover:bg-black/10 transition-colors opacity-60 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
