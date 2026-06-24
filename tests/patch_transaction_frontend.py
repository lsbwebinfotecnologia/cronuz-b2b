import re

path = "frontend/src/app/(dashboard)/financial/transactions/[id]/page.tsx"
with open(path, "r") as f:
    content = f.read()

# 1. Imports
imp_s = "import { ArrowLeft, Clock, CheckCircle, Tag, TrendingUp, TrendingDown, DollarSign, Pencil, X, Save } from 'lucide-react';"
imp_r = "import { ArrowLeft, Clock, CheckCircle, Tag, TrendingUp, TrendingDown, DollarSign, Pencil, X, Save, FileText, QrCode, BookOpen } from 'lucide-react';"
content = content.replace(imp_s, imp_r)

# 2. Logic handleIssueInterSlip
if "handleIssueInterSlip" not in content:
    logic = """    const handleIssueInterSlip = async (instId: number) => {
        const loadingId = toast.loading("Emitindo boleto no Banco Inter...");
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${instId}/issue-inter-slip`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            if (res.ok) {
                toast.success("Boleto emitido com sucesso!", { id: loadingId });
                fetchDetails(); // Reload to get PDF URL
            } else {
                const err = await res.json();
                toast.error(err.detail || "Erro ao emitir boleto", { id: loadingId });
            }
        } catch (e: any) {
            toast.error(e.message || "Falha na comunicação", { id: loadingId });
        }
    };
"""
    s_logic = "    return ("
    content = content.replace(s_logic, logic + "\n" + s_logic)

# 3. JSX Buttons
jsx_s = """                                    {inst.status !== 'PAID' && inst.status !== 'CANCELLED' && (
                                        <button onClick={()=>{setInstData({due_date: new Date(inst.due_date).toISOString().split('T')[0], amount: inst.amount}); setEditingInst(inst);}} className="p-2 ml-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg transition shrink-0" title="Editar Valores da Parcela">
                                            <Pencil className="w-4 h-4"/>
                                        </button>
                                    )}
                                </div>"""
jsx_r = """                                    {inst.pdf_url ? (
                                        <a href={inst.pdf_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 ml-1 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/50 dark:hover:bg-orange-900/70 text-orange-700 dark:text-orange-400 rounded-lg transition shrink-0 flex items-center gap-1 font-bold text-xs border border-orange-200 dark:border-orange-800" title="Ver Boleto (Inter)">
                                            <FileText className="w-3.5 h-3.5"/> Boleto
                                        </a>
                                    ) : (
                                        inst.status !== 'PAID' && inst.status !== 'CANCELLED' && isReceivable && (
                                            <button onClick={() => window.confirm("Deseja emitir boleto pelo Banco Inter para esta parcela?") && handleIssueInterSlip(inst.id)} className="p-2 ml-1 bg-slate-100 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-orange-900/30 text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg transition shrink-0 border border-transparent hover:border-orange-200 dark:hover:border-orange-800/50" title="Gerar Boleto Banco Inter">
                                                <QrCode className="w-4 h-4"/>
                                            </button>
                                        )
                                    )}

                                    {inst.status !== 'PAID' && inst.status !== 'CANCELLED' && (
                                        <button onClick={()=>{setInstData({due_date: new Date(inst.due_date).toISOString().split('T')[0], amount: inst.amount}); setEditingInst(inst);}} className="p-2 ml-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg transition shrink-0" title="Editar Valores da Parcela">
                                            <Pencil className="w-4 h-4"/>
                                        </button>
                                    )}
                                </div>"""
content = content.replace(jsx_s, jsx_r)

with open(path, "w") as f:
    f.write(content)

print("Path applied to transaction details")
