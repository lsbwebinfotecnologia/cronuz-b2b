'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Loader2, Plus, Trash2, Edit2 } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface Note {
  id: number;
  company_id: number;
  author_id: number;
  content: string;
  created_at: string;
  author?: {
    name: string;
  };
}

export default function CompanyNotesPage() {
  const params = useParams();
  const companyId = params.id as string;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [companyId]);

  async function fetchNotes() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/company-notes/${companyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotes(await res.json());
      }
    } catch (error) {
       toast.error('Erro ao carregar as notas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteContent.trim()) return;
    
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/company-notes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ company_id: parseInt(companyId), content: newNoteContent })
      });
      if (!res.ok) throw new Error('Falha ao adicionar nota');
      
      const newNote = await res.json();
      setNotes([newNote, ...notes]);
      toast.success('Nota adicionada!');
      setNewNoteContent('');
      setShowModal(false);
    } catch (error) {
      toast.error('Erro ao adicionar a nota.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditNote(e: React.FormEvent) {
    e.preventDefault();
    if (!editContent.trim() || !editingNote) return;
    
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/company-notes/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content: editContent })
      });
      if (!res.ok) throw new Error('Falha ao editar nota');
      
      const updatedNote = await res.json();
      setNotes(notes.map(n => n.id === editingNote.id ? updatedNote : n));
      toast.success('Nota atualizada!');
      setEditingNote(null);
      setEditContent('');
    } catch (error) {
      toast.error('Erro ao editar a nota.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteNote(noteId: number) {
    if (!window.confirm("Certeza que deseja EXCLUIR esta nota?")) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/company-notes/${noteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || 'Falha ao excluir a nota');
      }
      setNotes(notes.filter(n => n.id !== noteId));
      toast.success('Nota excluída!');
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  if (loading) {
    return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
         <div className="flex items-center gap-3">
           <FileText className="h-6 w-6 text-slate-500" />
           <div>
             <h2 className="text-xl font-bold text-slate-900 dark:text-white">Notas Internas</h2>
             <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
               Anote informações rápidas sobre o cliente.
             </p>
           </div>
         </div>
         <button 
           onClick={() => setShowModal(true)}
           className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm"
         >
           <Plus className="h-4 w-4" />
           Nova Nota
         </button>
      </div>

      <div className="flex-1 overflow-x-auto">
         <table className="w-full text-left text-sm whitespace-nowrap">
           <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 font-medium">
             <tr>
               <th className="px-6 py-4 min-w-[300px]">Descrição</th>
               <th className="px-6 py-4">Adicionado por</th>
               <th className="px-6 py-4">Data da Adição</th>
               <th className="px-6 py-4 text-center w-24">Opções</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
             {notes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    Nenhuma nota encontrada.
                  </td>
                </tr>
             ) : (
                notes.map(note => (
                   <tr key={note.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                     <td className="px-6 py-4 whitespace-normal break-words text-slate-900 dark:text-slate-200">
                       {note.content}
                     </td>
                     <td className="px-6 py-4 text-[var(--color-primary-base)] font-medium">
                       {note.author?.name || `ID: ${note.author_id}`}
                     </td>
                     <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                       {new Date(note.created_at).toLocaleString('pt-BR')}
                     </td>
                     <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                           <button onClick={() => { setEditingNote(note); setEditContent(note.content); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                             <Edit2 className="h-4 w-4" />
                           </button>
                           <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                             <Trash2 className="h-4 w-4" />
                           </button>
                        </div>
                     </td>
                   </tr>
                ))
             )}
           </tbody>
         </table>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <form onSubmit={handleAddNote}>
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Adicionar Nota</h3>
                </div>
                <div className="p-6 bg-slate-50 dark:bg-slate-900/50">
                  <textarea
                    required
                    rows={4}
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Escreva sua nota aqui..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] resize-none"
                  ></textarea>
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 font-medium text-slate-500 hover:bg-slate-100 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl flex items-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {editingNote && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <form onSubmit={handleEditNote}>
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Editar Nota</h3>
                </div>
                <div className="p-6 bg-slate-50 dark:bg-slate-900/50">
                  <textarea
                    required
                    rows={4}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Edite sua nota aqui..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] resize-none"
                  ></textarea>
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => { setEditingNote(null); setEditContent(''); }}
                    className="px-4 py-2 font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-xl flex items-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
