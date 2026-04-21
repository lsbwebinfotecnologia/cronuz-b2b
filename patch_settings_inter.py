path = "frontend/src/app/(dashboard)/settings/page.tsx"
with open(path, "r") as f:
    content = f.read()

# Add to init state
content = content.replace(
    "inter_sandbox: true,",
    "inter_sandbox: true,\n    inter_api_version: 'V2',"
)

content = content.replace(
    "inter_sandbox: data.inter_sandbox ?? true,",
    "inter_sandbox: data.inter_sandbox ?? true,\n        inter_api_version: data.inter_api_version || 'V2',"
)

# Add to UI underneath inter_sandbox
old_ui = """                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Client ID</label>"""

new_ui = """                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Motor de Emissão (API)</label>
                            <div className="flex bg-slate-200 p-1 rounded-xl">
                              <button type="button" onClick={() => setSettings({...settings, inter_api_version: 'V2'})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${settings.inter_api_version === 'V2' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>V2 Clássica (Síncrono)</button>
                              <button type="button" onClick={() => setSettings({...settings, inter_api_version: 'V3'})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${settings.inter_api_version === 'V3' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>V3 BolePix (Assíncrono)</button>
                            </div>
                          </div>
                          
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Client ID</label>"""

if old_ui in content:
    content = content.replace(old_ui, new_ui)
    with open(path, "w") as f:
        f.write(content)
    print("Patched UI successfully!")
else:
    print("UI Block not found!")

