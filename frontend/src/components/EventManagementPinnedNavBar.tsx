'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  Check,
  ExternalLink,
  GripVertical,
  Pin,
  PlusCircle,
  RotateCcw,
  Send,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import { getUser } from '@/lib/auth';

export type EventosInternalTab = 'EVENTS' | 'NEW_EVENT' | 'VENUES' | 'CRM' | 'DISPATCH';

export interface EventosPinnedMenuItem {
  id: string;
  label: string;
  kind: 'internal' | 'external';
  internalTab?: EventosInternalTab;
  href?: string;
  iconName: 'events' | 'new_event' | 'venues' | 'crm' | 'dispatch' | 'mobile';
}

export const ALL_EVENTOS_MENU_OPTIONS: EventosPinnedMenuItem[] = [
  {
    id: 'events',
    label: 'Eventos',
    kind: 'internal',
    internalTab: 'EVENTS',
    iconName: 'events',
  },
  {
    id: 'new_event',
    label: 'Novo Evento',
    kind: 'internal',
    internalTab: 'NEW_EVENT',
    iconName: 'new_event',
  },
  {
    id: 'venues',
    label: 'Casas de Show',
    kind: 'internal',
    internalTab: 'VENUES',
    iconName: 'venues',
  },
  {
    id: 'crm',
    label: 'CRM Convidados',
    kind: 'internal',
    internalTab: 'CRM',
    iconName: 'crm',
  },
  {
    id: 'dispatch',
    label: 'Convites & WhatsApp',
    kind: 'internal',
    internalTab: 'DISPATCH',
    iconName: 'dispatch',
  },
  {
    id: 'mobile_mode',
    label: 'Modo Rápido Celular',
    kind: 'external',
    href: '/event-management/mobile',
    iconName: 'mobile',
  },
];

const DEFAULT_PINNED_IDS = ['events', 'new_event', 'venues', 'crm', 'dispatch'];

interface PinnedConfigState {
  id: string;
  pinned: boolean;
}

function getStorageKey(): string {
  if (typeof window === 'undefined') return 'cronuz_eventos_pinned_v1_default';
  try {
    const u = getUser();
    const uid = u?.id || u?.email || 'anon';
    const cid = u?.company_id || 'default';
    return `cronuz_eventos_pinned_v1_${cid}_${uid}`;
  } catch {
    return 'cronuz_eventos_pinned_v1_default';
  }
}

function renderIcon(iconName: EventosPinnedMenuItem['iconName'], className = 'w-3.5 h-3.5') {
  switch (iconName) {
    case 'events':
      return <Calendar className={className} />;
    case 'new_event':
      return <PlusCircle className={className} />;
    case 'venues':
      return <Building2 className={className} />;
    case 'crm':
      return <Users className={className} />;
    case 'dispatch':
      return <Send className={className} />;
    case 'mobile':
      return <Smartphone className={className} />;
    default:
      return <Calendar className={className} />;
  }
}

interface EventManagementPinnedNavBarProps {
  activeTab?: EventosInternalTab | 'EVENT_DETAIL';
  onSelectTab?: (tab: EventosInternalTab) => void;
  eventsCount?: number;
  contactsCount?: number;
  pendingQueueCount?: number;
}

export default function EventManagementPinnedNavBar({
  activeTab = 'EVENTS',
  onSelectTab,
  eventsCount = 0,
  contactsCount = 0,
  pendingQueueCount = 0,
}: EventManagementPinnedNavBarProps) {
  const router = useRouter();
  const [configList, setConfigList] = useState<PinnedConfigState[]>(() =>
    ALL_EVENTOS_MENU_OPTIONS.map((opt) => ({
      id: opt.id,
      pinned: DEFAULT_PINNED_IDS.includes(opt.id),
    }))
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftList, setDraftList] = useState<PinnedConfigState[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const loadFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const seen = new Map<string, boolean>();
        const ordered: PinnedConfigState[] = [];
        for (const item of parsed) {
          if (item && typeof item.id === 'string' && ALL_EVENTOS_MENU_OPTIONS.some((o) => o.id === item.id)) {
            if (!seen.has(item.id)) {
              seen.set(item.id, Boolean(item.pinned));
              ordered.push({ id: item.id, pinned: Boolean(item.pinned) });
            }
          }
        }
        for (const opt of ALL_EVENTOS_MENU_OPTIONS) {
          if (!seen.has(opt.id)) {
            ordered.push({ id: opt.id, pinned: DEFAULT_PINNED_IDS.includes(opt.id) });
          }
        }
        setConfigList(ordered);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const handleSaveConfig = () => {
    const hasInternal = draftList.some((d) => {
      const m = ALL_EVENTOS_MENU_OPTIONS.find((o) => o.id === d.id);
      return d.pinned && m?.kind === 'internal';
    });
    const ensured = hasInternal
      ? draftList
      : draftList.map((d) => (d.id === 'events' ? { ...d, pinned: true } : d));

    setConfigList(ensured);
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(ensured));
    } catch {
      // ignore
    }
    setIsModalOpen(false);
  };

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draftList.length) return;
    setDraftList((prev) => {
      const next = [...prev];
      const tmp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = tmp;
      return next;
    });
  };

  const pinnedItems = configList
    .filter((c) => c.pinned)
    .map((c) => ALL_EVENTOS_MENU_OPTIONS.find((o) => o.id === c.id))
    .filter((o): o is EventosPinnedMenuItem => Boolean(o));

  const handleTabClick = (tab: EventosInternalTab) => {
    if (onSelectTab) {
      onSelectTab(tab);
    } else {
      router.push(`/event-management?tab=${tab}`);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 bg-slate-100/90 dark:bg-slate-900 border border-slate-300/90 dark:border-slate-800 rounded-xl px-2.5 py-1.5 shadow-2xs overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 shrink-0">
            <Pin className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            Gestão Eventos
          </span>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5 shrink-0" />

          {pinnedItems.map((opt) => {
            if (opt.kind === 'internal' && opt.internalTab) {
              const isActive =
                activeTab === opt.internalTab ||
                (activeTab === 'EVENT_DETAIL' && opt.internalTab === 'EVENTS');
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleTabClick(opt.internalTab!)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all shrink-0 cursor-pointer border ${
                    isActive
                      ? 'bg-indigo-600 border-indigo-700 text-white font-bold shadow-2xs'
                      : 'bg-white/80 dark:bg-slate-900 border-transparent hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-white dark:hover:bg-slate-800'
                  }`}
                >
                  {renderIcon(opt.iconName, `w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`)}
                  <span>{opt.label}</span>
                  {opt.internalTab === 'EVENTS' && eventsCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {eventsCount}
                    </span>
                  )}
                  {opt.internalTab === 'CRM' && contactsCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {contactsCount}
                    </span>
                  )}
                  {opt.internalTab === 'DISPATCH' && pendingQueueCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                        isActive ? 'bg-amber-300 text-slate-950' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {pendingQueueCount} fila
                    </span>
                  )}
                </button>
              );
            }

            return (
              <Link
                key={opt.id}
                href={opt.href || '/event-management'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-300 transition-all shrink-0"
              >
                {renderIcon(opt.iconName, 'w-3.5 h-3.5 text-slate-400')}
                <span>{opt.label}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-40" />
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setDraftList(configList.map((c) => ({ ...c })));
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/50 text-[11px] font-semibold text-slate-600 hover:text-indigo-700 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
          title="Escolher e ordenar menus fixos do topo"
        >
          <Pin className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span className="hidden sm:inline">Menus</span>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                    Menus Fixos do Topo — Gestão de Eventos
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Marque e ordene os menus exibidos na barra superior.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-1.5 max-h-[55vh] overflow-y-auto">
              {draftList.map((item, idx) => {
                const meta = ALL_EVENTOS_MENU_OPTIONS.find((o) => o.id === item.id);
                if (!meta) return null;
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx === null || dragIdx === idx) return;
                      setDraftList((prev) => {
                        const copy = [...prev];
                        const [moved] = copy.splice(dragIdx, 1);
                        copy.splice(idx, 0, moved);
                        return copy;
                      });
                      setDragIdx(null);
                    }}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-all ${
                      item.pinned
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/70'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-3.5 h-3.5 text-slate-400 cursor-grab shrink-0" />
                      <input
                        type="checkbox"
                        checked={item.pinned}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDraftList((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, pinned: checked } : p))
                          );
                        }}
                        className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300 cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5 min-w-0">
                        {renderIcon(meta.iconName, 'w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0')}
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {meta.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveItem(idx, -1)}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === draftList.length - 1}
                        onClick={() => handleMoveItem(idx, 1)}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setDraftList(
                    ALL_EVENTOS_MENU_OPTIONS.map((opt) => ({
                      id: opt.id,
                      pinned: DEFAULT_PINNED_IDS.includes(opt.id),
                    }))
                  )
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Padrão
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
