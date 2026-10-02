'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gift, Sparkles, CheckCircle2, Clock, Heart, BookOpen, 
  ShoppingBag, ArrowRight, Loader2, AlertCircle, School
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function SecretFriendRevealPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    async function fetchReveal() {
      try {
        setLoading(true);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/public/secret-friend/${token}`
        );
        if (res.ok) {
          const resData = await res.json();
          setData(resData);
          if (resData.drawn_friend) {
            setIsRevealed(true);
          }
        } else {
          toast.error('Participante não encontrado.');
        }
      } catch {
        toast.error('Erro de conexão.');
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchReveal();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="h-12 w-12 text-slate-400 mb-3" />
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Link inválido</h1>
        <p className="text-sm text-slate-500 mt-1">Verifique o link recebido por e-mail ou WhatsApp.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col py-8 px-4 sm:px-6 font-sans">
      <div className="w-full max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">
            {data.school_name}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {data.event_title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Participante: <strong className="text-slate-800 dark:text-slate-200">{data.my_student_name}</strong>
          </p>
        </div>

        {/* Card Principal */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 overflow-hidden text-center space-y-6">
          
          {!data.draw_performed ? (
            /* Sorteio ainda não realizado */
            <div className="py-6 space-y-4">
              <div className="h-16 w-16 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto">
                <Clock className="h-8 w-8 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Aguardando o Sorteio
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  A escola está recebendo as inscrições dos alunos. Assim que o sorteio for realizado, esta página revelará quem seu filho tirou!
                </p>
              </div>
            </div>
          ) : !isRevealed ? (
            /* Botão de Revelação com suspense */
            <div className="py-8 space-y-6">
              <div className="h-20 w-20 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <Gift className="h-10 w-10 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  O Sorteio Já Aconteceu! 🎁
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Clique no botão abaixo para descobrir quem é o amigo secreto de {data.my_student_name}!
                </p>
              </div>

              <button
                onClick={() => setIsRevealed(true)}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-sm shadow-xl shadow-indigo-500/30 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
              >
                <Sparkles className="h-5 w-5" />
                Revelar Amigo Secreto Agora
              </button>
            </div>
          ) : (
            /* Revelado! */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  🎉 Seu Amigo Secreto é:
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  {data.drawn_friend?.student_name}
                </h2>
                <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-sm border border-amber-100 dark:border-slate-800">
                  Turma: {data.drawn_friend?.class_name}
                </span>
              </div>

              {/* O que ele gosta de ler */}
              <div className="text-left p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
                  Gostos e Estilos Favoritos:
                </span>
                {data.drawn_friend?.wishlist_preferences?.genres?.length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {data.drawn_friend.wishlist_preferences.genres.map((g: string, i: number) => (
                      <span
                        key={i}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-800 shadow-sm"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Não especificou preferências. Você tem total liberdade de escolher um livro incrível!
                  </p>
                )}
              </div>

              {/* Status do Presente */}
              {data.has_purchased_gift ? (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3 text-left">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Presente Comprado com Sucesso!
                    </h4>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      O livro já foi embalado e será entregue na escola no dia da festa.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <a
                    href={`/public/vitrine/${data.event_slug || 'amigo-secreto'}?token=${token}`}
                    className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-xl shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
                  >

                    <ShoppingBag className="h-5 w-5" />
                    Escolher Presente na Vitrine da Escola
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <p className="text-[11px] text-slate-400">
                    🚚 <strong>Frete Grátis</strong>: Todos os livros comprados serão entregues juntos na escola.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
