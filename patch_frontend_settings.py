import re

file_path = "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/(dashboard)/settings/page.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add fiscalSettings state
if "const [fiscalSettings, setFiscalSettings] = useState" not in content:
    state_injection = """  const [fiscalSettings, setFiscalSettings] = useState({
    nfse_enabled: false,
    nfse_environment: 'HOMOLOGACAO',
    razao_social: '',
    inscricao_municipal: '',
    codigo_municipio_ibge: '',
    regime_tributario: '',
    optante_simples_nacional: false,
    cert_path: ''
  });

  const [settings, setSettings] = useState({"""
    content = content.replace("  const [settings, setSettings] = useState({", state_injection)

# 2. Add fetch /companies/{cid}
if "const filterRes = await fetch" not in content:
    fetch_injection = """      const filterRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (filterRes.ok) {
        const filterData = await filterRes.json();
        setFiscalSettings({
          nfse_enabled: filterData.nfse_enabled || false,
          nfse_environment: filterData.nfse_environment || 'HOMOLOGACAO',
          razao_social: filterData.razao_social || '',
          inscricao_municipal: filterData.inscricao_municipal || '',
          codigo_municipio_ibge: filterData.codigo_municipio_ibge || '',
          regime_tributario: filterData.regime_tributario || '',
          optante_simples_nacional: filterData.optante_simples_nacional || false,
          cert_path: filterData.cert_path || ''
        });
      }

      const res = await fetch("""
    content = content.replace("      const res = await fetch(", fetch_injection)

# 3. Add PUT /companies/{cid} in save handle
if "body: JSON.stringify(fiscalSettings)" not in content:
    put_injection = """      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(fiscalSettings)
      });

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`,"""
    content = content.replace("      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`,", put_injection)

# 4. Add tab menu
if "{ id: 'fiscal', label: 'Fiscal / NFS-e', icon: Building2 }" not in content:
    tab_injection = """    { id: 'geral', label: 'Dados Gerais', icon: Settings2 },
    { id: 'fiscal', label: 'Fiscal (NFS-e)', icon: Building2 },"""
    content = content.replace("    { id: 'geral', label: 'Dados Gerais', icon: Settings2 },", tab_injection)

# 5. Add UI Tab Data
if "id=\"fiscal-content\"" not in content:
    fiscal_ui = """
              {/* Tab: FISCAL */}
              {activeTab === 'fiscal' && (
                <div className="space-y-8 animate-in fade-in" id="fiscal-content">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                          NFS-e Padrão Nacional
                          <label className="relative flex items-center cursor-pointer shrink-0">
                            <span className="mr-3 text-sm font-medium text-slate-700 dark:text-slate-300">Ativar Emissão</span>
                            <div className="relative">
                              <input type="checkbox" className="sr-only peer" checked={fiscalSettings.nfse_enabled} onChange={e => setFiscalSettings({ ...fiscalSettings, nfse_enabled: e.target.checked })} />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 dark:bg-slate-700 dark:border-slate-600"></div>
                            </div>
                          </label>
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Configuração de emissão direta com a Receita Federal (mTLS).</p>
                      </div>
                    </div>

                    {fiscalSettings.nfse_enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Ambiente</label>
                          <select
                            value={fiscalSettings.nfse_environment}
                            onChange={e => setFiscalSettings({ ...fiscalSettings, nfse_environment: e.target.value })}
                            className={`w-full border rounded-xl px-4 py-2.5 outline-none font-medium text-sm transition-all ${fiscalSettings.nfse_environment === 'PRODUCAO' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'}`}
                          >
                            <option value="HOMOLOGACAO">HOMOLOGAÇÃO (Sandbox Nacional)</option>
                            <option value="PRODUCAO">PRODUÇÃO (Real com Valor Fiscal)</option>
                          </select>
                        </div>
                        
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Razão Social</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.razao_social} onChange={e => setFiscalSettings({...fiscalSettings, razao_social: e.target.value})} />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Inscrição Municipal (IM)</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.inscricao_municipal} onChange={e => setFiscalSettings({...fiscalSettings, inscricao_municipal: e.target.value})} />
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Código IBGE Município (Ex: 3504107)</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.codigo_municipio_ibge} onChange={e => setFiscalSettings({...fiscalSettings, codigo_municipio_ibge: e.target.value})} />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Regime Tributário</label>
                          <input type="text" placeholder="Ex: 01 (Simples)" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.regime_tributario} onChange={e => setFiscalSettings({...fiscalSettings, regime_tributario: e.target.value})} />
                        </div>

                        <div className="space-y-1.5 pt-7">
                          <label className="relative flex items-center cursor-pointer shrink-0">
                            <span className="mr-3 text-sm font-medium text-slate-700 dark:text-slate-300">Optante Simples Nacional</span>
                            <div className="relative">
                              <input type="checkbox" className="sr-only peer" checked={fiscalSettings.optante_simples_nacional} onChange={e => setFiscalSettings({ ...fiscalSettings, optante_simples_nacional: e.target.checked })} />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 dark:bg-slate-700 dark:border-slate-600"></div>
                            </div>
                          </label>
                        </div>
                        
                        <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                            Certificado Digital A1 (.pfx)
                          </label>
                          <div className="flex items-center gap-3 w-full">
                            <input
                              type="file"
                              accept=".pfx"
                              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 dark:file:bg-purple-900/30 dark:file:text-purple-400"
                            />
                            <div className="w-48">
                              <input type="password" placeholder="Senha do Certificado" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.cert_password || ''} onChange={e => setFiscalSettings({...fiscalSettings, cert_password: e.target.value})} />
                            </div>
                          </div>
                          {fiscalSettings.cert_path && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">✔ Certificado físico atual hospedado.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
"""
    content = content.replace("              {/* Tab: GERAL */}", fiscal_ui + "\n              {/* Tab: GERAL */}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch aplicado com sucesso!")
