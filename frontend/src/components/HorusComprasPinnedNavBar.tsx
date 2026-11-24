'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Building2,
  Check,
  ClipboardList,
  DatabaseZap,
  ExternalLink,
  FileCheck2,
  GripVertical,
  LayoutGrid,
  Pin,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import { getUser } from '@/lib/auth';

export type ComprasInternalTab = 'DESK' | 'ORDERS' | 'XML_AUDIT' | 'BRANCH_CONFIG';

export interface ComprasPinnedMenuItem {
  id: string;
  label: string;
  kind: 'internal' | 'external';
  internalTab?: ComprasInternalTab;
  href?: string;
  iconName: 'desk' | 'orders' | 'xml' | 'branch_cfg' | 'analise_itens' | 'pedidos_venda' | 'branches';
}

export const ALL_COMPRAS_MENU_OPTIONS: ComprasPinnedMenuItem[] = [
  {
    id: 'desk',
    label: 'Mesa de Compras',
    kind: 'internal',
    internalTab: 'DESK',
    iconName: 'desk',
  },
  {
    id: 'orders',
    label: 'Pedidos',
    kind: 'internal',
    internalTab: 'ORDERS',
    iconName: 'orders',
  },
  {
    id: 'xml_audit',
    label: 'Auditoria de XML (NF-e)',
    kind: 'internal',
    internalTab: 'XML_AUDIT',
    iconName: 'xml',
  },
  {
    id: 'branch_cfg',
    label: 'Parâmetros & E-mail Filial',
    kind: 'internal',
    internalTab: 'BRANCH_CONFIG',
    iconName: 'branch_cfg',
  },
  {
    id: 'analise_itens',
    label: 'Análise de Itens',
    kind: 'external',
    href: '/horus-direct/analise-itens',
    iconName: 'analise_itens',
  },
  {
    id: 'pedidos_venda',
    label: 'Pedidos Venda (Horus)',
    kind: 'external',
    href: '/horus-direct/pedidos',
    iconName: 'pedidos_venda',
  },
  {
    id: 'branches',
    label: 'Filiais do Seller',
    kind: 'external',
    href: '/logistics/branches',
    iconName: 'branches',
  },
];

const DEFAULT_PINNED_IDS = ['desk', 'orders', 'xml_audit', 'analise_itens', 'pedidos_venda', 'branch_cfg'];

interface PinnedConfigState {
  id: string;
  pinned: boolean;
}

function getStorageKey(): string {
  if (typeof window === 'undefined') return 'cronuz_horus_compras_pinned_default';
  try {
    const u = getUser();
    const uid = u?.id || u?.email || 'anon';
    const cid = u?.company_id || 'default';
    return `cronuz_horus_compras_pinned_${cid}_${uid}`;
  } catch {
    return 'cronuz_horus_compras_pinned_default';
  }
}

function renderIcon(iconName: ComprasPinnedMenuItem['iconName'], className = 'w-3.5 h-3.5') {
  switch (iconName) {
    case 'desk':
      return <LayoutGrid className={className} />;
    case 'orders':
      return <ClipboardList className={className} />;
    case 'xml':
      return <FileCheck2 className={className} />;
    case 'branch_cfg':
      return <Settings2 className={className} />;
    case 'analise_itens':
      return <BarChart3 className={className} />;
    case 'pedidos_venda':
      return <DatabaseZap className={className} />;
    case 'branches':
      return <Building2 className={className} />;
    default:
      return <LayoutGrid className={className} />;
  }
}

interface HorusComprasPinnedNavBarProps {
  activeTab: ComprasInternalTab;
  onSelectTab: (tab: ComprasInternalTab) => void;
  ordersCount?: number;
  pendingXmlCount?: number;
  xmlOkCount?: number;
}

export default function HorusComprasPinnedNavBar({
  activeTab,
  onSelectTab,
  ordersCount = 0,
  pendingXmlCount = 0,
  xmlOkCount = 0,
}: HorusComprasPinnedNavBarProps) {
  const [configList, setConfigList] = useState<PinnedConfigState[]>(() =>
    ALL_COMPRAS_MENU_OPTIONS.map((opt) => ({
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
          if (item && typeof item.id === 'string' && ALL_COMPRAS_MENU_OPTIONS.some((o) => o.id === item.id)) {
            if (!seen.has(item.id)) {
              seen.set(item.id, Boolean(item.pinned));
              ordered.push({ id: item.id, pinned: Boolean(item.pinned) });
            }
          }
        }
        for (const opt of ALL_COMPRAS_MENU_OPTIONS) {
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
    const hasInternalPinned = draftList.some((d) => {
      const m = ALL_COMPRAS_MENU_OPTIONS.find((o) => o.id === d.id);
      return d.pinned && m?.kind === 'internal';
    });
    const ensured = hasInternalPinned
      ? draftList
      : draftList.map((d) => (d.id === 'desk' ? { ...d, pinned: true } : d));

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
    .map((c) => ALL_COMPRAS_MENU_OPTIONS.find((o) => o.id === c.id))
    .filter((o): o is ComprasPinnedMenuItem => Boolean(o));

  return (
    <>
      <div className="flex items-center justify-between gap-2 bg-slate-100/95 dark:bg-slate-900 border border-slate-300/90 dark:border-slate-800 rounded-xl px-2.5 py-1.5 shadow-2xs overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-200/90 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 shrink-0 border border-slate-300/80 dark:border-slate-700">
            <Pin className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            Menus Fixos
          </span>

          {pinnedItems.map((opt) => {
            if (opt.kind === 'internal' && opt.internalTab) {
              const isActive = activeTab === opt.internalTab;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectTab(opt.internalTab!)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all shrink-0 cursor-pointer border ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                      : 'bg-white dark:bg-slate-950/60 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-slate-800 hover:bg-indigo-50/70 dark:hover:bg-slate-800 hover:border-indigo-300'
                  }`}
                >
                  {renderIcon(opt.iconName, `w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`)}
                  <span>{opt.label}</span>
                  {opt.internalTab === 'ORDERS' && ordersCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-black ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {ordersCount}
                    </span>
                  )}
                  {opt.internalTab === 'XML_AUDIT' && pendingXmlCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-black ${
                        isActive ? 'bg-amber-300 text-slate-950' : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                      title="Notas com divergência aguardando análise posterior"
                    >
                      {pendingXmlCount} div.
                    </span>
                  )}
                  {opt.internalTab === 'XML_AUDIT' && pendingXmlCount === 0 && xmlOkCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-black ${
                        isActive ? 'bg-emerald-300 text-slate-950' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {xmlOkCount} OK
                    </span>
                  )}
                </button>
              );
            }

            return (
              <Link
                key={opt.id}
                href={opt.href || '/horus-direct/compras'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/80 dark:bg-slate-950/40 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:text-indigo-700 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-all shrink-0"
              >
                {renderIcon(opt.iconName, 'w-3.5 h-3.5 text-slate-400')}
                <span>{opt.label}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-50" />
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
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/50 text-[11px] font-bold text-slate-700 hover:text-indigo-700 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
          title="Escolher e reordenar os menus fixos do topo"
        >
          <Pin className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span className="hidden sm:inline">Fixar / Ordenar</span>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-extrabold">Personalizar Menus Fixos do Topo</h3>
                  <p className="text-[11px] text-slate-300">
                    Escolha os objetos e atalhos exibidos na faixa superior (salvo no seu usuário).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-300 hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
              {draftList.map((item, idx) => {
                const meta = ALL_COMPRAS_MENU_OPTIONS.find((o) => o.id === item.id);
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
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                      item.pinned
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-75'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <GripVertical className="w-4 h-4 text-slate-400 cursor-grab shrink-0" />
                      <input
                        type="checkbox"
                        checked={item.pinned}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDraftList((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, pinned: checked } : p))
                          );
                        }}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 cursor-pointer"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        {renderIcon(meta.iconName, 'w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0')}
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">
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

            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setDraftList(
                    ALL_COMPRAS_MENU_OPTIONS.map((opt) => ({
                      id: opt.id,
                      pinned: DEFAULT_PINNED_IDS.includes(opt.id),
                    }))
                  )
                }
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar Padrão
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar Barra
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
