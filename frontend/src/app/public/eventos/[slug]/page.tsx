'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GraduationCap, Gift, Calendar, Sparkles, CheckCircle2, 
  Copy, Check, Share2, Loader2, Heart, BookOpen, AlertCircle,
  MapPin, Info, ShieldCheck, Ticket, Lock, Search, ArrowRight, ShoppingBag
} from 'lucide-react';
import { toast } from 'sonner';
import { maskCPF, validateCPF, maskPhone, validatePhone } from '@/lib/validators';

const GENRES_OPTIONS = [
  'Aventura & Exploradores',
  'Histórias em Quadrinhos & Mangá',
  'Dinossauros & Animais',
  'Contos de Fadas & Magia',
  'Pintura & Livros de Colorir',
  'Ciência, Espaço & Curiosidades',
  'Ficção & Fantasia',
  'Mistério & Detetives'
];

export default function PublicEventEnrollPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [eventData, setEventData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollSuccess, setEnrollSuccess] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Form State
  const [studentName, setStudentName] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [classId, setClassId] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentCpf, setParentCpf] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [characterName, setCharacterName] = useState('');

  // Lookup de Participante por CPF (quando o sorteio já foi realizado)
  const [lookupCpf, setLookupCpf] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [foundParticipants, setFoundParticipants] = useState<any[] | null>(null);


  useEffect(() => {
    async function fetchPublicEvent() {
      try {
        setLoading(true);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/events/${slug}`
        );
        if (res.ok) {
          const data = await res.json();
          setEventData(data);
          if (data.classes?.length === 1) {
            setClassId(String(data.classes[0].id));
          }
        } else {
          toast.error('Evento não encontrado ou encerrado.');
        }
      } catch {
        toast.error('Erro de conexão ao carregar o evento.');
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetchPublicEvent();
  }, [slug]);

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      if (selectedGenres.length >= 3) {
        toast.info('Selecione até 3 estilos preferidos.');
        return;
      }
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const handleCpfChange = (val: string) => {
    const masked = maskCPF(val);
    setParentCpf(masked);
    const raw = masked.replace(/\D/g, '');
    if (raw.length === 11) {
      if (!validateCPF(raw)) {
        setCpfError('CPF inválido. Verifique os dígitos.');
      } else {
        setCpfError('');
      }
    } else {
      setCpfError('');
    }
  };

  const handlePhoneChange = (val: string) => {
    const masked = maskPhone(val);
    setParentPhone(masked);
    const raw = masked.replace(/\D/g, '');
    if (raw.length >= 10) {
      setPhoneError('');
    }
  };

  const handleLookupCpf = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = lookupCpf.replace(/\D/g, '');
    if (raw.length !== 11) {
      toast.error('Informe os 11 dígitos do CPF do responsável.');
      return;
    }

    try {
      setLookupLoading(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/events/${eventData.id}/find-participant-by-cpf`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cpf: raw })
        }
      );

      if (res.ok) {
        const parts = await res.json();
        setFoundParticipants(parts);
        toast.success(
          parts.length === 1 
            ? `Inscrição de ${parts[0].student_name} encontrada!` 
            : `${parts.length} inscrições encontradas para este CPF!`
        );
      } else {
        const err = await res.json();
        setFoundParticipants([]);
        toast.error(err.detail || 'Nenhuma inscrição encontrada com este CPF.');
      }
    } catch {
      toast.error('Erro ao consultar inscrição.');
    } finally {
      setLookupLoading(false);
    }
  };


  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !parentName.trim() || !parentCpf.trim() || !parentPhone.trim()) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    const rawCpf = parentCpf.replace(/\D/g, '');
    if (!validateCPF(rawCpf)) {
      setCpfError('CPF inválido. Por favor, corrija para prosseguir.');
      toast.error('CPF do responsável inválido.');
      return;
    }

    const rawPhone = parentPhone.replace(/\D/g, '');
    if (!validatePhone(rawPhone)) {
      setPhoneError('Telefone com DDD inválido.');
      toast.error('Digite um número de telefone com DDD válido.');
      return;
    }

    try {
      setEnrolling(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/events/${eventData.id}/enroll`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_name: studentName.trim(),
            student_birth_date: studentBirthDate || null,
            character_name: characterName.trim() || null,
            class_id: classId ? parseInt(classId) : null,
            parent_name: parentName.trim(),
            parent_cpf: rawCpf,
            parent_phone: parentPhone.trim(),
            parent_email: parentEmail.trim() || null,
            wishlist_preferences: {
              genres: selectedGenres
            }
          })
        }
      );

      if (res.ok) {
        const data = await res.json();
        setEnrollSuccess(data);
        toast.success('Inscrição confirmada com sucesso!');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao realizar inscrição.');
      }
    } catch {
      toast.error('Erro de conexão ao enviar inscrição.');
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="h-12 w-12 text-slate-400 mb-3" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Evento não encontrado</h1>
        <p className="text-sm text-slate-500 mt-1">Verifique o link ou entre em contato com a coordenação da escola.</p>
      </div>
    );
  }

  const isExpired = eventData.end_date && new Date(eventData.end_date) < new Date();

  // Configuração de Personagens / Codinomes
  const rulesConfig = eventData?.rules_config || {};
  const useCharacters = !!rulesConfig.use_character_names;
  const allCharacters: string[] = Array.isArray(rulesConfig.characters) ? rulesConfig.characters : [];
  const usedCharacters: string[] = Array.isArray(eventData?.used_characters) ? eventData.used_characters : [];
  const availableCharacters = allCharacters.filter((c: string) => !usedCharacters.includes(c) || c === characterName);

  const handleRandomizeCharacter = () => {
    if (availableCharacters.length === 0) {
      toast.info('Não há mais personagens disponíveis para sorteio.');
      return;
    }
    const randomIndex = Math.floor(Math.random() * availableCharacters.length);
    const picked = availableCharacters[randomIndex];
    setCharacterName(picked);
    toast.success(`Personagem sorteado: ${picked}! 🎭`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col py-8 px-4 sm:px-6 font-sans">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        
        {/* Banner Customizado do Evento */}
        {eventData.banner_url && (
          <div className="rounded-3xl overflow-hidden shadow-lg border border-slate-200/80 dark:border-slate-800 max-h-56 sm:max-h-72 w-full">
            <img 
              src={eventData.banner_url} 
              alt={eventData.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Cabeçalho Centralizado da Instituição & Ação */}
        <div className="text-center space-y-3">
          {eventData.logo_url ? (
            <img 
              src={eventData.logo_url} 
              alt={eventData.title} 
              className="h-14 mx-auto object-contain mb-1"
            />
          ) : eventData.company_logo ? (
            <img 
              src={eventData.company_logo} 
              alt={eventData.company_name} 
              className="h-10 mx-auto object-contain mb-1"
            />
          ) : null}

          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">
              🏫 {eventData.school_name}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white pt-1">
            {eventData.title}
          </h1>

          {/* Local e Datas do Evento */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-1">
            {eventData.location_destination && (
              <span className="flex items-center gap-1 bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                {eventData.location_destination}
              </span>
            )}
            {eventData.start_date && (
              <span className="flex items-center gap-1 bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                Início: {new Date(eventData.start_date).toLocaleDateString('pt-BR')}
              </span>
            )}
            {eventData.end_date && (
              <span className={`flex items-center gap-1 bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border ${
                isExpired ? 'border-rose-300 text-rose-600 dark:text-rose-400' : 'border-slate-200/60 dark:border-slate-800'
              }`}>
                <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                {isExpired ? 'Inscrições Encerradas em' : 'Prazo Final'}: {new Date(eventData.end_date).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>

          {eventData.description && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto pt-1">
              {eventData.description}
            </p>
          )}
        </div>

        {/* Apresentação Rica Customizada em HTML / Instruções da Ação */}
        {eventData.content_html && (
          <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 pb-2 border-b border-slate-100 dark:border-slate-800">
              <Info className="h-4 w-4" />
              <span>Como Funciona a Atividade</span>
            </div>
            <div 
              className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: eventData.content_html }}
            />
          </div>
        )}

        {/* Card do Formulário ou Sucesso */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8">
          {enrollSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-5 py-4"
            >
              <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Inscrição Confirmada!
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {enrollSuccess.student_name} está participando do evento da escola!
                </p>
                {enrollSuccess.character_name && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-bold mt-2.5 shadow-xs">
                    <span>🎭 Codinome do Aluno:</span>
                    <span>{enrollSuccess.character_name}</span>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-left space-y-2">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                  🔑 Guarde o seu Link Mágico:
                </span>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Assim que o sorteio for realizado pela escola, você usará este link para ver quem seu filho tirou e escolher o livro na vitrine:
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}${enrollSuccess.magic_link}`}
                    className="w-full text-xs bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-300"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${enrollSuccess.magic_link}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                      toast.success('Link copiado!');
                    }}
                    className="p-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors shrink-0"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <a
                href={enrollSuccess.magic_link}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 inline-flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Acessar Área do Participante
              </a>
            </motion.div>
          ) : eventData.draw_performed ? (
            /* MODO APENAS COMPRAS / SORTEIO REALIZADO */
            <div className="space-y-6">
              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-pink-950/20 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 shadow-xs">
                    <Lock className="h-3.5 w-3.5" />
                    Inscrições Encerradas • Sorteio Realizado
                  </span>
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    Fase de Compras Aberta! 🎁
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    O sorteio do Amigo Secreto já foi realizado pela escola. Para garantir que ninguém fique sem amigo ou com pares divergentes, não é mais permitido novas inscrições. Agora a página é dedicada exclusivamente para a <strong>escolha e compra dos presentes</strong> na vitrine oficial!
                  </p>
                </div>

                {/* Busca da Inscrição por CPF do Responsável */}
                <div className="pt-2">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/60 shadow-xs space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5 text-indigo-500" />
                        Já inscreveu seu filho(a)? Acesse seu Amigo Secreto:
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Digite o CPF do responsável cadastrado para acessar o amigo sorteado e escolher o livro na vitrine.
                      </p>
                    </div>

                    <form onSubmit={handleLookupCpf} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        required
                        maxLength={14}
                        value={lookupCpf}
                        onChange={(e) => setLookupCpf(maskCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <button
                        type="submit"
                        disabled={lookupLoading}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 shrink-0"
                      >
                        {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Consultar Inscrição
                      </button>
                    </form>

                    {/* Inscrições Encontradas */}
                    {foundParticipants && foundParticipants.length > 0 && (
                      <div className="pt-2 space-y-2 animate-in fade-in">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Inscrições Localizadas ({foundParticipants.length}):
                        </span>
                        <div className="space-y-2">
                          {foundParticipants.map((p) => (
                            <div
                              key={p.id}
                              className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                                    {p.student_name}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 font-bold">
                                    {p.class_name}
                                  </span>
                                </div>
                                {p.character_name && (
                                  <span className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold block">
                                    🎭 Codinome: {p.character_name}
                                  </span>
                                )}
                              </div>

                              <a
                                href={p.magic_link}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-extrabold shadow-sm transition-all shrink-0"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Revelar Amigo & Escolher Presente
                                <ArrowRight className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Botão de Acesso Direto à Vitrine */}
              <div className="pt-2 text-center">
                <a
                  href={`/public/vitrine/${eventData.slug}`}
                  className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-xl shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="h-5 w-5" />
                  Ir para a Vitrine de Livros da Escola
                  <ArrowRight className="h-4 w-4" />
                </a>
                <p className="text-[11px] text-slate-400 mt-2">
                  🚚 Entrega coletiva gratuita realizada diretamente na escola no dia do evento.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleEnroll} className="space-y-5">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-indigo-500" />
                  Dados do Aluno(a)
                </h2>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nome Completo da Criança *
                </label>
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Ex: Lucas Gabriel da Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Turma / Série *
                  </label>
                  <select
                    required
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Selecione a turma...</option>
                    {eventData.classes?.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={studentBirthDate}
                    onChange={(e) => setStudentBirthDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              {/* Seção de Escolha de Personagem / Codinome */}
              {useCharacters && allCharacters.length > 0 && (
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span>🎭</span> Codinome / Nome de Personagem do Aluno
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Cada participante terá um codinome divertido para a brincadeira do Amigo Secreto.
                      </p>
                    </div>
                    {availableCharacters.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRandomizeCharacter}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        🎲 Sortear Nome Divertido
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <select
                      value={characterName}
                      onChange={(e) => setCharacterName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">-- Selecione um codinome ou clique em Sortear --</option>
                      {availableCharacters.map((c: string) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {characterName && (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-2 animate-in fade-in">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">🎭</span>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Codinome Escolhido:</span>
                          <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{characterName}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCharacterName('')}
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors p-1"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Preferências Literárias */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  O que a criança mais gosta de ler? (Escolha até 3 opções)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {GENRES_OPTIONS.map((genre) => {
                    const isSelected = selectedGenres.includes(genre);
                    return (
                      <button
                        type="button"
                        key={genre}
                        onClick={() => toggleGenre(genre)}
                        className={`p-2.5 rounded-xl text-left text-xs font-medium border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        <span>{genre}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Responsável Legal */}
              <div className="border-b border-slate-100 dark:border-slate-800 pt-4 pb-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Dados do Responsável
                </h2>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nome Completo do Responsável *
                </label>
                <input
                  type="text"
                  required
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="Ex: Marina da Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    CPF do Responsável *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={parentCpf}
                    onChange={(e) => handleCpfChange(e.target.value)}
                    placeholder="000.000.000-00"
                    className={`w-full px-3.5 py-2.5 rounded-xl border bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 font-mono ${
                      cpfError 
                        ? 'border-rose-400 focus:ring-rose-400/20 text-rose-600' 
                        : 'border-slate-200 dark:border-slate-800 focus:ring-indigo-500/20'
                    }`}
                  />
                  {cpfError && (
                    <span className="text-[11px] text-rose-500 font-medium block">
                      {cpfError}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    WhatsApp com DDD *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    value={parentPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className={`w-full px-3.5 py-2.5 rounded-xl border bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 font-mono ${
                      phoneError 
                        ? 'border-rose-400 focus:ring-rose-400/20 text-rose-600' 
                        : 'border-slate-200 dark:border-slate-800 focus:ring-indigo-500/20'
                    }`}
                  />
                  {phoneError && (
                    <span className="text-[11px] text-rose-500 font-medium block">
                      {phoneError}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={enrolling}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                >
                  {enrolling ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gift className="h-5 w-5" />}
                  Confirmar Inscrição no Amigo Secreto
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Vitrine Oficial de Livros (Exibida para compra direta ou consulta) */}
        {eventData.showcase && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full mb-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Vitrine Oficial do Evento</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {eventData.showcase.title || 'Livros Sugeridos'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Livros selecionados pela escola com frete gratuito e entrega coletiva no dia da festa.
                </p>
              </div>

              <a
                href={`/public/vitrine/${eventData.slug}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all border border-indigo-200 dark:border-indigo-800 shrink-0"
              >
                <ShoppingBag className="h-4 w-4" />
                Ver Vitrine Completa
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {eventData.showcase.products?.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4">
                {eventData.showcase.products.map((p: any) => (
                  <div
                    key={p.id}
                    className="bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-3 sm:p-4 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-800 transition-all group"
                  >
                    <div className="space-y-2">
                      <div className="aspect-[3/4] bg-white dark:bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-2 relative shadow-xs">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="h-full w-full object-contain group-hover:scale-105 transition-transform" />
                        ) : (
                          <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                        )}
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500 text-white">
                          Frete Grátis
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-medium block truncate">{p.brand || 'Livro'}</span>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-2 leading-tight">
                          {p.name}
                        </h4>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400">
                        R$ {p.price ? p.price.toFixed(2).replace('.', ',') : '0,00'}
                      </span>

                      <a
                        href={`/public/vitrine/${eventData.slug}`}
                        className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                        title="Comprar na vitrine"
                      >
                        <ShoppingBag className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs">
                Nenhum produto cadastrado nesta vitrine ainda.
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

