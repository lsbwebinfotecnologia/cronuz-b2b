import re

file_path = "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/(dashboard)/settings/page.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add cep state for viaCep and nfse_next_number
if "const [fiscalCep, setFiscalCep] = useState('');" not in content:
    content = content.replace(
        "const [fiscalSettings, setFiscalSettings] = useState({",
        "const [fiscalCep, setFiscalCep] = useState('');\n  const [fiscalSettings, setFiscalSettings] = useState({"
    )

if "nfse_next_number: 1" not in content:
    content = content.replace(
        "nfse_environment: 'HOMOLOGACAO',",
        "nfse_environment: 'HOMOLOGACAO',\n    nfse_next_number: 1,"
    )
    content = content.replace(
        "nfse_environment: filterData.nfse_environment || 'HOMOLOGACAO',",
        "nfse_environment: filterData.nfse_environment || 'HOMOLOGACAO',\n          nfse_next_number: filterData.nfse_next_number || 1,"
    )
    # Add to put body
    content = content.replace(
        "nfse_environment: fiscalSettings.nfse_environment,",
        "nfse_environment: fiscalSettings.nfse_environment,\n            nfse_next_number: fiscalSettings.nfse_next_number,"
    )

# 2. Add handleViaCep method
if "async function handleViaCep(cep: string)" not in content:
    viacep_func = """  async function handleViaCep(cep: string) {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro && data.ibge) {
          setFiscalSettings(prev => ({ ...prev, codigo_municipio_ibge: data.ibge }));
          toast.success(`IBGE do município ${data.localidade} preenchido.`);
        }
      } catch (e) {
        console.error('Erro ao buscar CEP', e);
      }
    }
  }

  async function handleSaveSettings"""
    content = content.replace("  async function handleSaveSettings", viacep_func)


# 3. Replace the Regiment and IBGE inputs in UI
if "Buscar IBGE" not in content:
    # First: CEP field above IBGE
    ibge_block = """                        <div className="space-y-1.5 pt-7">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Código IBGE Município</label>
                          <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.codigo_municipio_ibge} onChange={e => setFiscalSettings({...fiscalSettings, codigo_municipio_ibge: e.target.value})} placeholder="3504107" />
                        </div>"""
    
    ibge_replacement = """                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">CEP (Busca Automática do IBGE)</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalCep} onChange={e => setFiscalCep(e.target.value)} onBlur={() => handleViaCep(fiscalCep)} placeholder="00000-000" />
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Código IBGE do Município</label>
                          <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.codigo_municipio_ibge} onChange={e => setFiscalSettings({...fiscalSettings, codigo_municipio_ibge: e.target.value})} placeholder="Ex: 3504107" />
                        </div>"""
                        
    content = content.replace("""                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Código IBGE Município (Ex: 3504107)</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.codigo_municipio_ibge} onChange={e => setFiscalSettings({...fiscalSettings, codigo_municipio_ibge: e.target.value})} />
                        </div>""", ibge_replacement)

    # Next: Replace Regime Tributatio Input with Select
    regime_replacement = """                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Regime Tributário</label>
                          <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.regime_tributario} onChange={e => setFiscalSettings({...fiscalSettings, regime_tributario: e.target.value})}>
                            <option value="">Selecione...</option>
                            <option value="1">1 - Simples Nacional</option>
                            <option value="2">2 - Simples Nacional (Excesso de Sublimite)</option>
                            <option value="3">3 - Regime Normal (Lucro Presumido/Real)</option>
                            <option value="4">4 - Solidário</option>
                            <option value="5">5 - Microempreendedor Individual (MEI)</option>
                            <option value="6">6 - Microempresário e Empresa de Pequeno Porte (ME EPP)</option>
                          </select>
                        </div>"""
    
    content = content.replace("""                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Regime Tributário</label>
                          <input type="text" placeholder="Ex: 01 (Simples)" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.regime_tributario} onChange={e => setFiscalSettings({...fiscalSettings, regime_tributario: e.target.value})} />
                        </div>""", regime_replacement)
                        
    # Next: Próximo Numero da Nota
    next_number_injection = """
                        <div className="space-y-1.5 md:col-span-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Numerador Síncrono</h3>
                          <p className="text-xs text-slate-500 mb-3">Defina o sequencial a ser enviado para prefeitura na próxima emissão.</p>
                          <div className="w-48">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">Próxima NFS-e N°</label>
                            <input type="number" min="1" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 font-mono dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.nfse_next_number} onChange={e => setFiscalSettings({...fiscalSettings, nfse_next_number: parseInt(e.target.value) || 1})} />
                          </div>
                        </div>"""
    
    content = content.replace("""Certificado Digital A1 (.pfx)""", next_number_injection + """\n                          </label>
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mt-4">
                            Certificado Digital A1 (.pfx)""")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch modificado com sucesso!")
