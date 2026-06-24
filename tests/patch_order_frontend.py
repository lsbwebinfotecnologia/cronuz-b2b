import re

path = "frontend/src/app/(dashboard)/orders/[id]/page.tsx"
with open(path, "r") as f:
    content = f.read()

# 1. Imports
imp_s = "import { Package, ArrowLeft, Building2, User, FileText, Download, Truck, MessageSquare, Send, Check, CheckCheck, Terminal, X, RefreshCw, AlertCircle } from \"lucide-react\";"
imp_r = "import { Package, ArrowLeft, Building2, User, FileText, Download, Truck, MessageSquare, Send, Check, CheckCheck, Terminal, X, RefreshCw, AlertCircle, QrCode } from \"lucide-react\";\nimport { toast } from \"sonner\";"
if "QrCode" not in content:
    content = content.replace(imp_s, imp_r)

# 2. Logic handleIssueInterSlip
if "handleIssueInterSlip" not in content:
    logic = """    const handleIssueInterSlip = async () => {
        if (!order) return;
        const loadingId = toast.loading("Gerando Boleto Banco Inter...");
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/orders/${order.id}/issue-inter-slip`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Boleto emitido! Acesse o painel financeiro para visualizar o PDF.", { id: loadingId });
            } else {
                const data = await res.json();
                toast.error(data.detail || "Erro ao emitir boleto.", { id: loadingId });
            }
        } catch (e) {
            toast.error("Erro de conexão.", { id: loadingId });
        }
    };
"""
    s_logic = "    const handleDownloadInvoice = () => {"
    content = content.replace(s_logic, logic + "\n" + s_logic)

# 3. JSX Button
jsx_s = """                    {order.invoice_xml_available && (
                        <button"""
jsx_r = """                    <button
                        onClick={() => window.confirm("Emitir boleto para este pedido no Banco Inter?") && handleIssueInterSlip()}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/20"
                    >
                        <QrCode className="w-4 h-4" />
                        Boleto Inter
                    </button>

                    {order.invoice_xml_available && (
                        <button"""
content = content.replace(jsx_s, jsx_r)

with open(path, "w") as f:
    f.write(content)

print("Patch applied to orders")
