'use client';

import { useState, useMemo } from 'react';
import {
  User,
  Mail,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Compass,
  Sparkles,
  Search,
  CheckSquare,
  Square,
  ChevronDown,
  Check,
  Filter,
  Layers
} from 'lucide-react';
import {
  INITIAL_PAGE_OPTIONS,
  MODULE_PERMISSION_CATEGORIES,
  MODULE_PERMISSIONS_LIST,
  USER_ROLE_PRESETS,
  RolePreset
} from './userPermissionsConfig';

export interface UserAccessFormValues {
  name: string;
  email: string;
  document: string;
  password: string;
  initialPage: string;
  grantFullAccess: boolean;
  allowedModules: string[];
}

interface UserAccessFormProps {
  mode: 'create' | 'edit';
  values: UserAccessFormValues;
  onChange: (next: UserAccessFormValues) => void;
  company: any;
}

export function UserAccessForm({ mode, values, onChange, company }: UserAccessFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [onlyCompanyActiveModules, setOnlyCompanyActiveModules] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Agrupar opções de tela inicial por grupo
  const groupedInitialPages = useMemo(() => {
    const groups: Record<string, typeof INITIAL_PAGE_OPTIONS> = {};
    INITIAL_PAGE_OPTIONS.forEach((opt) => {
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push(opt);
    });
    return groups;
  }, []);

  const toggleModule = (modId: string) => {
    const exists = values.allowedModules.includes(modId);
    const nextModules = exists
      ? values.allowedModules.filter((m) => m !== modId)
      : [...values.allowedModules, modId];
    onChange({
      ...values,
      grantFullAccess: false,
      allowedModules: nextModules,
    });
  };

  const handleApplyPreset = (preset: RolePreset) => {
    if (preset.fullAccess) {
      onChange({
        ...values,
        initialPage: preset.initialPage,
        grantFullAccess: true,
        allowedModules: [],
      });
    } else {
      onChange({
        ...values,
        initialPage: preset.initialPage,
        grantFullAccess: false,
        allowedModules: [...preset.modules],
      });
    }
  };

  const handleSelectAllCompanyActive = () => {
    const activeIds = MODULE_PERMISSIONS_LIST.filter((m) =>
      m.companyCheck ? m.companyCheck(company) : true
    ).map((m) => m.id);
    onChange({
      ...values,
      grantFullAccess: false,
      allowedModules: activeIds,
    });
  };

  const handleToggleCategoryAll = (categoryId: string, categoryModuleIds: string[]) => {
    const allSelected = categoryModuleIds.every((id) => values.allowedModules.includes(id));
    if (allSelected) {
      onChange({
        ...values,
        grantFullAccess: false,
        allowedModules: values.allowedModules.filter((id) => !categoryModuleIds.includes(id)),
      });
    } else {
      const merged = Array.from(new Set([...values.allowedModules, ...categoryModuleIds]));
      onChange({
        ...values,
        grantFullAccess: false,
        allowedModules: merged,
      });
    }
  };

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* COLUNA ESQUERDA (5 cols): DADOS DO LOGIN + REDIRECIONAMENTO + PERFIS RÁPIDOS */}
      <div className="lg:col-span-5 space-y-5">
        {/* Card 1: Dados de Identificação e Credenciais */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                1. Credenciais do Operador
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Dados de identificação e login de acesso ao painel Seller.
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Nome Completo *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={values.name}
                  onChange={(e) => onChange({ ...values, name: e.target.value })}
                  placeholder="Ex: Maria Oliveira (Comercial)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                E-mail de Login *
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={values.email}
                  onChange={(e) => onChange({ ...values, email: e.target.value })}
                  placeholder="operador@empresa.com.br"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  CPF / Documento <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={values.document}
                    onChange={(e) => onChange({ ...values, document: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {mode === 'create' ? 'Senha Inicial *' : 'Nova Senha (Opcional)'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={mode === 'create'}
                    value={values.password}
                    onChange={(e) => onChange({ ...values, password: e.target.value })}
                    placeholder={mode === 'create' ? 'Mín. 6 caracteres' : 'Manter senha atual'}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-9 pr-9 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Tela Inicial & Perfis Rápidos de Função */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-4">
          <div className="border-b border-slate-200/80 dark:border-slate-800 pb-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              2. Redirecionamento & Perfil Rápido
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Escolha para qual tela o usuário vai ao logar ou aplique um modelo pronto de função.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              Tela Inicial ao Fazer Login
            </label>
            <select
              value={values.initialPage}
              onChange={(e) => onChange({ ...values, initialPage: e.target.value })}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {Object.entries(groupedInitialPages).map(([groupName, options]) => (
                <optgroup key={groupName} label={groupName}>
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Perfis Rápidos de Função (1 Clique)
              </span>
              <span className="text-[10px] text-slate-400">Preenche tela + módulos</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {USER_ROLE_PRESETS.map((preset) => {
                const isSelectedPreset =
                  preset.fullAccess
                    ? values.grantFullAccess
                    : !values.grantFullAccess &&
                      preset.modules.length === values.allowedModules.length &&
                      preset.modules.every((m) => values.allowedModules.includes(m));

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      isSelectedPreset
                        ? 'border-teal-500 bg-teal-50/70 dark:bg-teal-950/30 text-teal-900 dark:text-white ring-1 ring-teal-500/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold block truncate">{preset.label}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                        {preset.description}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        isSelectedPreset
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {preset.fullAccess ? 'Total' : `${preset.modules.length} mód.`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* COLUNA DIREITA (7 cols): DISTRIBUIÇÃO CLASSIFICADA DE MÓDULOS POR CATEGORIA */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              3. Liberação de Módulos e Menus
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Defina se este login terá acesso total à conta ou selecione os módulos por área.
            </p>
          </div>

          {/* Seletor Segmented: Acesso Total vs Seleção por Módulo */}
          <div className="inline-flex rounded-xl bg-slate-200/70 dark:bg-slate-800 p-1 shrink-0">
            <button
              type="button"
              onClick={() => onChange({ ...values, grantFullAccess: true, allowedModules: [] })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                values.grantFullAccess
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Acesso Total
            </button>
            <button
              type="button"
              onClick={() => {
                if (values.grantFullAccess) {
                  // Ao mudar para restrito, se estiver vazio, sugere os ativos da empresa
                  const activeIds = MODULE_PERMISSIONS_LIST.filter((m) =>
                    m.companyCheck ? m.companyCheck(company) : true
                  ).map((m) => m.id);
                  onChange({
                    ...values,
                    grantFullAccess: false,
                    allowedModules: values.allowedModules.length > 0 ? values.allowedModules : activeIds,
                  });
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !values.grantFullAccess
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Por Módulo ({values.grantFullAccess ? 'Todos' : values.allowedModules.length})
            </button>
          </div>
        </div>

        {/* Estado Acesso Total */}
        {values.grantFullAccess ? (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h5 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                  Acesso Total Habilitado (Sem Restrições de Menu)
                </h5>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-300/80 leading-relaxed">
                  Este usuário visualizará automaticamente todos os módulos que estiverem <strong>ativos/contratados</strong> na empresa. Caso você ative um novo módulo para o Seller no futuro, este login já terá acesso imediato.
                </p>
              </div>
            </div>
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const activeIds = MODULE_PERMISSIONS_LIST.filter((m) =>
                    m.companyCheck ? m.companyCheck(company) : true
                  ).map((m) => m.id);
                  onChange({
                    ...values,
                    grantFullAccess: false,
                    allowedModules: activeIds,
                  });
                }}
                className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-900 hover:bg-teal-50 border border-teal-200 dark:border-teal-800 px-3.5 py-2 rounded-xl transition-colors"
              >
                Personalizar / Restringir Módulos Individualmente →
              </button>
            </div>
          </div>
        ) : (
          /* Estado Seleção Personalizada por Categoria */
          <div className="space-y-3">
            {/* Barra de Busca e Filtros de Módulos */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar módulo (ex: PDV, Propostas, B2C, Logística)..."
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                {moduleSearch && (
                  <button
                    type="button"
                    onClick={() => setModuleSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setOnlyCompanyActiveModules(!onlyCompanyActiveModules)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 ${
                    onlyCompanyActiveModules
                      ? 'bg-teal-50 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-500/30'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  {onlyCompanyActiveModules ? 'Só Ativos na Empresa' : 'Todos os Módulos'}
                </button>

                <button
                  type="button"
                  onClick={handleSelectAllCompanyActive}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                >
                  Marcar Ativos
                </button>

                <button
                  type="button"
                  onClick={() => onChange({ ...values, grantFullAccess: false, allowedModules: [] })}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  Limpar
                </button>
              </div>
            </div>

            {/* Categorias Expansíveis */}
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {MODULE_PERMISSION_CATEGORIES.map((category) => {
                const categoryModules = MODULE_PERMISSIONS_LIST.filter((mod) => {
                  if (mod.category !== category.id) return false;
                  const isCompanyActive = mod.companyCheck ? mod.companyCheck(company) : true;
                  if (onlyCompanyActiveModules && !isCompanyActive) return false;
                  if (moduleSearch.trim()) {
                    const q = moduleSearch.toLowerCase();
                    return (
                      mod.label.toLowerCase().includes(q) ||
                      mod.description.toLowerCase().includes(q) ||
                      mod.id.toLowerCase().includes(q)
                    );
                  }
                  return true;
                });

                if (categoryModules.length === 0) return null;

                const categoryIds = categoryModules.map((m) => m.id);
                const selectedInCat = categoryIds.filter((id) => values.allowedModules.includes(id)).length;
                const allSelectedInCat = selectedInCat === categoryIds.length && categoryIds.length > 0;
                const isCollapsed = Boolean(collapsedCategories[category.id]) && !moduleSearch.trim();
                const CatIcon = category.icon;

                return (
                  <div
                    key={category.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                  >
                    {/* Header da Categoria */}
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => toggleCategoryCollapse(category.id)}
                        className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                      >
                        <div className={`p-1.5 rounded-lg border ${category.badgeColor} shrink-0`}>
                          <CatIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {category.title}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                selectedInCat > 0
                                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300'
                                  : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {selectedInCat}/{categoryIds.length}
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleCategoryAll(category.id, categoryIds)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline px-1.5 py-0.5"
                        >
                          {allSelectedInCat ? 'Desmarcar grupo' : 'Marcar grupo'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCategoryCollapse(category.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Grid de Módulos da Categoria */}
                    {!isCollapsed && (
                      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {categoryModules.map((mod) => {
                          const isChecked = values.allowedModules.includes(mod.id);
                          const isCompanyActive = mod.companyCheck ? mod.companyCheck(company) : true;
                          const ModIcon = mod.icon;

                          return (
                            <div
                              key={mod.id}
                              onClick={() => toggleModule(mod.id)}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                isChecked
                                  ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 text-slate-900 dark:text-white ring-1 ring-teal-500/20'
                                  : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-xs font-bold truncate flex items-center gap-1.5">
                                    <ModIcon className="w-3.5 h-3.5 opacity-70 shrink-0" />
                                    <span className="truncate">{mod.label}</span>
                                  </span>
                                  {company && (
                                    <span
                                      className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        isCompanyActive
                                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                      }`}
                                      title={
                                        isCompanyActive
                                          ? 'Módulo ativo nesta empresa'
                                          : 'Módulo inativo na empresa atualmente'
                                      }
                                    >
                                      {isCompanyActive ? 'Ativo' : 'Inativo'}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] opacity-75 block leading-snug mt-0.5 line-clamp-2">
                                  {mod.description}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
