'use client';

import { useState, useEffect } from 'react';
import { Mail, Save, RefreshCw, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

export function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/settings/email-templates`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (e) {
      toast.error('Erro ao carregar os templates.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: number, subject: string, body: string) => {
    setSaving(id);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/settings/email-templates/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ subject, body_template: body })
      });
      if (!res.ok) throw new Error();
      toast.success('Template atualizado com sucesso!');
      await fetchTemplates();
    } catch (e) {
      toast.error('Erro ao atualizar o template.');
    } finally {
      setSaving(null);
    }
  };

  const handleRestore = async (id: number) => {
    if (!confirm('Deseja realmente restaurar este template para o padrão do sistema? O seu texto customizado será perdido.')) return;
    try {
      const loadingId = toast.loading('Restaurando...');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/settings/email-templates/${id}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error();
      toast.success('Template restaurado.', { id: loadingId });
      await fetchTemplates();
    } catch (e) {
      toast.error('Erro ao restaurar o template.');
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" /></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
        <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Modelos de E-mail (Templates)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Personalize o texto padrão dos e-mails disparados pelo sistema.</p>
        </div>
      </div>

      <div className="space-y-6">
        {templates.map(tpl => (
          <TemplateEditor 
            key={tpl.id} 
            template={tpl} 
            onSave={(subject, body) => handleUpdate(tpl.id, subject, body)} 
            onRestore={() => handleRestore(tpl.id)}
            saving={saving === tpl.id}
          />
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({ template, onSave, onRestore, saving }: any) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body_template);

  // Sync state if template changes from API (e.g. after restore)
  useEffect(() => {
    setSubject(template.subject);
    setBody(template.body_template);
  }, [template]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 shadow-sm p-5 dark:border-slate-800/60 dark:bg-slate-900/40">
      <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          {template.name}
          <span className="text-xs font-normal text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">{template.type}</span>
        </h3>
        <button 
          type="button"
          onClick={onRestore}
          className="text-xs flex items-center gap-1 text-slate-500 hover:text-red-500 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Restaurar Padrão
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Assunto do E-mail</label>
            <input 
              type="text" 
              value={subject} 
              onChange={e => setSubject(e.target.value)} 
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Corpo da Mensagem</label>
            <textarea 
              rows={6} 
              value={body} 
              onChange={e => setBody(e.target.value)} 
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20 font-mono text-[13px]" 
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onSave(subject, body)}
              disabled={saving}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/90 text-white font-medium py-2 px-6 rounded-xl flex items-center gap-2 transition-all disabled:opacity-70 text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Alterações
            </button>
          </div>
        </div>

        {/* Variables Panel */}
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-semibold mb-2 text-sm">
            <Info className="h-4 w-4" /> Variáveis Dinâmicas
          </div>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mb-3">
            Você pode colar essas tags no texto. Elas serão substituídas automaticamente:
          </p>
          <div className="flex flex-wrap gap-2">
            {template.variables_schema.map((v: string) => (
              <span key={v} className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-1 rounded text-[11px] font-mono border border-slate-200 dark:border-slate-700 shadow-sm cursor-copy select-all">
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
