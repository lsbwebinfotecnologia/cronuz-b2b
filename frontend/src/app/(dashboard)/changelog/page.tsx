import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { Calendar, CheckCircle2, CircleDashed, Rocket, Server, Wrench, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default async function ChangelogPage({ searchParams }: { searchParams: { page?: string } }) {
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let introText = '';

  const currentPage = parseInt(searchParams.page || '1', 10);
  const itemsPerPage = 50;

  try {
    const changelogPath = path.join(process.cwd(), '../.local_changelog.md');
    if (fs.existsSync(changelogPath)) {
      const raw = fs.readFileSync(changelogPath, 'utf8');
      const lines = raw.split('\n');
      let inTable = false;
      const textAcc = [];

      for (const line of lines) {
        const tline = line.trim();
        if (tline.startsWith('|')) {
          inTable = true;
          // Ignorar a linha de formatação do markdown
          if (tline.includes('---')) continue;
          
          const cols = tline.split('|').slice(1, -1).map(c => c.trim());
          if (tableHeaders.length === 0) {
            tableHeaders = cols;
          } else {
            // Remove backticks das strings usando regex simples para uma leitura mais limpa
            const cleanCols = cols.map(c => c.replace(/`/g, ''));
            tableRows.push(cleanCols);
          }
        } else if (!inTable) {
           // Só pegar parágrafos normais pulando títulos '#'
           if (tline && !tline.startsWith('#')) {
              textAcc.push(tline);
           }
        }
      }
      introText = textAcc.join(' ');
    }
  } catch (e) {
    console.error('Error reading changelog:', e);
  }

  // A tabela cresce pra baixo (mais antigo p/ mais novo). Damos um reverse para mostrar mais novos primeiro.
  tableRows.reverse();

  // Paginação
  const totalItems = tableRows.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedRows = tableRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Função helper para estilizar status
  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('produção') || s.includes('concluído') || s.includes('prod')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Concluído
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
        <CircleDashed className="w-3.5 h-3.5" />
        Pendente
      </span>
    );
  };

  const getEnvBadge = (env: string) => {
    const e = env.toLowerCase();
    if (e.includes('prod')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
          <Rocket className="w-3 h-3" />
          PROD
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <Server className="w-3 h-3" />
        LOCAL
      </span>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6 flex flex-col min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Atualizações da Plataforma
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            {introText || "Acompanhe as últimas melhorias, implementações técnicas e correções aplicadas aos módulos do sistema Cronuz B2B."}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 flex flex-col">
        {paginatedRows.length > 0 ? (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white whitespace-nowrap">Data</th>
                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white">Ajuste / Funcionalidade</th>
                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white text-center">Status</th>
                    <th className="px-6 py-4 font-semibold text-slate-900 dark:text-white text-center">Ambiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {paginatedRows.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
                          <Calendar className="w-4 h-4 opacity-50" />
                          {row[0]}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                        {/* O regex lá no inicio ja removeu os backticks. Vamos processar e destacar a primeria palavra que costuma ser o Modulo */}
                        <span className="block text-slate-900 dark:text-white leading-relaxed text-[15px]">
                          {row[1]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        {getStatusBadge(row[2] || '')}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        {row[3] ? getEnvBadge(row[3]) : <span className="text-slate-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Paginação */}
            {totalPages > 1 && (
              <div className="px-6 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                   Página {currentPage} de {totalPages} <span className="hidden sm:inline">({totalItems} atualizações catalogadas)</span>
                </span>
                <div className="flex gap-2">
                  <Link 
                    href={`/changelog?page=${Math.max(1, currentPage - 1)}`}
                    className={`p-2 rounded-lg border ${currentPage === 1 ? 'pointer-events-none opacity-50 border-slate-200 dark:border-slate-700' : 'border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'} transition-all`}
                  >
                    <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  </Link>
                  <Link 
                    href={`/changelog?page=${Math.min(totalPages, currentPage + 1)}`}
                    className={`p-2 rounded-lg border ${currentPage === totalPages ? 'pointer-events-none opacity-50 border-slate-200 dark:border-slate-700' : 'border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'} transition-all`}
                  >
                    <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  </Link>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center flex-1 flex flex-col justify-center">
            <div className="inline-flex mx-auto items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <p className="text-slate-500 font-medium">Nenhuma atualização devidamente registrada no changelog.</p>
          </div>
        )}
      </div>
    </div>
  );
}
