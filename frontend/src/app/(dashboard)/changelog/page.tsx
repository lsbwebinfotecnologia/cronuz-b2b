import fs from 'fs';
import path from 'path';
import { Calendar, CheckCircle2, CircleDashed, Rocket, Server, Wrench, FileText } from 'lucide-react';

export default async function ChangelogPage() {
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let introText = '';

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

  // Função helper para estilizar status
  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('produção') || s.includes('concluído')) {
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
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
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

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {tableRows.length > 0 ? (
          <div className="overflow-x-auto">
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
                {tableRows.map((row, index) => (
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
        ) : (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <p className="text-slate-500 font-medium">Nenhuma atualização devidamente registrada no changelog.</p>
          </div>
        )}
      </div>
    </div>
  );
}
