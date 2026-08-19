'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

interface Alert {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'urgent';
  dismissible: boolean;
}

interface StoreAlertBannerProps {
  companyId: number;
}

const ALERT_TYPE_STYLES: Record<Alert['type'], string> = {
  info:    'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/50 dark:border-sky-800 dark:text-sky-300',
  warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300',
  urgent:  'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300',
};

const ALERT_ICONS: Record<Alert['type'], string> = {
  info:    'ℹ️',
  warning: '⚠️',
  success: '✅',
  urgent:  '🔔',
};

const DISMISSED_KEY = (companyId: number) => 'cronuz_dismissed_alerts_' + companyId;

function getDismissedIds(companyId: number): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DISMISSED_KEY(companyId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDismissedId(companyId: number, id: number) {
  const current = getDismissedIds(companyId);
  if (!current.includes(id)) {
    localStorage.setItem(DISMISSED_KEY(companyId), JSON.stringify([...current, id]));
  }
}

export function StoreAlertBanner({ companyId }: StoreAlertBannerProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const rotateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const dismissed = getDismissedIds(companyId);
    fetch(
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/store/alerts?company_id=' + companyId
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Alert[]) => {
        const filtered = data.filter((a) => !dismissed.includes(a.id));
        setAlerts(filtered);
        if (filtered.length > 0) {
          setTimeout(() => setVisible(true), 50);
        }
      })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (alerts.length <= 1) return;
    rotateIntervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % alerts.length);
    }, 6000);
    return () => {
      if (rotateIntervalRef.current) clearInterval(rotateIntervalRef.current);
    };
  }, [alerts.length]);

  const handleDismiss = useCallback(
    (alertId: number) => {
      setDismissingId(alertId);
      saveDismissedId(companyId, alertId);
      setTimeout(() => {
        setAlerts((prev) => {
          const next = prev.filter((a) => a.id !== alertId);
          if (next.length === 0) setVisible(false);
          return next;
        });
        setCurrentIndex(0);
        setDismissingId(null);
      }, 300);
    },
    [companyId]
  );

  const goToSlide = (idx: number) => {
    if (rotateIntervalRef.current) clearInterval(rotateIntervalRef.current);
    setCurrentIndex(idx);
    if (alerts.length > 1) {
      rotateIntervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % alerts.length);
      }, 6000);
    }
  };

  if (alerts.length === 0) return null;

  const current = alerts[currentIndex] ?? alerts[0];
  const typeStyle = ALERT_TYPE_STYLES[current.type];
  const icon = ALERT_ICONS[current.type];
  const isDismissing = dismissingId === current.id;

  return (
    <div
      className={
        'border-b transition-all duration-300 ease-in-out overflow-hidden ' +
        typeStyle +
        (visible && !isDismissing ? ' max-h-20 opacity-100' : ' max-h-0 opacity-0')
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 min-h-[52px]">
        <span className="text-lg shrink-0 select-none" aria-hidden="true">
          {icon}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm leading-tight truncate">{current.title}</span>
          <span className="hidden sm:inline text-current opacity-40 select-none">·</span>
          <span className="text-sm leading-tight opacity-90 truncate">{current.message}</span>
        </div>
        {alerts.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            {alerts.map((a, idx) => (
              <button
                key={a.id}
                onClick={() => goToSlide(idx)}
                aria-label={'Ir para alerta ' + (idx + 1)}
                className={
                  'w-1.5 h-1.5 rounded-full transition-all ' +
                  (idx === currentIndex ? 'bg-current opacity-100 scale-110' : 'bg-current opacity-30')
                }
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
