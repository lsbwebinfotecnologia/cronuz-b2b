path = "frontend/src/app/(dashboard)/financial/transactions/[id]/page.tsx"
with open(path, "r") as f:
    content = f.read()

old_block = """                                    {inst.pdf_url ? (
                                        <a href={inst.pdf_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 ml-1 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/50 dark:hover:bg-orange-900/70 text-orange-700 dark:text-orange-400 rounded-lg transition shrink-0 flex items-center gap-1 font-bold text-xs border border-orange-200 dark:border-orange-800" title="Ver Boleto (Inter)">
                                            <FileText className="w-3.5 h-3.5"/> Boleto
                                        </a>
                                    ) : (
                                        inst.status !== 'PAID' && inst.status !== 'CANCELLED' && isReceivable && (
                                            <button onClick={() => window.confirm("Deseja emitir boleto pelo Banco Inter para esta parcela?") && handleIssueInterSlip(inst.id)} className="p-2 ml-1 bg-slate-100 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-orange-900/30 text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg transition shrink-0 border border-transparent hover:border-orange-200 dark:hover:border-orange-800/50" title="Gerar Boleto Banco Inter">
                                                <QrCode className="w-4 h-4"/>
                                            </button>
                                        )
                                    )}"""

new_block = """                                    {inst.pdf_url || inst.bank_slip_nosso_numero ? (
                                        <a href={inst.pdf_url || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${inst.id}/bank-slip-pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 ml-1 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/50 dark:hover:bg-orange-900/70 text-orange-700 dark:text-orange-400 rounded-lg transition shrink-0 flex items-center gap-1 font-bold text-xs border border-orange-200 dark:border-orange-800" title="Ver Boleto (Inter/PDF)">
                                            <FileText className="w-3.5 h-3.5"/> Boleto PDF
                                        </a>
                                    ) : (
                                        inst.status !== 'PAID' && inst.status !== 'CANCELLED' && isReceivable && (
                                            <button onClick={() => window.confirm("Deseja emitir boleto pelo Banco Inter para esta parcela?") && handleIssueInterSlip(inst.id)} className="p-2 ml-1 bg-slate-100 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-orange-900/30 text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg transition shrink-0 border border-transparent hover:border-orange-200 dark:hover:border-orange-800/50" title="Gerar Boleto Banco Inter">
                                                <QrCode className="w-4 h-4"/>
                                            </button>
                                        )
                                    )}"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(path, "w") as f:
        f.write(content)
    print("Patched transactions UI!")
else:
    print("Block not found!")
