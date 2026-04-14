import re
import os

files_to_patch = [
    "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/(dashboard)/services/create/page.tsx",
    "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/frontend/src/app/(dashboard)/services/[id]/edit/page.tsx"
]

for file_path in files_to_patch:
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # 1. Add Import
        if "import { LC116_CODES } from '@/lib/lc116';" not in content:
            content = content.replace(
                "import { useRouter } from 'next/navigation';",
                "import { useRouter } from 'next/navigation';\nimport { LC116_CODES } from '@/lib/lc116';"
            )

        # 2. Replace input with select
        # The original code looks something like:
        # <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Código LC 116</label>
        # <input type="text" value={formData.tax_code_lc116} onChange={(e) => setFormData({ ...formData, tax_code_lc116: e.target.value })} ... />
        
        # We need to find the <input type="text" ... tax_code_lc116 ... />
        import re
        input_regex = r'<input[^>]*value=\{formData\.tax_code_lc116\}[^>]*onChange=\{[^}]*\}[^>]*/>'
        
        select_element = """<select 
                                        value={formData.tax_code_lc116} 
                                        onChange={(e) => setFormData({ ...formData, tax_code_lc116: e.target.value })} 
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                                    >
                                        <option value="">Selecione o Código LC 116...</option>
                                        {LC116_CODES.map((item) => (
                                            <option key={item.code} value={item.code}>{item.label}</option>
                                        ))}
                                    </select>"""
        
        content = re.sub(input_regex, select_element, content, count=1)
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Patched {file_path}")
    else:
        print(f"File not found: {file_path}")
