import re

file_path = "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/(dashboard)/settings/page.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update initial state
content = content.replace(
    "nfse_next_number: 1,",
    "nfse_next_number: 1,\n    nfse_async_mode: true,"
)

content = content.replace(
    "nfse_next_number: filterData.nfse_next_number || 1,",
    "nfse_next_number: filterData.nfse_next_number || 1,\n          nfse_async_mode: filterData.nfse_async_mode ?? true,"
)

# 2. Add the Switch Toggle in UI
# Let's add it right after Ambiente
toggle_ui = """                        <div className="space-y-1.5 md:col-span-2 flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white dark:bg-slate-900/50 dark:border-slate-800">
                          <div>
                             <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">Modo de Emissão</label>
                             <span className="text-xs text-slate-500">Filas garantem que a tela não trave caso o governo demore a responder. Emissão Direta enviará instantaneamente e aguardará resposta (Timeout maior).</span>
                          </div>
                          <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold ${!fiscalSettings.nfse_async_mode ? 'text-[var(--color-primary-base)]' : 'text-slate-400'}`}>Direta Síncrona</span>
                              <button 
                                type="button"
                                onClick={() => setFiscalSettings({...fiscalSettings, nfse_async_mode: !fiscalSettings.nfse_async_mode})}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${fiscalSettings.nfse_async_mode ? 'bg-[var(--color-primary-base)]' : 'bg-slate-300 dark:bg-slate-700'}`}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${fiscalSettings.nfse_async_mode ? 'translate-x-6' : 'translate-x-1'}`} />
                              </button>
                              <span className={`text-xs font-bold ${fiscalSettings.nfse_async_mode ? 'text-[var(--color-primary-base)]' : 'text-slate-400'}`}>Fila Assíncrona</span>
                          </div>
                        </div>"""

content = content.replace(
    "                            <option value=\"PRODUCAO\">PRODUÇÃO (Real com Valor Fiscal)</option>\n                          </select>\n                        </div>",
    "                            <option value=\"PRODUCAO\">PRODUÇÃO (Real com Valor Fiscal)</option>\n                          </select>\n                        </div>\n\n" + toggle_ui
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patch UI Async Mode modificado com sucesso!")
