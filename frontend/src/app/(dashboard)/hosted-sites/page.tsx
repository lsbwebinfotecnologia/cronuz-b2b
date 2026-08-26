'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Globe, 
  Plus, 
  UploadCloud, 
  ExternalLink, 
  Eye, 
  FolderArchive, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  FileCode, 
  FileText, 
  Folder, 
  RefreshCw, 
  X, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Copy, 
  Check, 
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getToken } from '@/lib/auth';

type FileNode = {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  children?: FileNode[];
};

type HostedSite = {
  id: number;
  title: string;
  slug: string;
  description?: string;
  custom_domain?: string;
  status: 'pending_upload' | 'pending_extract' | 'extracting' | 'ready' | 'missing_index' | 'error';
  zip_filename?: string;
  zip_size_bytes?: number;
  has_index: boolean;
  files_count: number;
  storage_path?: string;
  public_url: string;
  preview_url: string;
  last_deployed_at?: string;
  created_at?: string;
  files?: FileNode[];
};

export default function HostedSitesPage() {
  const [sites, setSites] = useState<HostedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<HostedSite | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    custom_domain: ''
  });

  // Action States
  const [uploadingSiteId, setUploadingSiteId] = useState<number | null>(null);
  const [extractingSiteId, setExtractingSiteId] = useState<number | null>(null);
  const [deletingSiteId, setDeletingSiteId] = useState<number | null>(null);
  const [previewSite, setPreviewSite] = useState<HostedSite | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [filesModalSite, setFilesModalSite] = useState<HostedSite | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchSites = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/hosted-sites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSites(data);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Falha ao carregar a lista de sites.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const handleTitleChange = (val: string) => {
    const autoSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    if (!editingSite) {
      setFormData(prev => ({ ...prev, title: val, slug: autoSlug }));
    } else {
      setFormData(prev => ({ ...prev, title: val }));
    }
  };

  const handleSaveSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const token = getToken();
      const method = editingSite ? 'PUT' : 'POST';
      const endpoint = editingSite ? `${API_URL}/hosted-sites/${editingSite.id}` : `${API_URL}/hosted-sites`;

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Erro ao salvar site.');
      }

      setSuccessMsg(editingSite ? 'Site atualizado com sucesso!' : 'Site criado com sucesso! Agora você pode subir o arquivo ZIP.');
      setIsCreateModalOpen(false);
      setEditingSite(null);
      setFormData({ title: '', slug: '', description: '', custom_domain: '' });
      fetchSites();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleFileUpload = async (siteId: number, file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorMsg('Apenas arquivos no formato .zip são permitidos.');
      return;
    }

    setUploadingSiteId(siteId);
    setErrorMsg(null);

    const bodyFormData = new FormData();
    bodyFormData.append('file', file);

    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/hosted-sites/${siteId}/upload-zip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: bodyFormData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Erro ao enviar o ZIP.');
      }

      setSuccessMsg('Arquivo ZIP enviado! Clique em "Extrair e Publicar" para ativar o site.');
      fetchSites();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setUploadingSiteId(null);
    }
  };

  const handleExtractSite = async (siteId: number) => {
    setExtractingSiteId(siteId);
    setErrorMsg(null);

    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/hosted-sites/${siteId}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Falha na extração do site.');
      }

      const updatedSite = await res.json();
      setSuccessMsg(`Site extraído e publicado com sucesso! ${updatedSite.files_count} arquivos encontrados.`);
      fetchSites();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setExtractingSiteId(null);
    }
  };

  const handleDeleteSite = async (siteId: number) => {
    if (!confirm('Tem certeza que deseja excluir este site? Todos os arquivos hospedados serão apagados permanentemente.')) {
      return;
    }

    setDeletingSiteId(siteId);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/hosted-sites/${siteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Falha ao excluir site.');
      }

      setSuccessMsg('Site e arquivos removidos com sucesso.');
      fetchSites();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setDeletingSiteId(null);
    }
  };

  const openFilesModal = async (site: HostedSite) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/hosted-sites/${site.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFilesModalSite(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string, slug: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderFileTree = (nodes: FileNode[]) => {
    return (
      <ul className="space-y-1 pl-2 text-sm font-mono">
        {nodes.map((node, idx) => (
          <li key={idx} className="py-1">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              {node.is_dir ? (
                <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
              ) : node.name.endsWith('.html') || node.name.endsWith('.htm') ? (
                <FileCode className="w-4 h-4 text-rose-500" />
              ) : (
                <FileText className="w-4 h-4 text-indigo-400" />
              )}
              <span className={node.name === 'index.html' ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}>
                {node.name}
              </span>
              {!node.is_dir && node.size && (
                <span className="text-xs text-slate-400 font-sans">({formatBytes(node.size)})</span>
              )}
            </div>
            {node.children && node.children.length > 0 && (
              <div className="pl-4 border-l border-slate-200 dark:border-slate-800 ml-2 mt-1">
                {renderFileTree(node.children)}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const totalSites = sites.length;
  const onlineSites = sites.filter(s => s.status === 'ready').length;
  const pendingSites = sites.filter(s => s.status !== 'ready').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Hospedagem de Sites Institucionais
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Gerencie, faça upload e hospede sites estáticos para clientes com subdomínios dedicados.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingSite(null);
            setFormData({ title: '', slug: '', description: '', custom_domain: '' });
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm transition-all hover:shadow-indigo-500/20 active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          <span>Criar Novo Site</span>
        </button>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-500" />
            <p className="text-sm font-medium">{successMsg}</p>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Sites</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalSites}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sites Publicados</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{onlineSites}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <FolderArchive className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Aguardando Publicação</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingSites}</p>
          </div>
        </div>
      </div>

      {/* Sites Grid / List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <p>Carregando sites institucionais...</p>
        </div>
      ) : sites.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center mx-auto">
            <Globe className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nenhum site cadastrado ainda</h3>
            <p className="text-sm text-slate-500">
              Crie o primeiro site institucional para gerar o diretório e fazer upload dos arquivos HTML/CSS do cliente.
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Primeiro Site</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sites.map(site => {
            const isUploading = uploadingSiteId === site.id;
            const isExtracting = extractingSiteId === site.id;
            const isDeleting = deletingSiteId === site.id;

            return (
              <div
                key={site.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between transition-all hover:border-indigo-300 dark:hover:border-indigo-800"
              >
                <div className="space-y-4">
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{site.title}</h2>
                        {site.status === 'ready' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Online
                          </span>
                        )}
                        {site.status === 'pending_upload' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            Aguardando ZIP
                          </span>
                        )}
                        {site.status === 'pending_extract' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Pronto p/ Extrair
                          </span>
                        )}
                        {site.status === 'missing_index' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            Sem index.html
                          </span>
                        )}
                        {site.status === 'error' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                            Erro na Extração
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {site.description || 'Sem descrição informada.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingSite(site);
                          setFormData({
                            title: site.title,
                            slug: site.slug,
                            description: site.description || '',
                            custom_domain: site.custom_domain || ''
                          });
                          setIsCreateModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Editar Informações"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSite(site.id)}
                        disabled={isDeleting}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50"
                        title="Excluir Site"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Domain Link Box */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Globe className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                        {site.public_url}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyToClipboard(site.public_url, site.slug)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                        title="Copiar link"
                      >
                        {copiedSlug === site.slug ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={site.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                        title="Abrir em nova aba"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Details stats */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 dark:border-slate-800/60 text-center text-xs">
                    <div>
                      <span className="text-slate-400 block">Arquivos</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {site.files_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Tamanho ZIP</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {formatBytes(site.zip_size_bytes)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Index HTML</span>
                      <span className={`font-bold ${site.has_index ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {site.has_index ? 'Presente' : 'Ausente'}
                      </span>
                    </div>
                  </div>

                  {/* Upload / Extraction Section */}
                  <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <FolderArchive className="w-4 h-4 text-indigo-500" />
                        Pacote do Site (.ZIP)
                      </span>
                      {site.zip_filename && (
                        <span className="text-[11px] text-slate-500 truncate max-w-[150px] font-mono">
                          {site.zip_filename}
                        </span>
                      )}
                    </div>

                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      ref={el => { fileInputRefs.current[site.id] = el; }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(site.id, file);
                      }}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => fileInputRefs.current[site.id]?.click()}
                        disabled={isUploading || isExtracting}
                        className="flex items-center justify-center gap-2 py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                            <span>Enviando...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{site.zip_filename ? 'Trocar ZIP' : 'Subir ZIP'}</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleExtractSite(site.id)}
                        disabled={!site.zip_filename || isExtracting || isUploading}
                        className="flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-medium transition-colors shadow-sm"
                      >
                        {isExtracting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Extraindo...</span>
                          </>
                        ) : (
                          <>
                            <Layers className="w-3.5 h-3.5" />
                            <span>Extrair e Publicar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => openFilesModal(site)}
                    disabled={site.files_count === 0}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Ver Arquivos</span>
                  </button>

                  <button
                    onClick={() => {
                      setPreviewSite(site);
                      setPreviewDevice('desktop');
                    }}
                    disabled={!site.has_index}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-all shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Interno</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar / Editar Site */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-lg">
                    <Globe className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {editingSite ? 'Editar Site' : 'Novo Site Institucional'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSite} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nome do Site / Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Padaria Bela Vista"
                    value={formData.title}
                    onChange={e => handleTitleChange(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Identificador / Slug do Subdomínio *
                  </label>
                  <div className="flex items-center rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3.5 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
                    <span className="text-xs text-slate-400 font-mono select-none">https://</span>
                    <input
                      type="text"
                      required
                      placeholder="meu-cliente"
                      value={formData.slug}
                      disabled={!!editingSite}
                      onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                      className="w-full bg-transparent text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none px-1 disabled:opacity-60"
                    />
                    <span className="text-xs text-indigo-500 font-mono select-none whitespace-nowrap">
                      .site.cronuzb2b.com.br
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Este será o subdomínio público onde o site ficará visível.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Descrição / Observações (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Site institucional da campanha de lançamento..."
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm"
                  >
                    {editingSite ? 'Salvar Alterações' : 'Criar Pasta e Site'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Preview Interno Responsivo */}
      <AnimatePresence>
        {previewSite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full h-[95vh] max-w-6xl flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Browser Header Simulator */}
              <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="ml-3 text-xs font-medium text-slate-300 hidden sm:inline">
                    Preview: {previewSite.title}
                  </span>
                </div>

                {/* Device Selector */}
                <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                      previewDevice === 'desktop' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Desktop (100%)"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Desktop</span>
                  </button>
                  <button
                    onClick={() => setPreviewDevice('tablet')}
                    className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                      previewDevice === 'tablet' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Tablet (768px)"
                  >
                    <Tablet className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Tablet</span>
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                      previewDevice === 'mobile' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Mobile (375px)"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Mobile</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${API_URL}/hosted-sites/preview/${previewSite.slug}/index.html`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 text-xs flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline">Abrir Direto</span>
                  </a>
                  <button
                    onClick={() => setPreviewSite(null)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Iframe Preview Container */}
              <div className="flex-1 bg-slate-950/80 p-4 flex items-center justify-center overflow-auto">
                <div
                  className="h-full transition-all duration-300 bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col"
                  style={{
                    width: previewDevice === 'mobile' ? '375px' : previewDevice === 'tablet' ? '768px' : '100%',
                    maxWidth: '100%'
                  }}
                >
                  <iframe
                    src={`${API_URL}/hosted-sites/preview/${previewSite.slug}/index.html`}
                    className="w-full h-full border-0"
                    title={`Preview ${previewSite.title}`}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Visualizador de Arquivos */}
      <AnimatePresence>
        {filesModalSite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-lg">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Arquivos do Site ({filesModalSite.files_count})
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">sites/{filesModalSite.slug}/</p>
                  </div>
                </div>
                <button
                  onClick={() => setFilesModalSite(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {filesModalSite.files && filesModalSite.files.length > 0 ? (
                  renderFileTree(filesModalSite.files)
                ) : (
                  <p className="text-sm text-slate-400 text-center py-6">Nenhum arquivo extraído nesta pasta.</p>
                )}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setFilesModalSite(null)}
                  className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-700 rounded-xl text-xs font-medium"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
