'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Boxes, 
  ArrowLeft, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Info,
  X
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

export default function NewInventoryPage() {
  const router = useRouter();
  const user = getUser();
  const companyId = user?.company_id;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;

    if (!name.trim()) {
      toast.error('Informe o nome do inventário.');
      return;
    }

    setLoading(true);
    const token = getToken();

    try {
      // 1. Criar cabeçalho do inventário
      const createRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || undefined,
          description: description.trim() || undefined
        })
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.detail || 'Erro ao criar inventário.');
      }

      const invData = await createRes.json();
      const invId = invData.id;

      // 2. Se houver planilha selecionada, fazer o upload
      if (selectedFile) {
        toast.info('Enviando e processando base de produtos...');
        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory/${invId}/upload-sheet`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          toast.warning(`Inventário criado, mas houve aviso na planilha: ${err.detail || 'Erro no processamento'}`);
        } else {
          const uploadData = await uploadRes.json();
          toast.success(uploadData.message || 'Base carregada com sucesso!');
        }
      } else {
        toast.success('Inventário criado com sucesso!');
      }

      router.push(`/inventory/${invId}`);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao processar criação.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      {/* Voltar */}
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para lista de inventários
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
          <Boxes className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Novo Inventário de Estoque
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cadastre os dados da contagem e importe a base de produtos esperados.
          </p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="space-y-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            1. Identificação do Inventário
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Nome do Inventário <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Balanço Geral - Setembro 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Código de Referência
              </label>
              <input
                type="text"
                placeholder="Ex: INV-2026-001 (Automático)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Observações / Instruções Gerais
            </label>
            <textarea
              rows={2}
              placeholder="Instruções para a equipe de contagem, observações sobre prateleiras ou filiais..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Upload da Base */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              2. Carga da Base Esperada (Planilha)
            </h2>
            <span className="text-xs text-slate-400 font-medium">Opcional no momento da abertura</span>
          </div>

          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-500/20 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-semibold">Colunas aceitas no arquivo (.xlsx ou .csv):</p>
              <p>
                <code className="bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-bold">ISBN</code> (obrigatório),{' '}
                <code className="bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-bold">Título</code>,{' '}
                <code className="bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-bold">Editora</code>,{' '}
                <code className="bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-bold">Categoria</code>,{' '}
                <code className="bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-bold">Endereço</code> (localização padrão).
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                * Para manter máxima performance e leveza no cache offline dos celulares, não são armazenadas imagens.
              </p>
            </div>
          </div>

          {/* Input de Arquivo */}
          {!selectedFile ? (
            <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl cursor-pointer hover:border-teal-500 hover:bg-teal-50/20 dark:hover:bg-teal-950/10 transition-colors">
              <Upload className="h-8 w-8 text-slate-400 mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Clique para selecionar ou arraste o arquivo aqui
              </p>
              <p className="text-xs text-slate-400 mt-1">Suporta arquivos .XLSX ou .CSV</p>
              <input
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />
            </label>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl border border-teal-200 dark:border-teal-500/30 bg-teal-50/50 dark:bg-teal-950/20">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Botão Salvar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/inventory"
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              'Abrir Inventário'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
