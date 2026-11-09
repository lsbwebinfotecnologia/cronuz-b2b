'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  SlidersHorizontal,
  Zap,
  LayoutGrid,
  PackageCheck,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Keyboard,
  HelpCircle,
} from 'lucide-react';

export type MeliStepNumber = 1 | 2 | 3 | 4;

interface StepDefinition {
  step: MeliStepNumber;
  title: string;
  subtitle: string;
  href: string;
  icon: any;
  shortcut: string;
}

const MELI_STEPS: StepDefinition[] = [
  {
    step: 1,
    title: '1. Instalar App & Regras',
    subtitle: 'Conectar Conta ML, MLB1196 e Markup',
    href: '/mercadolivre/settings',
    icon: SlidersHorizontal,
    shortcut: 'Alt+1',
  },
  {
    step: 2,
    title: '2. Publicar do Catálogo / Horus',
    subtitle: 'Criação 1-Clique com Ficha Automática',
    href: '/mercadolivre/publish',
    icon: Zap,
    shortcut: 'Alt+2',
  },
  {
    step: 3,
    title: '3. Controle de Anúncios & Estoque',
    subtitle: 'Planilha de Preços, Status e Sync Delta',
    href: '/mercadolivre',
    icon: LayoutGrid,
    shortcut: 'Alt+3',
  },
  {
    step: 4,
    title: '4. Pedidos & Expedição Horus',
    subtitle: 'Vendas ML, Envio ERP e Etiquetas',
    href: '/mercadolivre/orders',
    icon: PackageCheck,
    shortcut: 'Alt+4',
  },
];

interface MeliStepHeaderProps {
  currentStep: MeliStepNumber;
  title: string;
  explanation: string;
  guideSteps: string[];
  actions?: React.ReactNode;
}

export function MeliStepHeader({
  currentStep,
  title,
  explanation,
  guideSteps,
  actions,
}: MeliStepHeaderProps) {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          router.push('/mercadolivre/settings');
        } else if (e.key === '2') {
          e.preventDefault();
          router.push('/mercadolivre/publish');
        } else if (e.key === '3') {
          e.preventDefault();
          router.push('/mercadolivre');
        } else if (e.key === '4') {
          e.preventDefault();
          router.push('/mercadolivre/orders');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Faixa Superior: Jornada de 4 Etapas (Access Moderno) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
        {MELI_STEPS.map((item) => {
          const Icon = item.icon;
          const isActive = item.step === currentStep;
          const isPast = item.step < currentStep;

          return (
            <Link
              key={item.step}
              href={item.href}
              className={`flex items-center justify-between gap-3 px-4 py-3 border-b sm:border-b-0 sm:border-r last:border-r-0 border-slate-200/80 dark:border-slate-800 transition ${
                isActive
                  ? 'bg-amber-50/90 dark:bg-amber-950/30 text-slate-900 dark:text-white'
                  : 'hover:bg-white dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-black ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : isPast
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-extrabold truncate ${
                      isActive
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{item.subtitle}</p>
                </div>
              </div>
              <span className="hidden xl:inline-block font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-500 shrink-0">
                {item.shortcut}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Corpo do Cabeçalho: Título + Explicação Direta + Botão Primário Único */}
      <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[11px] font-extrabold uppercase">
              Etapa {currentStep} de 4
            </span>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              {title}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{explanation}</p>

          {/* Trilha Autoexplicativa em 3 passos curtos */}
          {guideSteps.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                <HelpCircle className="h-3.5 w-3.5" /> Como operar:
              </span>
              {guideSteps.map((g, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                >
                  <strong className="text-amber-600 dark:text-amber-400 font-mono">
                    {idx + 1}.
                  </strong>{' '}
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

interface MeliAccessFooterProps {
  currentIndex: number;
  totalCount: number;
  onSelectIndex: (idx: number) => void;
  extraHints?: string[];
}

export function MeliAccessFooter({
  currentIndex,
  totalCount,
  onSelectIndex,
  extraHints = ['↑↓ Navegar linhas', 'Enter Abrir/Fechar Ficha', 'F2 Salvar Edição', 'Esc Voltar'],
}: MeliAccessFooterProps) {
  const safeCurrent = totalCount > 0 ? Math.min(Math.max(0, currentIndex), totalCount - 1) : 0;

  return (
    <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm">
      {/* Navegador de Registros Estilo Access Moderno: |< < Registro X de N > >| */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={totalCount === 0 || safeCurrent === 0}
          onClick={() => onSelectIndex(0)}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          title="Primeiro Registro (Home)"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={totalCount === 0 || safeCurrent === 0}
          onClick={() => onSelectIndex(Math.max(0, safeCurrent - 1))}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          title="Registro Anterior (↑)"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-200">
          {totalCount > 0 ? `Registro ${safeCurrent + 1} de ${totalCount}` : '0 registros'}
        </div>

        <button
          type="button"
          disabled={totalCount === 0 || safeCurrent >= totalCount - 1}
          onClick={() => onSelectIndex(Math.min(totalCount - 1, safeCurrent + 1))}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          title="Próximo Registro (↓)"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={totalCount === 0 || safeCurrent >= totalCount - 1}
          onClick={() => onSelectIndex(Math.max(0, totalCount - 1))}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          title="Último Registro (End)"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Dicas de Teclado Excel / Access */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
          <Keyboard className="h-3.5 w-3.5 text-amber-500" /> Atalhos Planilha:
        </span>
        {extraHints.map((hint, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]"
          >
            {hint}
          </span>
        ))}
      </div>
    </div>
  );
}
