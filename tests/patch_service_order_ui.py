import os

path = "frontend/src/app/(dashboard)/services/orders/[id]/page.tsx"
if not os.path.exists(path):
    print("Service orders detail page not found.")
    exit()

with open(path, "r") as f:
    content = f.read()

# Imports
imp_s = "import { ArrowLeft, CheckCircle, Clock, AlertCircle, RefreshCw, Car, FileText, Calendar, Building2, User } from 'lucide-react';"
imp_r = "import { ArrowLeft, CheckCircle, Clock, AlertCircle, RefreshCw, Car, FileText, Calendar, Building2, User, QrCode } from 'lucide-react';\nimport { toast } from 'sonner';"
if "QrCode" not in content and "lucide-react" in content:
    if imp_s in content:
        content = content.replace(imp_s, imp_r)
    else:
        content = content.replace("from 'lucide-react';", ", QrCode } from 'lucide-react';\nimport { toast } from 'sonner';")

# Logic
if "handleIssueInterSlip" not in content:
    logic = """    const handleIssueInterSlip = async () => {
        if (!order) return;
        const loadingId = toast.loading("Gerando Boleto Banco Inter...");
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/service-orders/${order.id}/issue-inter-slip`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Boleto emitido! Acesse o painel financeiro para visualizar.", { id: loadingId });
            } else {
                const data = await res.json();
                toast.error(data.detail || "Erro ao emitir boleto.", { id: loadingId });
            }
        } catch (e) {
            toast.error("Erro de conexão.", { id: loadingId });
        }
    };
"""
    # Find a good place to inject the logic
    s_logic = "    const handleAddMaterial = async (e: React.FormEvent) => {"
    if s_logic in content:
        content = content.replace(s_logic, logic + "\n" + s_logic)
    else:
        content = content.replace("    return (", logic + "\n    return (")

# JSX Button
# Searching for a button rendering place in the header actions
jsx_s = """                <div className="flex items-center gap-3">
                    {order.status === 'NEW' && ("""
if jsx_s in content and "Boleto Inter" not in content:
    jsx_r = """                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.confirm("Emitir boleto para esta O.S no Banco Inter?") && handleIssueInterSlip()}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/20"
                    >
                        <QrCode className="w-4 h-4" />
                        Boleto Inter
                    </button>
                    {order.status === 'NEW' && ("""
    content = content.replace(jsx_s, jsx_r)
else:
    # Alternative replace
    jsx_s2 = """                    {order.status === 'FINISHED' && order.invoice_number && ("""
    if jsx_s2 in content and "Boleto Inter" not in content:
        jsx_r2 = """                    <button
                            onClick={() => window.confirm("Emitir boleto para esta O.S no Banco Inter?") && handleIssueInterSlip()}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/20 mr-2"
                        >
                            <QrCode className="w-4 h-4" />
                            Boleto Inter
                        </button>
                        
                    {order.status === 'FINISHED' && order.invoice_number && ("""
        content = content.replace(jsx_s2, jsx_r2)

with open(path, "w") as f:
    f.write(content)

print("Patch applied to OS")
