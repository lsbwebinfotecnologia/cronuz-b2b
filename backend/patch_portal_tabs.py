import os
import re

with open("../frontend/src/app/h/[slug]/portal/page.tsx", "r") as f:
    content = f.read()

# Add imports
content = content.replace("import { toast } from 'sonner';", "import { toast } from 'sonner';\nimport { Database } from 'lucide-react';\nimport HorusConsignmentManager from '@/components/HorusConsignmentManager';")

# Add state
content = content.replace("const [cancelingId, setCancelingId] = useState<number | null>(null);", "const [cancelingId, setCancelingId] = useState<number | null>(null);\n    const [activeTab, setActiveTab] = useState<'subscriptions' | 'consignment'>('subscriptions');")

# Find the start of the <main> block to insert the tab HTML
main_tag = '<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">'
tabs_html = """
                {/* Tabs */}
                {customerInfo?.consignment_status === 'ACTIVE' && (
                    <div className="flex border-b border-slate-200 mb-8 overflow-x-auto hide-scrollbar">
                        <button 
                            onClick={() => setActiveTab('subscriptions')}
                            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'subscriptions' ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                        >
                            <Package className="w-5 h-5" /> Minhas Assinaturas
                        </button>
                        <button 
                            onClick={() => setActiveTab('consignment')}
                            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'consignment' ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                        >
                            <Database className="w-5 h-5" /> Consignação
                        </button>
                    </div>
                )}
"""

content = content.replace(main_tag, main_tag + tabs_html)

# Wrap the existing content in a conditional block
# From <div className="mb-8 flex flex-col to </main>
import re

# Find index of "{error ? (" to know where to start the body wrap. Actually, the easiest is to just wrap from <div className="mb-8 flex to {subscriptions.map
body_start = content.find('<div className="mb-8 flex flex-col sm:flex-row')
# We need to wrap everything until just before </main>
main_end = content.find('</main>')

existing_body = content[body_start:main_end]

wrapped_body = """
                {activeTab === 'subscriptions' && (
                    <>
""" + existing_body.replace('\n', '\n    ') + """
                    </>
                )}
                
                {activeTab === 'consignment' && (
                    <div className="h-[75vh]">
                        <HorusConsignmentManager 
                             apiBaseUrl="/me/consignment"
                             token={typeof window !== 'undefined' ? localStorage.getItem(`customer_token_${slug}`) || '' : ''}
                        />
                    </div>
                )}
"""

content = content[:body_start] + wrapped_body + content[main_end:]

with open("../frontend/src/app/h/[slug]/portal/page.tsx", "w") as f:
    f.write(content)
