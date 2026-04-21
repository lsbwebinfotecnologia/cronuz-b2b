import re

path = "frontend/src/app/(dashboard)/settings/page.tsx"
with open(path, "r") as f:
    content = f.read()

# Insert the JSX before Tab: FRETE
if "Banco Inter (Boletos)" not in content:
    target_jsx_anchor = """                    </div>
                  </div>
                </div>
              )}

              {/* Tab: FRETE */}"""
    
    inter_jsx = """                    </div>
                  </div>

                  {/* BANCO INTER INTEGRATION */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 dark:bg-slate-800/50 dark:border-slate-700 mt-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center dark:bg-orange-900/40">
                        <Building2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white">Banco Inter (Boletos)</h3>
                        <p className="text-sm text-slate-500 font-medium">Emissão e conciliação automática de boletos bancários</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.inter_enabled} onChange={e => setSettings({ ...settings, inter_enabled: e.target.checked })} />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>

                    {settings.inter_enabled && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-top-4 relative">
                        <div className="absolute -left-6 top-0 bottom-0 w-1 bg-orange-500 rounded-r-md"></div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Conta Corrente (Opcional)</label>
                            <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-orange-500/50" placeholder="Ex: 1234567-8" value={settings.inter_account_number} onChange={e => setSettings({ ...settings, inter_account_number: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 block">Ambiente</label>
                            <div className="flex bg-slate-200 p-1 rounded-xl">
                              <button type="button" onClick={() => setSettings({...settings, inter_sandbox: true})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${settings.inter_sandbox ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Sandbox (Homol)</button>
                              <button type="button" onClick={() => setSettings({...settings, inter_sandbox: false})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${!settings.inter_sandbox ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Produção REAL</button>
                            </div>
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Client ID</label>
                            <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono text-sm" placeholder="Client_Id" value={settings.inter_client_id} onChange={e => setSettings({ ...settings, inter_client_id: e.target.value })} />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Client Secret</label>
                            <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono text-sm" placeholder="Client_Secret" value={settings.inter_client_secret} onChange={e => setSettings({ ...settings, inter_client_secret: e.target.value })} />
                          </div>
                        </div>

                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                          <h4 className="text-sm font-bold text-orange-900 flex items-center mb-2"><Key className="w-4 h-4 mr-2" /> Certificados de Aplicação (MTLS)</h4>
                          <p className="text-xs text-orange-800 mb-4">Você precisa fazer upload do arquivo <b>.crt</b> e da chave privada <b>.key</b> gerados no portal do Banco Inter.</p>
                          
                          <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="border-2 border-dashed border-orange-300 rounded-xl p-4 bg-white relative hover:bg-orange-50 transition-colors">
                                <input type="file" accept=".crt,.pem" onChange={e => setInterCertFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="flex items-center gap-3">
                                  <FileText className="w-8 h-8 text-orange-500" />
                                  <div>
                                    <p className="font-bold text-sm text-slate-700">{interCertFile ? interCertFile.name : 'Clique para enviar .CRT'}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="border-2 border-dashed border-orange-300 rounded-xl p-4 bg-white relative hover:bg-orange-50 transition-colors">
                                <input type="file" accept=".key" onChange={e => setInterKeyFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="flex items-center gap-3">
                                  <Key className="w-8 h-8 text-slate-500" />
                                  <div>
                                    <p className="font-bold text-sm text-slate-700">{interKeyFile ? interKeyFile.name : 'Clique para enviar .KEY'}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button type="button" onClick={handleInterCertUpload} disabled={!interCertFile || !interKeyFile} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 font-bold rounded-lg text-sm w-full md:w-auto">Enviar e Validar Certificados</button>
                          </div>
                          
                          {settings.inter_cert_path && (
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 py-1.5 px-3 rounded-lg w-fit border border-emerald-200">
                              <CheckCircle className="w-4 h-4" /> Certificados ativos e salvos no servidor
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: FRETE */}"""
    content = content.replace(target_jsx_anchor, inter_jsx)
else:
    print("JSX already inserted")

with open(path, "w") as f:
    f.write(content)

print("Patch complete.")
