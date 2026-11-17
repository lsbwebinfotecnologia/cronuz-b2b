'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Pin,
  Building2,
  Package,
  FileText,
  Layers,
  BookOpen,
  Users,
  DatabaseZap,
  LayoutGrid,
  ArrowUp,
  ArrowDown,
  GripVertical,
  X,
  Check,
  RotateCcw,
} from 'lucide-react';
import { getUser } from '@/lib/auth';

export interface DbmMenuOption {
  id: string;
  label: string;
  href: string;
  iconName: 'home' | 'companies' | 'products' | 'proposals' | 'desk' | 'ebooks' | 'authors' | 'invoices';
}

export const ALL_DBM_MENU_OPTIONS: DbmMenuOption[] = [
  { id: 'home', label: 'Menu DBM', href: '/dbm', iconName: 'home' },
  { id: 'companies', label: 'Empresas', href: '/dbm/companies', iconName: 'companies' },
  { id: 'products', label: 'Pesquisa de Produtos', href: '/dbm/products', iconName: 'products' },
  { id: 'proposals', label: 'Orçamentos & Propostas', href: '/dbm/proposals', iconName: 'proposals' },
  { id: 'desk', label: 'Mesa de Propostas', href: '/proposals/desk', iconName: 'desk' },
  { id: 'ebooks', label: 'E-books (Pearson / Bookwire)', href: '/dbm/ebooks/pearson', iconName: 'ebooks' },
  { id: 'authors', label: 'Autores', href: '/authors', iconName: 'authors' },
  { id: 'invoices', label: 'Faturas / Pedidos Horus', href: '/horus-direct/pedidos', iconName: 'invoices' },
];

const DEFAULT_PINNED_IDS = ['home', 'companies', 'products', 'proposals'];

interface PinnedMenuConfigItem {
  id: string;
  pinned: boolean;
}

function getStorageKey(): string {
  if (typeof window === 'undefined') return 'cronuz_dbm_pinned_menus_default';
  try {
    const u = getUser();
    const uid = u?.id || u?.email || 'anon';
    const cid = u?.company_id || 'default';
    return `cronuz_dbm_pinned_menus_${cid}_${uid}`;
  } catch {
    return 'cronuz_dbm_pinned_menus_default';
  }
}

function renderMenuIcon(iconName: DbmMenuOption['iconName'], className = 'w-3.5 h-3.5') {
  switch (iconName) {
    case 'home':
      return <LayoutGrid className={className} />;
    case 'companies':
      return <Building2 className={className} />;
    case 'products':
      return <Package className={className} />;
    case 'proposals':
      return <FileText className={className} />;
    case 'desk':
      return <Layers className={className} />;
    case 'ebooks':
      return <BookOpen className={className} />;
    case 'authors':
      return <Users className={className} />;
    case 'invoices':
      return <DatabaseZap className={className} />;
    default:
      return <LayoutGrid className={className} />;
  }
}

export default function DbmPinnedNavBar({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const [configList, setConfigList] = useState<PinnedMenuConfigItem[]>(() =>
    ALL_DBM_MENU_OPTIONS.map((opt) => ({
      id: opt.id,
      pinned: DEFAULT_PINNED_IDS.includes(opt.id),
    }))
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftList, setDraftList] = useState<PinnedMenuConfigItem[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const loadFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = getStorageKey();
      const raw = localStorage.getItem(key) || localStorage.getItem('cronuz_dbm_pinned_menus_default');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validMap = new Map<string, boolean>();
          const ordered: PinnedMenuConfigItem[] = [];
          for (const item of parsed) {
            if (item && typeof item.id === 'string' && ALL_DBM_MENU_OPTIONS.some((o) => o.id === item.id)) {
              if (!validMap.has(item.id)) {
                validMap.set(item.id, Boolean(item.pinned));
                ordered.push({ id: item.id, pinned: Boolean(item.pinned) });
              }
            }
          }
          for (const opt of ALL_DBM_MENU_OPTIONS) {
            if (!validMap.has(opt.id)) {
              ordered.push({ id: opt.id, pinned: DEFAULT_PINNED_IDS.includes(opt.id) });
            }
          }
          setConfigList(ordered);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar menus fixos do DBM:', e);
    }
  }, []);

  useEffect(() => {
    loadFromStorage();
    const onSync = () => loadFromStorage();
    window.addEventListener('cronuz-dbm-pinned-updated', onSync);
    return () => window.removeEventListener('cronuz-dbm-pinned-updated', onSync);
  }, [loadFromStorage]);

  const handleOpenModal = () => {
    setDraftList(configList.map((c) => ({ ...c })));
    setIsModalOpen(true);
  };

  const handleSaveConfig = () => {
    const ensured = draftList.some((d) => d.pinned)
      ? draftList
      : draftList.map((d) => (d.id === 'home' ? { ...d, pinned: true } : d));
    setConfigList(ensured);
    try {
      const key = getStorageKey();
      localStorage.setItem(key, JSON.stringify(ensured));
      localStorage.setItem('cronuz_dbm_pinned_menus_default', JSON.stringify(ensured));
      window.dispatchEvent(new Event('cronuz-dbm-pinned-updated'));
    } catch (e) {
      console.error('Erro ao salvar menus fixos do DBM:', e);
    }
    setIsModalOpen(false);
  };

  const handleResetDefaults = () => {
    setDraftList(
      ALL_DBM_MENU_OPTIONS.map((opt) => ({
        id: opt.id,
        pinned: DEFAULT_PINNED_IDS.includes(opt.id),
      }))
    );
  };

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draftList.length) return;
    setDraftList((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const pinnedOptions = configList
    .filter((c) => c.pinned)
    .map((c) => ALL_DBM_MENU_OPTIONS.find((o) => o.id === c.id))
    .filter((o): o is DbmMenuOption => Boolean(o));

  return (
    <>
      <div
        className={`flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 shadow-2xs overflow-x-auto scrollbar-none ${className}`}
      >
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
            <Pin className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            Atalhos Fixos DBM
          </span>

          {pinnedOptions.map((opt) => {
            const isActive =
              opt.href === '/dbm'
                ? pathname === '/dbm'
                : pathname === opt.href || pathname?.startsWith(`${opt.href}/`);
            return (
              <Link
                key={opt.id}
                href={opt.href}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {renderMenuIcon(opt.iconName, `w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`)}
                <span>{opt.label}</span>
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/50 text-[11px] font-semibold text-slate-600 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-300 transition-colors shrink-0 cursor-pointer"
          title="Escolher quais menus fixar no topo e definir a ordem de exibição para o seu usuário"
        >
          <Pin className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span>Fixar / Ordenar Menus</span>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Menus Fixos do Topo DBM
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Marque as telas que deseja fixar e arraste ou use as setas para ordenar (salvo no seu usuário).
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

            <div className="p-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
              {draftList.map((item, idx) => {
                const meta = ALL_DBM_MENU_OPTIONS.find((o) => o.id === item.id);
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
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/70'
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
                        {renderMenuIcon(meta.iconName, 'w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0')}
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {meta.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveItem(idx, -1)}
                        className="p-1 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer"
                        title="Mover para cima"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === draftList.length - 1}
                        onClick={() => handleMoveItem(idx, 1)}
                        className="p-1 rounded hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 text-slate-500 disabled:opacity-30 cursor-pointer"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Padrão
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar no Meu Usuário
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
