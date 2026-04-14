import re

# 1. Update customers/new/page.tsx
file_path_new = "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/(dashboard)/customers/new/page.tsx"
with open(file_path_new, "r", encoding="utf-8") as f:
    content_new = f.read()

# Add ibge_code to initial state
content_new = content_new.replace(
    "zip_code: '', type: 'MAIN' }",
    "zip_code: '', ibge_code: '', type: 'MAIN' }"
)

# Add ibge_code mapping to CNPJ fetch
if "ibge_code: data.codigo_municipio || ''" not in content_new:
    content_new = content_new.replace(
        "zip_code: maskCEP(data.cep.toString()),",
        "zip_code: maskCEP(data.cep.toString()),\n                   ibge_code: data.codigo_municipio ? data.codigo_municipio.toString() : '',"
    )

# Add ibge_code mapping to ViaCEP fetch
if "ibge_code: data.ibge || ''" not in content_new:
    content_new = content_new.replace(
        "zip_code: value // keep formatted or user typed",
        "zip_code: value,\n            ibge_code: data.ibge || ''"
    )

# Add Input field for IBGE Code in Address Form (STEP 2)
if ">Código IBGE</span>" not in content_new and ">Código IBGE</label>" not in content_new:
    ibge_input = """                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Código IBGE</label>
                             <input type="text" value={addr.ibge_code || ''} onChange={e => updateAddress(idx, 'ibge_code', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" placeholder="3504107"/>
                          </div>"""
    
    content_new = content_new.replace(
        "placeholder=\"SP\" maxLength={2}/>\n                             </div>\n                          </div>",
        "placeholder=\"SP\" maxLength={2}/>\n                             </div>\n                          </div>\n" + ibge_input
    )

with open(file_path_new, "w", encoding="utf-8") as f:
    f.write(content_new)


# 2. Update customers/[id]/page.tsx
file_path_id = "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/(dashboard)/customers/[id]/page.tsx"
with open(file_path_id, "r", encoding="utf-8") as f:
    content_id = f.read()

# Add ibge_code mapping to ViaCEP fetch
if "ibge_code: data.ibge || ''" not in content_id:
    content_id = content_id.replace(
        "zip_code: value // keep formatted",
        "zip_code: value,\n              ibge_code: data.ibge || ''"
    )

# Add Input field for IBGE Code in Address Form Modal
if "ibge_code:" not in content_id and "updateAddress" in content_id:
    ibge_input_id = """                  <div className="space-y-1">
                     <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Código IBGE</label>
                     <input type="text" value={addr.ibge_code || ''} onChange={e => updateAddress(idx, 'ibge_code', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" placeholder="Ex: 3504107"/>
                  </div>"""
    
    content_id = content_id.replace(
        "placeholder=\"SP\" maxLength={2} />\n                     </div>\n                  </div>",
        "placeholder=\"SP\" maxLength={2} />\n                     </div>\n                  </div>\n" + ibge_input_id
    )

with open(file_path_id, "w", encoding="utf-8") as f:
    f.write(content_id)

print("Patch de Clientes modificado com sucesso!")
