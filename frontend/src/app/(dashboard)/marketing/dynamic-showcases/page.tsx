'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Sparkles, 
  Plus, 
  Search, 
  Layers, 
  Trash2, 
  Edit3, 
  Loader2, 
  Database,
  ArrowRight,
  PackageCheck,
  X,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  ImageIcon,
  UploadCloud,
  Monitor,
  Smartphone
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface DynamicShowcase {
  id: number;
  company_id: number;
  title: string;
  description?: string;
  search_source: 'CRONUZ' | 'HORUS_API';
  active: boolean;
  display_order: number;
  banner_url?: string | null;
  banner_mobile_url?: string | null;
  logo_url?: string | null;
  items_count: number;
  start_date?: string | null;
  end_date?: string | null;
  is_currently_active?: boolean;
  created_at: string;
}

export default function DynamicShowcasesListPage() {
  const [showcases, setShowcases] = useState<DynamicShowcase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingShowcase, setEditingShowcase] = useState<DynamicShowcase | null>(null);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [searchSource, setSearchSource] = useState<'CRONUZ' | 'HORUS_API'>('CRONUZ');
  const [active, setActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerMobileUrl, setBannerMobileUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Estados de upload de mídia
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBannerPc, setUploadingBannerPc] = useState(false);
  const [uploadingBannerMobile, setUploadingBannerMobile] = useState(false);

  const fetchShowcases = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setShowcases(data);
      } else {
        toast.error('Erro ao carregar vitrines dinâmicas.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Falha de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShowcases();
  }, []);

  const formatForInput = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  const handleOpenCreateModal = () => {
    setEditingShowcase(null);
    setTitle('');
    setDescription('');
    setSearchSource('CRONUZ');
    setActive(true);
    setDisplayOrder(showcases.length + 1);
    setStartDate('');
    setEndDate('');
    setBannerUrl('');
    setBannerMobileUrl('');
    setLogoUrl('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (showcase: DynamicShowcase) => {
    setEditingShowcase(showcase);
    setTitle(showcase.title);
    setDescription(showcase.description || '');
    setSearchSource(showcase.search_source);
    setActive(showcase.active);
    setDisplayOrder(showcase.display_order);
    setStartDate(formatForInput(showcase.start_date));
    setEndDate(formatForInput(showcase.end_date));
    setBannerUrl(showcase.banner_url || '');
    setBannerMobileUrl(showcase.banner_mobile_url || '');
    setLogoUrl(showcase.logo_url || '');
    setIsModalOpen(true);
  };

  const handleUploadMedia = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'logo' | 'banner_pc' | 'banner_mobile'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isLogo = type === 'logo';
    const maxMB = isLogo ? 2 : 5;
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`O arquivo ultrapassa o limite máximo permitido de ${maxMB} MB.`);
      e.target.value = '';
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Formato não suportado. Por favor utilize JPG, PNG ou WEBP.');
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      if (type === 'logo') setUploadingLogo(true);
      else if (type === 'banner_pc') setUploadingBannerPc(true);
      else setUploadingBannerMobile(true);

      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (type === 'logo') {
          setLogoUrl(data.url);
          toast.success('Logo enviada com sucesso!');
        } else if (type === 'banner_pc') {
          setBannerUrl(data.url);
          toast.success('Banner Desktop (PC) enviado com sucesso!');
        } else {
          setBannerMobileUrl(data.url);
          toast.success('Banner Mobile enviado com sucesso!');
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao enviar o arquivo.');
      }
    } catch {
      toast.error('Erro de conexão ao enviar a imagem.');
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else if (type === 'banner_pc') setUploadingBannerPc(false);
      else setUploadingBannerMobile(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Informe o título da vitrine.');
      return;
    }

    if (startDate && endDate) {
      if (new Date(startDate) > new Date(endDate)) {
        toast.error('A data inicial não pode ser posterior à data final.');
        return;
      }
    }

    setSaving(true);
    try {
      const token = getToken();
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        search_source: searchSource,
        active,
        display_order: Number(displayOrder) || 1,
        banner_url: bannerUrl.trim() || null,
        banner_mobile_url: bannerMobileUrl.trim() || null,
        logo_url: logoUrl.trim() || null,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        end_date: endDate ? new Date(endDate).toISOString() : null,
      };

      const url = editingShowcase
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/${editingShowcase.id}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/`;

      const method = editingShowcase ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editingShowcase ? 'Vitrine atualizada com sucesso!' : 'Vitrine criada com sucesso!');
        setIsModalOpen(false);
        fetchShowcases();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao salvar vitrine.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de comunicação com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir a vitrine "${name}"? Esta ação não poderá ser desfeita.`)) {
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        toast.success('Vitrine excluída com sucesso.');
        setShowcases(prev => prev.filter(s => s.id !== id));
      } else {
        toast.error('Erro ao excluir vitrine.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão ao excluir.');
    }
  };

  const filteredShowcases = showcases.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatPeriod = (start?: string | null, end?: string | null) => {
    if (!start && !end) {
      return 'Período ilimitado';
    }
    const fmt = (dStr: string) => {
      const d = new Date(dStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (start && end) {
      return `De ${fmt(start)} até ${fmt(end)}`;
    }
    if (start) {
      return `A partir de ${fmt(start)}`;
    }
    if (end) {
      return `Até ${fmt(end)}`;
    }
    return 'Período ilimitado';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Mobile First */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Vitrines Dinâmicas</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Crie coleções temáticas com prazo de vigência ou data ilimitada, pesquisando no catálogo Cronuz ou na API do Horus ERP.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium text-sm transition shadow-sm w-full sm:w-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nova Vitrine
        </button>
      </div>

      {/* Barra de Pesquisa */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Pesquisar vitrines por nome ou descrição..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
        />
      </div>

      {/* Grid de Vitrines */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm text-slate-500">Carregando vitrines dinâmicas...</p>
        </div>
      ) : filteredShowcases.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
            {searchTerm ? 'Nenhuma vitrine encontrada' : 'Nenhuma vitrine dinâmica criada'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-5">
            {searchTerm 
              ? 'Tente buscar com outros termos.' 
              : 'Comece criando sua primeira vitrine dinâmica para agrupar produtos especiais por tema ou origem.'}
          </p>
          {!searchTerm && (
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Criar Primeira Vitrine
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredShowcases.map((showcase) => {
            const isCurrentlyActive = showcase.is_currently_active ?? showcase.active;
            const hasDates = showcase.start_date || showcase.end_date;

            return (
              <div 
                key={showcase.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between group"
              >
                <div>
                  {/* Header do Card */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        showcase.search_source === 'HORUS_API'
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40'
                          : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40'
                      }`}>
                        <Database className="w-3 h-3" />
                        {showcase.search_source === 'HORUS_API' ? 'Horus ERP' : 'Cronuz'}
                      </span>

                      {/* Badge de Status / Validade */}
                      {isCurrentlyActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                          <CheckCircle className="w-3 h-3" />
                          Vigente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40">
                          <AlertTriangle className="w-3 h-3" />
                          Expirada / Inativa
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(showcase)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Editar dados"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(showcase.id, showcase.title)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
                        title="Excluir vitrine"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Título & Descrição */}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                    {showcase.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                    {showcase.description || 'Sem descrição cadastrada.'}
                  </p>

                  {/* Informação do Prazo / Data */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl">
                    <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate font-medium">
                      {formatPeriod(showcase.start_date, showcase.end_date)}
                    </span>
                  </div>

                  {/* Badges de Mídia (Logo, Banner PC, Banner Mobile) */}
                  {(showcase.logo_url || showcase.banner_url || showcase.banner_mobile_url) && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                      {showcase.logo_url && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40">
                          <ImageIcon className="w-2.5 h-2.5" />
                          Logo
                        </span>
                      )}
                      {showcase.banner_url && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/40">
                          <Monitor className="w-2.5 h-2.5" />
                          Banner PC
                        </span>
                      )}
                      {showcase.banner_mobile_url && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/40">
                          <Smartphone className="w-2.5 h-2.5" />
                          Banner Mobile
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer do Card */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <PackageCheck className="w-4 h-4 text-emerald-500" />
                    <span>{showcase.items_count} {showcase.items_count === 1 ? 'produto' : 'produtos'}</span>
                  </div>

                  <Link
                    href={`/marketing/dynamic-showcases/${showcase.id}/items`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold transition cursor-pointer"
                  >
                    <span>Gerenciar Itens</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                {editingShowcase ? 'Editar Vitrine Dinâmica' : 'Nova Vitrine Dinâmica'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Título da Vitrine <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Clássicos da Literatura, Destaques da Semana..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Descrição / Objetivo
                </label>
                <textarea
                  rows={2}
                  placeholder="Breve descrição explicativa da vitrine (opcional)..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Origem da Busca de Produtos <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label 
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                      searchSource === 'CRONUZ'
                        ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="searchSource"
                      value="CRONUZ"
                      checked={searchSource === 'CRONUZ'}
                      onChange={() => setSearchSource('CRONUZ')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                        <span>Catálogo Cronuz</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Pesquisa nos produtos já cadastrados no acervo local da loja.
                      </p>
                    </div>
                  </label>

                  <label 
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                      searchSource === 'HORUS_API'
                        ? 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-500 dark:border-amber-500 ring-2 ring-amber-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="searchSource"
                      value="HORUS_API"
                      checked={searchSource === 'HORUS_API'}
                      onChange={() => setSearchSource('HORUS_API')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                        <span>Horus ERP (API)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        Busca direto na API do Horus e auto-cadastra os livros no Cronuz ao adicionar.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Seção Identidade Visual (Logo & Banners PC / Mobile) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                  <ImageIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Identidade Visual & Banners
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Configure o logotipo e os banners responsivos para exibição na vitrine pública.
                    </p>
                  </div>
                </div>

                {/* 1. Logo da Vitrine (Topo Esquerdo) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span>Logo da Vitrine</span>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/40">
                        Topo do Lado Esquerdo
                      </span>
                    </label>
                    <span className="text-[10px] text-slate-400">Máx: 2 MB</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <div className="relative group w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-xs">
                        <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="absolute inset-0 bg-rose-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remover Logo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/50 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      </div>
                    )}

                    <div className="flex-1">
                      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer transition shadow-xs">
                        {uploadingLogo ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        ) : (
                          <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span>{logoUrl ? 'Substituir Logo' : 'Enviar Logo'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploadingLogo}
                          onChange={(e) => handleUploadMedia(e, 'logo')}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Aparece fixado no cabeçalho superior esquerdo da vitrine.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Banner Desktop (PC) */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Banner para PC / Desktop</span>
                    </label>
                    <span className="text-[10px] text-slate-400">Recomendado: 1920x400 (Máx 5MB)</span>
                  </div>

                  {bannerUrl && (
                    <div className="relative group w-full h-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                      <img src={bannerUrl} alt="Banner Desktop" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setBannerUrl('')}
                        className="absolute top-2 right-2 p-1.5 bg-rose-600/90 hover:bg-rose-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover Banner Desktop"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer transition shadow-xs">
                    {uploadingBannerPc ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    ) : (
                      <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{bannerUrl ? 'Substituir Banner PC' : 'Enviar Banner PC (Desktop)'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingBannerPc}
                      onChange={(e) => handleUploadMedia(e, 'banner_pc')}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 3. Banner Mobile (Celular) */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Banner para Celular (Mobile)</span>
                    </label>
                    <span className="text-[10px] text-slate-400">Recomendado: 800x600 (Máx 5MB)</span>
                  </div>

                  {bannerMobileUrl && (
                    <div className="relative group w-36 h-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                      <img src={bannerMobileUrl} alt="Banner Mobile" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setBannerMobileUrl('')}
                        className="absolute top-1 right-1 p-1 bg-rose-600/90 hover:bg-rose-700 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover Banner Mobile"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer transition shadow-xs">
                    {uploadingBannerMobile ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    ) : (
                      <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{bannerMobileUrl ? 'Substituir Banner Mobile' : 'Enviar Banner Mobile'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingBannerMobile}
                      onChange={(e) => handleUploadMedia(e, 'banner_mobile')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Seção de Prazos (Início e Fim) */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Prazo de Exibição da Vitrine
                  </span>
                  <span className="text-[11px] text-slate-400">(Deixe em branco para tempo ilimitado)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Data / Hora Início
                    </label>
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Data / Hora Fim (Finalização)
                    </label>
                    <input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Ordem de Exibição
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Vitrine Ativa
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium transition shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingShowcase ? 'Salvar Alterações' : 'Criar Vitrine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
