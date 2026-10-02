'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Ticket, Plus, Search, Calendar, Users, Building2, Gift, 
  MapPin, ChevronRight, X, Loader2, Sparkles, Filter, CheckCircle2, 
  ShoppingBag, Trash2, Copy, Check, ExternalLink, Share2, ArrowUpDown,
  Clock, AlertTriangle, Link as LinkIcon, Edit3, Target, CalendarDays, 
  Code, Image as ImageIcon, UploadCloud, Eye, FileText
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

interface SchoolEventItem {
  id: number;
  school_customer_id?: number;
  school_name?: string;
  title: string;
  slug: string;
  event_type: string;
  description?: string;
  location_destination?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  price: number;
  participants_count: number;
  gifts_purchased_count: number;
  showcase_id?: number;
  draw_performed_at?: string;
  created_at?: string;
  banner_url?: string;
  logo_url?: string;
  content_html?: string;
  is_template?: boolean;
  parent_event_id?: number;
  rules_config?: Record<string, any>;
}

const FUNNY_CHARACTERS_POOL = [
  'Capitão Pipoca', 'Detetive Picolé', 'Panda Espacial', 'Mago do Chocolate',
  'Princesa das Nuvens', 'Ninja do Recreio', 'Astronauta de Giz', 'Dr. Foguetinho',
  'Urso de Patins', 'Gatinho Ninja', 'Pirata do Brigadeiro', 'Super Croissant',
  'Mestre dos Lápis', 'Robô Sorridente', 'Dinossauro Dançarino', 'Raposa Veloz',
  'Coelho Saltitante', 'Leão da Fantasia', 'Polvo de Óculos', 'Pinguim de Cachecol',
  'Cavaleiro da Mochila', 'Estrela Brilhante', 'Fada do Biscoito', 'Tigre Astronauta',
  'Chef da Gelatina', 'Super Algodão Doce', 'Guerreiro das Letras', 'Pikachu de Papelão',
  'Camaleão Colorido', 'Coruja Sabichona', 'Koala Dorminhoco', 'Golfinho Voador',
  'Lobo Camarada', 'Dragãozinho Sapeca', 'Zebra Radiante', 'Esquilo Mágico'
];

function SchoolEventsContent() {
  const searchParams = useSearchParams();
  const initialSchoolParam = searchParams.get('school_id') || 'ALL';

  const [events, setEvents] = useState<SchoolEventItem[]>([]);
  const [schools, setSchools] = useState<{ id: number; name: string }[]>([]);
  const [showcases, setShowcases] = useState<{ id: number; title: string; items_count?: number; is_currently_active?: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros e Busca
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, ACTIVE, UPCOMING, EXPIRED
  const [selectedSchool, setSelectedSchool] = useState<string>(initialSchoolParam);
  const [sortBy, setSortBy] = useState('UPCOMING'); // UPCOMING, SCHOOL_NAME_ASC, SCHOOL_NAME_DESC, START_DATE_ASC, START_DATE_DESC, CREATED_AT_DESC, CREATED_AT_ASC
  const [filterTemplate, setFilterTemplate] = useState('ALL'); // ALL, TEMPLATES, SCHEDULED

  // Modais e Estados de Ação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Estados de Upload de Imagens e Editor HTML
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [htmlEditorTab, setHtmlEditorTab] = useState<'visual' | 'code'>('visual');
  const [newCharacterInput, setNewCharacterInput] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    event_type: 'AMIGO_SECRETO',
    school_customer_id: initialSchoolParam !== 'ALL' ? initialSchoolParam : '',
    showcase_id: '',
    location_destination: '',
    description: '',
    start_date: '',
    end_date: '',
    price: 0,
    banner_url: '',
    logo_url: '',
    content_html: '',
    is_template: false,
    parent_event_id: '',
    use_character_names: false,
    characters: [] as string[]
  });

  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const params = new URLSearchParams();
      if (filterType !== 'ALL') params.append('event_type', filterType);
      if (selectedSchool !== 'ALL') params.append('school_id', selectedSchool);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events${queryString}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      toast.error('Erro ao buscar eventos.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxData = async () => {
    try {
      const token = getToken();
      // Buscar escolas parceiras
      const resSchools = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resSchools.ok) {
        const dataSchools = await resSchools.json();
        setSchools(dataSchools.map((s: any) => ({ id: s.id, name: s.name })));
      }

      // Buscar vitrines dinâmicas de livros
      const resShowcases = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/marketing/dynamic-showcases/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resShowcases.ok) {
        const dataShowcases = await resShowcases.json();
        setShowcases(
          dataShowcases.map((sc: any) => ({
            id: sc.id,
            title: sc.title,
            items_count: sc.items_count || 0,
            is_currently_active: sc.is_currently_active ?? sc.active
          }))
        );
      }
    } catch {
      // Ignora falha de dados auxiliares
    }
  };

  useEffect(() => {
    fetchEvents();
    fetchAuxData();
  }, [filterType, selectedSchool]);

  // Função para calcular o status temporal (se expirou, se está agendado ou ativo)
  const getEventTemporalStatus = (evt: SchoolEventItem) => {
    if (evt.status === 'CANCELLED') {
      return {
        status: 'CANCELLED',
        label: 'Cancelado',
        colorClass: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50',
        detail: 'Evento cancelado',
        isExpired: true
      };
    }

    const now = new Date();
    const start = evt.start_date ? new Date(evt.start_date) : null;
    const end = evt.end_date ? new Date(evt.end_date) : null;

    // Se tiver data de encerramento e a data já passou (adicionando tolerância até o final do dia)
    if (end) {
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      if (endOfDay < now) {
        return {
          status: 'EXPIRED',
          label: 'Expirado',
          colorClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50',
          detail: `Encerrou em ${end.toLocaleDateString('pt-BR')}`,
          isExpired: true
        };
      }
    }

    // Se tiver data de início e a data for futura
    if (start && start > now) {
      const diffDays = Math.ceil((start.getTime() - now.getTime()) / (1000 * 3600 * 24));
      return {
        status: 'UPCOMING',
        label: 'Agendado',
        colorClass: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400 border border-sky-200 dark:border-sky-900/50',
        detail: diffDays === 1 ? 'Inicia amanhã' : `Inicia em ${diffDays} dias`,
        isExpired: false
      };
    }

    // Caso contrário está ativo / em andamento
    return {
      status: 'ACTIVE',
      label: 'Em Andamento',
      colorClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50',
      detail: end ? `Até ${end.toLocaleDateString('pt-BR')}` : 'Aberto',
      isExpired: false
    };
  };

  // Modelos Base (Templates)
  const templateEvents = useMemo(() => {
    return events.filter((e) => e.is_template);
  }, [events]);

  // Filtragem e Ordenação no Client
  const processedEvents = useMemo(() => {
    let list = [...events];

    // Filtro por Modelo vs Evento Agendado
    if (filterTemplate === 'TEMPLATES') {
      list = list.filter((evt) => evt.is_template);
    } else if (filterTemplate === 'SCHEDULED') {
      list = list.filter((evt) => !evt.is_template);
    }

    // Busca textual
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((evt) => {
        const titleMatch = evt.title.toLowerCase().includes(q);
        const schoolMatch = evt.school_name ? evt.school_name.toLowerCase().includes(q) : false;
        const locMatch = evt.location_destination ? evt.location_destination.toLowerCase().includes(q) : false;
        return titleMatch || schoolMatch || locMatch;
      });
    }

    // Filtro por status temporal
    if (filterStatus !== 'ALL') {
      list = list.filter((evt) => {
        const temp = getEventTemporalStatus(evt);
        return temp.status === filterStatus;
      });
    }

    // Ordenação
    list.sort((a, b) => {
      if (sortBy === 'SCHOOL_NAME_ASC') {
        const nameA = a.school_name || 'ZZZ';
        const nameB = b.school_name || 'ZZZ';
        return nameA.localeCompare(nameB);
      }
      if (sortBy === 'SCHOOL_NAME_DESC') {
        const nameA = a.school_name || '';
        const nameB = b.school_name || '';
        return nameB.localeCompare(nameA);
      }
      if (sortBy === 'START_DATE_ASC') {
        const tA = a.start_date ? new Date(a.start_date).getTime() : Infinity;
        const tB = b.start_date ? new Date(b.start_date).getTime() : Infinity;
        return tA - tB;
      }
      if (sortBy === 'START_DATE_DESC') {
        const tA = a.start_date ? new Date(a.start_date).getTime() : 0;
        const tB = b.start_date ? new Date(b.start_date).getTime() : 0;
        return tB - tA;
      }
      if (sortBy === 'CREATED_AT_ASC') {
        return a.id - b.id;
      }
      if (sortBy === 'CREATED_AT_DESC') {
        return b.id - a.id;
      }

      // UPCOMING (Padrão: Mais próximos primeiro; expirados no final)
      const stA = getEventTemporalStatus(a);
      const stB = getEventTemporalStatus(b);

      if (stA.isExpired !== stB.isExpired) {
        return stA.isExpired ? 1 : -1;
      }

      const timeA = a.start_date ? new Date(a.start_date).getTime() : Infinity;
      const timeB = b.start_date ? new Date(b.start_date).getTime() : Infinity;
      return timeA - timeB;
    });

    return list;
  }, [events, searchQuery, filterStatus, sortBy, filterTemplate]);

  // Manipulação de Links Públicos
  const getEventPublicUrl = (slug: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/public/eventos/${slug}`;
    }
    return `/public/eventos/${slug}`;
  };

  const handleCopyLink = (evt: SchoolEventItem) => {
    const url = getEventPublicUrl(evt.slug);
    navigator.clipboard.writeText(url);
    setCopiedId(evt.id);
    const schoolMsg = evt.school_name ? ` da escola ${evt.school_name}` : '';
    toast.success(`Link exclusivo${schoolMsg} copiado com sucesso!`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleShareWhatsApp = (evt: SchoolEventItem) => {
    const url = getEventPublicUrl(evt.slug);
    const schoolIntro = evt.school_name ? ` na *${evt.school_name}*` : '';
    const text = `Olá! Convidamos você a participar do evento *${evt.title}*${schoolIntro}! Acesse o link oficial para ver os detalhes e inscrever os alunos: ${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleDeleteEvent = async (eventId: number, eventTitle: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o evento "${eventTitle}"?\n\nEsta ação só é permitida se o evento não possuir pedidos ou compras de livros/presentes finalizadas.`)) {
      return;
    }

    try {
      setDeletingId(eventId);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${eventId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        toast.success(`Evento "${eventTitle}" excluído com sucesso!`);
        fetchEvents();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Não foi possível excluir o evento.');
      }
    } catch {
      toast.error('Erro de conexão ao tentar excluir o evento.');
    } finally {
      setDeletingId(null);
    }
  };

  const toInputDate = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const openNewModal = () => {
    setEditingEventId(null);
    setNewCharacterInput('');
    setFormData({
      title: '',
      event_type: 'AMIGO_SECRETO',
      school_customer_id: selectedSchool !== 'ALL' ? selectedSchool : '',
      showcase_id: '',
      location_destination: '',
      description: '',
      start_date: '',
      end_date: '',
      price: 0,
      banner_url: '',
      logo_url: '',
      content_html: '',
      is_template: false,
      parent_event_id: '',
      use_character_names: false,
      characters: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = (evt: SchoolEventItem) => {
    setEditingEventId(evt.id);
    setNewCharacterInput('');
    const rules = evt.rules_config || {};
    setFormData({
      title: evt.title || '',
      event_type: evt.event_type || 'AMIGO_SECRETO',
      school_customer_id: evt.school_customer_id ? String(evt.school_customer_id) : '',
      showcase_id: evt.showcase_id ? String(evt.showcase_id) : '',
      location_destination: evt.location_destination || '',
      description: evt.description || '',
      start_date: toInputDate(evt.start_date),
      end_date: toInputDate(evt.end_date),
      price: evt.price || 0,
      banner_url: evt.banner_url || '',
      logo_url: evt.logo_url || '',
      content_html: evt.content_html || '',
      is_template: !!evt.is_template,
      parent_event_id: evt.parent_event_id ? String(evt.parent_event_id) : '',
      use_character_names: !!rules.use_character_names,
      characters: Array.isArray(rules.characters) ? rules.characters : []
    });
    setIsModalOpen(true);
  };

  const openScheduleModal = (templateEvt: SchoolEventItem) => {
    setEditingEventId(null);
    setNewCharacterInput('');
    const rules = templateEvt.rules_config || {};
    setFormData({
      title: templateEvt.title || '',
      event_type: templateEvt.event_type || 'AMIGO_SECRETO',
      school_customer_id: selectedSchool !== 'ALL' ? selectedSchool : '',
      showcase_id: templateEvt.showcase_id ? String(templateEvt.showcase_id) : '',
      location_destination: templateEvt.location_destination || '',
      description: templateEvt.description || '',
      start_date: '',
      end_date: '',
      price: templateEvt.price || 0,
      banner_url: templateEvt.banner_url || '',
      logo_url: templateEvt.logo_url || '',
      content_html: templateEvt.content_html || '',
      is_template: false,
      parent_event_id: String(templateEvt.id),
      use_character_names: !!rules.use_character_names,
      characters: Array.isArray(rules.characters) ? rules.characters : []
    });
    setIsModalOpen(true);
  };

  const handleGenerateRandomCharacters = () => {
    const existing = new Set(formData.characters.map((c) => c.toLowerCase()));
    const available = FUNNY_CHARACTERS_POOL.filter((c) => !existing.has(c.toLowerCase()));
    
    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 16);
    
    if (selected.length === 0) {
      toast.info('Todos os personagens da lista padrão já foram adicionados.');
      return;
    }
    
    setFormData((prev) => ({
      ...prev,
      characters: [...prev.characters, ...selected]
    }));
    toast.success(`${selected.length} personagens engraçados adicionados com sucesso!`);
  };

  const handleAddCharacter = () => {
    const trimmed = newCharacterInput.trim();
    if (!trimmed) return;
    if (formData.characters.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.warning('Este personagem já está na lista.');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      characters: [...prev.characters, trimmed]
    }));
    setNewCharacterInput('');
  };

  const handleRemoveCharacter = (indexToRemove: number) => {
    setFormData((prev) => ({
      ...prev,
      characters: prev.characters.filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const handleSelectTemplate = (templateIdStr: string) => {
    setFormData((prev) => {
      if (!templateIdStr) {
        return { ...prev, parent_event_id: '' };
      }
      const t = templateEvents.find((e) => String(e.id) === templateIdStr);
      if (!t) return { ...prev, parent_event_id: templateIdStr };
      return {
        ...prev,
        parent_event_id: templateIdStr,
        title: prev.title || t.title,
        event_type: t.event_type,
        showcase_id: t.showcase_id ? String(t.showcase_id) : prev.showcase_id,
        location_destination: t.location_destination || prev.location_destination,
        description: prev.description || t.description || '',
        price: t.price || prev.price,
        banner_url: t.banner_url || prev.banner_url,
        logo_url: t.logo_url || prev.logo_url,
        use_character_names: !!t.rules_config?.use_character_names,
        characters: Array.isArray(t.rules_config?.characters) ? t.rules_config.characters : prev.characters,
        content_html: t.content_html || prev.content_html
      };
    });
  };

  const handleUploadAsset = async (e: React.ChangeEvent<HTMLInputElement>, assetType: 'logo' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isLogo = assetType === 'logo';
    const maxSizeBytes = isLogo ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    const maxMB = isLogo ? 2 : 5;
    const maxWidth = isLogo ? 1200 : 2560;
    const maxHeight = isLogo ? 1200 : 1440;

    // 1. Validação de tamanho
    if (file.size > maxSizeBytes) {
      toast.error(`O arquivo excede o limite máximo permitido de ${maxMB} MB para ${isLogo ? 'Logo' : 'Banner'}.`);
      e.target.value = '';
      return;
    }

    // 2. Validação de extensão
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formato não suportado. Por favor envie imagens JPG, PNG ou WEBP.');
      e.target.value = '';
      return;
    }

    // 3. Validação de Dimensões Máximas (leitura em memória no navegador)
    const validateDimensions = (): Promise<{ width: number; height: number }> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error('Falha ao processar dimensões.'));
        img.src = URL.createObjectURL(file);
      });
    };

    try {
      const { width, height } = await validateDimensions();
      if (width > maxWidth || height > maxHeight) {
        toast.error(
          `A imagem possui ${width}x${height}px, ultrapassando as dimensões máximas permitidas de ${maxWidth}x${maxHeight}px para ${isLogo ? 'Logo' : 'Banner'}.`
        );
        e.target.value = '';
        return;
      }
    } catch {
      toast.error('Não foi possível ler as dimensões da imagem.');
      e.target.value = '';
      return;
    }

    const payload = new FormData();
    payload.append('file', file);
    payload.append('asset_type', assetType);

    try {
      if (assetType === 'logo') setUploadingLogo(true);
      else setUploadingBanner(true);

      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: payload
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (assetType === 'logo') {
          setFormData((prev) => ({ ...prev, logo_url: data.url }));
          toast.success('Logo enviada e salva na pasta da empresa com sucesso!');
        } else {
          setFormData((prev) => ({ ...prev, banner_url: data.url }));
          toast.success('Banner enviado e salvo na pasta da empresa com sucesso!');
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao enviar a imagem.');
      }
    } catch {
      toast.error('Erro de conexão ao enviar o arquivo.');
    } finally {
      if (assetType === 'logo') setUploadingLogo(false);
      else setUploadingBanner(false);
      e.target.value = '';
    }
  };

  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Preencha o título do evento.');
      return;
    }

    try {
      setSaving(true);
      const token = getToken();
      const payload: Record<string, any> = {
        title: formData.title.trim(),
        slug: formData.title.trim(),
        event_type: formData.event_type,
        school_customer_id: formData.is_template
          ? null
          : formData.school_customer_id
          ? parseInt(formData.school_customer_id)
          : null,
        showcase_id: formData.showcase_id ? parseInt(formData.showcase_id) : null,
        location_destination: formData.location_destination || null,
        description: formData.description || null,
        start_date: formData.start_date ? new Date(formData.start_date + 'T00:00:00').toISOString() : null,
        end_date: formData.end_date ? new Date(formData.end_date + 'T23:59:59').toISOString() : null,
        price: Number(formData.price) || 0,
        banner_url: formData.banner_url.trim() || null,
        logo_url: formData.logo_url.trim() || null,
        content_html: formData.content_html.trim() || null,
        is_template: formData.is_template,
        parent_event_id: !formData.is_template && formData.parent_event_id ? parseInt(formData.parent_event_id) : null,
        rules_config: {
          allow_wishlist: true,
          school_delivery: true,
          use_character_names: formData.use_character_names,
          characters: formData.characters
        }
      };

      if (editingEventId) {
        // Modo Edição
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${editingEventId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          }
        );

        if (res.ok) {
          toast.success('Evento atualizado com sucesso!');
          setIsModalOpen(false);
          setEditingEventId(null);
          fetchEvents();
        } else {
          const err = await res.json();
          toast.error(err.detail || 'Erro ao atualizar evento.');
        }
      } else {
        // Modo Criação
        payload.status = 'OPEN';
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          }
        );

        if (res.ok) {
          toast.success(
            formData.is_template
              ? 'Modelo Base cadastrado com sucesso! Agora você pode agendá-lo para qualquer escola.'
              : 'Evento criado com sucesso! Link exclusivo gerado para a escola.'
          );
          setIsModalOpen(false);
          fetchEvents();
        } else {
          const err = await res.json();
          toast.error(err.detail || 'Erro ao criar evento.');
        }
      }
    } catch {
      toast.error('Erro de conexão com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  const getEventTypeBadge = (type: string) => {
    switch (type) {
      case 'AMIGO_SECRETO':
        return { label: 'Amigo Secreto', bg: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60' };
      case 'PASSEIO':
        return { label: 'Passeio Escolar', bg: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/60' };
      case 'FEIRA_LIVRO':
        return { label: 'Feira do Livro', bg: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60' };
      default:
        return { label: 'Evento Geral', bg: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700' };
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
            <Ticket className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Passeios, Eventos &amp; Amigo Secreto
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              Crie modelos base ou agende eventos com link exclusivo amarrado à instituição parceira.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openNewModal}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs md:text-sm font-semibold shadow-sm shadow-indigo-500/20 transition-all inline-flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Novo Evento / Modelo
          </button>
        </div>
      </div>

      {/* Painel de Pesquisa, Filtros e Ordenação */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        {/* Linha 1: Input de Busca + Select de Escola + Select de Ordenação */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Busca Textual */}
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por evento, escola, destino..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtrar por Escola */}
          <div className="md:col-span-4 relative">
            <select
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="ALL">Todas as Escolas Parceiras</option>
              {schools.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  🏫 {sc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Ordenação */}
          <div className="md:col-span-3 relative">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="UPCOMING">🕒 Mais Próximos (Padrão)</option>
                <option value="SCHOOL_NAME_ASC">🏫 Escola (A → Z)</option>
                <option value="SCHOOL_NAME_DESC">🏫 Escola (Z → A)</option>
                <option value="START_DATE_ASC">📅 Data Início (Mais Próxima)</option>
                <option value="START_DATE_DESC">📅 Data Início (Mais Distante)</option>
                <option value="CREATED_AT_DESC">🆕 Criação (Mais Recentes)</option>
                <option value="CREATED_AT_ASC">⏳ Criação (Mais Antigos)</option>
              </select>
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-500 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Linha 2: Filtro Modelos/Agendados + Chips de Tipo + Chips de Status */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* Categoria: Modelos vs Agendados */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 shrink-0">Origem:</span>
            {[
              { key: 'ALL', label: 'Todos' },
              { key: 'SCHEDULED', label: '🏫 Escolas' },
              { key: 'TEMPLATES', label: `🎯 Modelos (${templateEvents.length})` }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTemplate(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  filterTemplate === tab.key
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tipo de Evento */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 shrink-0">Tipo:</span>
            {[
              { key: 'ALL', label: 'Todos' },
              { key: 'AMIGO_SECRETO', label: '🎁 Amigo Secreto' },
              { key: 'PASSEIO', label: '🚌 Passeios' },
              { key: 'FEIRA_LIVRO', label: '📚 Feiras' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterType(tab.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  filterType === tab.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Temporal */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 shrink-0">Status:</span>
            {[
              { key: 'ALL', label: 'Todos' },
              { key: 'ACTIVE', label: '🟢 Em Andamento' },
              { key: 'UPCOMING', label: '🔵 Agendados' },
              { key: 'EXPIRED', label: '🔴 Expirados' }
            ].map((st) => (
              <button
                key={st.key}
                onClick={() => setFilterStatus(st.key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                  filterStatus === st.key
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-bold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid / Tabela de Eventos */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-xs text-slate-400">Carregando eventos e passeios...</p>
        </div>
      ) : processedEvents.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <Ticket className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Nenhum evento encontrado
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery || selectedSchool !== 'ALL' || filterStatus !== 'ALL' || filterType !== 'ALL' || filterTemplate !== 'ALL'
              ? 'Tente ajustar os filtros ou o termo de busca para localizar os eventos.'
              : 'Crie seu primeiro modelo de evento ou agende para uma escola parceira.'}
          </p>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSchool('ALL');
                setFilterStatus('ALL');
                setFilterType('ALL');
                setFilterTemplate('ALL');
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-all"
            >
              Limpar Filtros
            </button>
            <button
              onClick={openNewModal}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Novo Evento
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Tipo &amp; Evento</th>
                  <th className="px-5 py-3.5">Escola Parceira (Origem)</th>
                  <th className="px-5 py-3.5">Link Exclusivo da Escola</th>
                  <th className="px-5 py-3.5">Período (Início / Fim)</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-center">Inscritos</th>
                  <th className="px-5 py-3.5 text-center">Presentes / Livros</th>
                  <th className="px-5 py-3.5 text-right sticky right-0 bg-slate-50 dark:bg-slate-950 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {processedEvents.map((evt) => {
                  const badge = getEventTypeBadge(evt.event_type);
                  const temporal = getEventTemporalStatus(evt);
                  const publicUrl = getEventPublicUrl(evt.slug);
                  const isCopied = copiedId === evt.id;

                  return (
                    <tr
                      key={evt.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors group"
                    >
                      {/* Tipo & Evento */}
                      <td className="px-5 py-3.5">
                        <div className="block">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.bg}`}>
                              {badge.label}
                            </span>
                            {evt.is_template && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 flex items-center gap-1">
                                <Target className="h-3 w-3" />
                                Modelo Base
                              </span>
                            )}
                          </div>
                          <Link 
                            href={evt.is_template ? '#' : `/schools/events/${evt.id}`}
                            onClick={(e) => {
                              if (evt.is_template) {
                                e.preventDefault();
                                openEditModal(evt);
                              }
                            }}
                            className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                          >
                            {evt.title}
                          </Link>
                          {evt.location_destination && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[200px]">{evt.location_destination}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Escola Parceira */}
                      <td className="px-5 py-3.5">
                        {evt.is_template ? (
                          <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-medium text-xs">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Modelo Reutilizável</span>
                          </div>
                        ) : evt.school_name ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-indigo-500 shrink-0" />
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {evt.school_name}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                ID #{evt.school_customer_id}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 text-[11px] italic">
                            Geral / Todas
                          </span>
                        )}
                      </td>

                      {/* Link Exclusivo com Copiar e Compartilhar */}
                      <td className="px-5 py-3.5">
                        {evt.is_template ? (
                          <span className="text-[11px] text-slate-400 italic">
                            Gera link único por escola
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div
                              title={publicUrl}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300 max-w-[170px] truncate flex items-center gap-1.5 select-all"
                            >
                              <LinkIcon className="h-3 w-3 text-indigo-500 shrink-0" />
                              <span className="truncate">/public/eventos/{evt.slug}</span>
                            </div>

                            {/* Botão Copiar */}
                            <button
                              onClick={() => handleCopyLink(evt)}
                              title="Copiar link exclusivo da escola"
                              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:hover:bg-indigo-950/50 transition-all"
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {/* Botão Abrir em Nova Aba */}
                            <a
                              href={publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Visualizar tela pública de inscrição"
                              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>

                            {/* Botão Compartilhar WhatsApp */}
                            <button
                              onClick={() => handleShareWhatsApp(evt)}
                              title="Compartilhar no WhatsApp"
                              className="p-1.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Período */}
                      {/* Período (Clicável para Editar Datas) */}
                      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                        <button
                          type="button"
                          onClick={() => openEditModal(evt)}
                          title="Clique para alterar a data de início ou término deste evento"
                          className="group/date inline-flex items-center gap-2 px-2.5 py-1.5 -mx-2.5 -my-1.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all text-left cursor-pointer"
                        >
                          <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span className="font-semibold underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-4 group-hover/date:decoration-indigo-500">
                            {evt.start_date
                              ? new Date(evt.start_date).toLocaleDateString('pt-BR')
                              : 'Imediato'}
                            {' → '}
                            {evt.end_date
                              ? new Date(evt.end_date).toLocaleDateString('pt-BR')
                              : 'Sem término'}
                          </span>
                          <Edit3 className="h-3 w-3 text-slate-400 group-hover/date:text-indigo-600 dark:group-hover/date:text-indigo-400 shrink-0 transition-colors" />
                        </button>
                      </td>

                      {/* Status Inteligente / Expirado */}
                      <td className="px-5 py-3.5 text-center">
                        {evt.is_template ? (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Modelo Base
                          </span>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span
                              className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${temporal.colorClass}`}
                            >
                              {temporal.status === 'EXPIRED' && <AlertTriangle className="h-2.5 w-2.5" />}
                              {temporal.status === 'ACTIVE' && (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              )}
                              {temporal.status === 'UPCOMING' && <Clock className="h-2.5 w-2.5" />}
                              {temporal.label}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5 block">
                              {temporal.detail}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Inscritos */}
                      <td className="px-5 py-3.5 text-center font-medium text-slate-700 dark:text-slate-200">
                        {evt.is_template ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                            {evt.participants_count}
                          </span>
                        )}
                      </td>

                      {/* Presentes / Livros */}
                      <td className="px-5 py-3.5 text-center font-medium">
                        {evt.is_template ? (
                          <span className="text-slate-400">-</span>
                        ) : evt.event_type === 'AMIGO_SECRETO' ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold text-xs border border-emerald-200/50">
                            {evt.gifts_purchased_count} comprados
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Ações (Fixas à direita para nunca sumir no scroll) */}
                      <td className="px-5 py-3.5 text-right sticky right-0 bg-white group-hover:bg-slate-50/90 dark:bg-slate-900 dark:group-hover:bg-slate-850 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] z-10">
                        <div className="flex items-center justify-end gap-1.5">
                        {/* Se for template, botão de ação rápida: Agendar para Escola */}
                        {evt.is_template && (
                          <button
                            onClick={() => openScheduleModal(evt)}
                            title="Agendar este modelo para uma escola"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold text-xs border border-indigo-200/60 dark:border-indigo-800 transition-all"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            Agendar
                          </button>
                        )}

                        {/* Botão Editar Evento / Datas */}
                        <button
                          onClick={() => openEditModal(evt)}
                          title="Editar evento, datas ou página de apresentação"
                          className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:hover:bg-indigo-950/40 text-slate-600 dark:text-slate-300 transition-all text-xs"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        {/* Botão Gerenciar Participantes */}
                        {!evt.is_template && (
                          <Link
                            href={`/schools/events/${evt.id}`}
                            title="Ver participantes e detalhes"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300 transition-all text-xs"
                          >
                            Gerenciar
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        )}

                        {/* Botão Excluir */}
                        <button
                          onClick={() => handleDeleteEvent(evt.id, evt.title)}
                          disabled={deletingId === evt.id}
                          title="Excluir Evento (se não tiver pedidos finalizados)"
                          className="p-1.5 rounded-xl border border-red-200/60 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 hover:border-red-300 transition-all"
                        >
                          {deletingId === evt.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Evento */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
            >
              <div className="p-5 md:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    {editingEventId ? <Edit3 className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      {editingEventId
                        ? 'Editar Evento / Ação'
                        : formData.is_template
                        ? 'Novo Modelo Base (Template)'
                        : 'Novo Evento / Ação Escolar'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {editingEventId
                        ? 'Altere datas de início, encerramento, título e apresentação aos pais.'
                        : 'Configure o evento, datas e o link exclusivo amarrado à escola.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitEvent} className="p-5 md:p-6 overflow-y-auto space-y-4">
                {/* Checkbox: Modelo Base (Template) */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="is_template"
                    checked={formData.is_template}
                    onChange={(e) => setFormData({ ...formData, is_template: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="is_template" className="text-xs cursor-pointer select-none">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-purple-600" />
                      Definir como Modelo Base (Template de Evento)
                    </span>
                    <span className="block text-slate-500 text-[11px] mt-0.5">
                      Modelos base servem como catálogo padrão (regras, vitrine, apresentação). Depois você pode agendá-lo para diferentes escolas alterando apenas as datas com 1 clique.
                    </span>
                  </label>
                </div>

                {/* Se não for template e estiver criando, permitir carregar de um modelo existente */}
                {!formData.is_template && !editingEventId && templateEvents.length > 0 && (
                  <div className="space-y-1.5 p-3 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40">
                    <label className="text-xs font-semibold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                      Carregar a partir de um Modelo Existente (Opcional)
                    </label>
                    <select
                      value={formData.parent_event_id}
                      onChange={(e) => handleSelectTemplate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                      <option value="">Nenhum (Criar do zero)</option>
                      {templateEvents.map((t) => (
                        <option key={t.id} value={t.id}>
                          🎯 {t.title} ({t.event_type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Título do Evento */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Título do Evento *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Passeio Cultural ao Planetário ou Amigo Secreto 2026"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Tipo de Ação + Escola Vinculada */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Tipo de Ação *
                    </label>
                    <select
                      value={formData.event_type}
                      onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="AMIGO_SECRETO">🎁 Amigo Secreto</option>
                      <option value="PASSEIO">🚌 Passeio Escolar</option>
                      <option value="FEIRA_LIVRO">📚 Feira do Livro</option>
                      <option value="EVENTO_GERAL">🎪 Outro Evento</option>
                    </select>
                  </div>

                  {!formData.is_template ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Escola Vinculada (Origem do Link)
                      </label>
                      <select
                        value={formData.school_customer_id}
                        onChange={(e) => setFormData({ ...formData, school_customer_id: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">Geral / Todas as Escolas</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>
                            🏫 {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Escopo
                      </label>
                      <div className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                        <span>Modelo Base (Válido para todas as escolas)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Datas de Início e Término (Editáveis a qualquer momento) */}
                <div className="p-3.5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                      Datas do Evento (Pode ser alterado a qualquer momento)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Data de Início do Evento
                      </label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Data de Término / Encerramento
                      </label>
                      <input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Vitrine de Livros */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Vitrine de Livros Vinculada (Opcional)
                  </label>
                  <select
                    value={formData.showcase_id}
                    onChange={(e) => setFormData({ ...formData, showcase_id: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Nenhuma vitrine específica</option>
                    {showcases.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.title} ({sc.items_count ?? 0} {sc.items_count === 1 ? 'livro' : 'livros'}) {!sc.is_currently_active ? '— [Expirada / Inativa]' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    Os pais poderão adquirir os livros desta vitrine com entrega direta na escola parceira.
                  </p>
                </div>

                {formData.event_type === 'PASSEIO' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Destino / Local do Passeio
                    </label>
                    <input
                      type="text"
                      value={formData.location_destination}
                      onChange={(e) => setFormData({ ...formData, location_destination: e.target.value })}
                      placeholder="Ex: Museu Catavento, Parque Ecológico, Zoológico..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                )}

                {/* Seção Página de Apresentação aos Pais & Upload de Imagens */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        Página de Apresentação aos Pais &amp; Personalização Visual
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Envie os arquivos visuais e edite as orientações da atividade que serão exibidas aos responsáveis.
                      </p>
                    </div>
                  </div>

                  {/* Upload de Logo e Banner */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bloco Logo */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5 text-indigo-500" />
                          Logo da Ação / Projeto
                        </label>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                          Máx 2 MB • 1200×1200px
                        </span>
                      </div>

                      {formData.logo_url ? (
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <img 
                              src={formData.logo_url.startsWith('http') ? formData.logo_url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${formData.logo_url}`} 
                              alt="Logo Preview" 
                              className="h-10 w-10 object-contain rounded bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0" 
                            />
                            <div className="truncate">
                              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate block">
                                {formData.logo_url}
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ Imagem vinculada
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, logo_url: '' })}
                            title="Remover logo"
                            className="p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 cursor-pointer transition-all">
                            {uploadingLogo ? (
                              <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold py-1">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Validando e enviando logo...</span>
                              </div>
                            ) : (
                              <>
                                <UploadCloud className="h-6 w-6 text-slate-400 group-hover:text-indigo-500 mb-1" />
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                  Enviar Logo
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5 text-center">
                                  JPG, PNG ou WEBP (Recomendado: 400×400 a 800×800px)
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              disabled={uploadingLogo}
                              onChange={(e) => handleUploadAsset(e, 'logo')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Bloco Banner */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5 text-indigo-500" />
                          Banner de Capa
                        </label>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                          Máx 5 MB • 2560×1440px
                        </span>
                      </div>

                      {formData.banner_url ? (
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <img 
                              src={formData.banner_url.startsWith('http') ? formData.banner_url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${formData.banner_url}`} 
                              alt="Banner Preview" 
                              className="h-10 w-20 object-cover rounded border border-slate-200 dark:border-slate-700 shrink-0" 
                            />
                            <div className="truncate">
                              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate block">
                                {formData.banner_url}
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ Imagem vinculada
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, banner_url: '' })}
                            title="Remover banner"
                            className="p-1 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 cursor-pointer transition-all">
                            {uploadingBanner ? (
                              <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold py-1">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Validando e enviando banner...</span>
                              </div>
                            ) : (
                              <>
                                <UploadCloud className="h-6 w-6 text-slate-400 group-hover:text-indigo-500 mb-1" />
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                  Enviar Banner
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5 text-center">
                                  JPG, PNG ou WEBP (Recomendado: 1920×600 ou 1200×400px)
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              disabled={uploadingBanner}
                              onChange={(e) => handleUploadAsset(e, 'banner')}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Editor de HTML Completo (com abas Visual e Código HTML) */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Code className="h-3.5 w-3.5 text-indigo-500" />
                        Como Funciona / Apresentação aos Pais (Editor HTML)
                      </label>
                      <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 dark:bg-slate-800 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setHtmlEditorTab('visual')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                            htmlEditorTab === 'visual'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          <FileText className="h-3 w-3" />
                          Editor Visual
                        </button>
                        <button
                          type="button"
                          onClick={() => setHtmlEditorTab('code')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                            htmlEditorTab === 'code'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          <Code className="h-3 w-3" />
                          Código HTML
                        </button>
                      </div>
                    </div>

                    {htmlEditorTab === 'visual' ? (
                      <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xs [&_.ql-toolbar]:bg-slate-50 dark:[&_.ql-toolbar]:bg-slate-950 [&_.ql-toolbar]:border-none [&_.ql-container]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 dark:[&_.ql-toolbar]:border-slate-800 [&_.ql-editor]:min-h-[160px] [&_.ql-editor]:text-xs sm:[&_.ql-editor]:text-sm [&_.ql-editor]:text-slate-900 dark:[&_.ql-editor]:text-white dark:[&_.ql-picker-label]:text-slate-300 dark:[&_.ql-stroke]:stroke-slate-300 dark:[&_.ql-fill]:fill-slate-300 dark:[&_.ql-picker-options]:bg-slate-900 dark:[&_.ql-picker-item]:text-slate-300">
                        <ReactQuill 
                          theme="snow"
                          value={formData.content_html || ''}
                          onChange={(value) => setFormData((prev) => ({ ...prev, content_html: value }))}
                          placeholder="Explique detalhadamente como funciona a atividade aos pais: objetivos pedagógicos, autorizações, horários de saída/retorno, transporte, regras e orientações..."
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <textarea
                          rows={6}
                          value={formData.content_html}
                          onChange={(e) => setFormData((prev) => ({ ...prev, content_html: e.target.value }))}
                          placeholder="<p>Escreva ou cole tags HTML diretamente aqui...</p>"
                          className="w-full p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                        />
                        <p className="text-[10px] text-slate-400">
                          Você pode inserir tags HTML personalizadas (&lt;h3&gt;, &lt;b&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;p&gt;, etc.).
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção de Codinomes e Nomes de Personagens */}
                <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          🎭 Nomes de Personagens &amp; Codinomes dos Participantes
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Disponibilize codinomes divertidos para os participantes escolherem ou sortearem no cadastro.
                        </p>
                      </div>
                    </div>

                    {/* Toggle Liga/Desliga */}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.use_character_names}
                        onChange={(e) => setFormData({ ...formData, use_character_names: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                      <span className="ml-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {formData.use_character_names ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </label>
                  </div>

                  {formData.use_character_names && (
                    <div className="space-y-3 pt-2 border-t border-indigo-100 dark:border-indigo-900/40 animate-in fade-in duration-200">
                      {/* Botões de Ação Rápida */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          Personagens Disponíveis: <strong className="text-indigo-600 dark:text-indigo-400">{formData.characters.length}</strong>
                        </span>

                        <button
                          type="button"
                          onClick={handleGenerateRandomCharacters}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-sm shadow-purple-500/20"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          🎲 Gerar Lista com Nomes Engraçados
                        </button>
                      </div>

                      {/* Input para Adicionar Manualmente */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newCharacterInput}
                          onChange={(e) => setNewCharacterInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCharacter();
                            }
                          }}
                          placeholder="Ex: Capitão Pipoca, Mago da Coxinha, Detetive Picolé..."
                          className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button
                          type="button"
                          onClick={handleAddCharacter}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all inline-flex items-center gap-1 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar
                        </button>
                      </div>

                      {/* Lista de Tags de Personagens */}
                      {formData.characters.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
                          {formData.characters.map((charName, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 text-xs font-medium"
                            >
                              <span>🎭 {charName}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveCharacter(idx)}
                                className="hover:text-red-500 transition-colors p-0.5"
                                title="Remover personagem"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          Nenhum personagem cadastrado ainda. Clique em "Gerar Lista com Nomes Engraçados" ou digite nomes manualmente acima.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Descrição Interna */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Observações / Notas Internas
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Notas internas da equipe da editora/seller sobre este evento..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-slate-500 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-sm"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {editingEventId
                      ? 'Salvar Alterações do Evento'
                      : formData.is_template
                      ? 'Criar Modelo Base'
                      : 'Criar Evento com Link Exclusivo'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SchoolEventsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    }>
      <SchoolEventsContent />
    </Suspense>
  );
}
