"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle, ShoppingBag, CreditCard, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function HotsiteCheckoutPage() {
    const params = useParams();
    const slug = params.slug as string;
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [planData, setPlanData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    
    // UI states
    const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');
    const [successData, setSuccessData] = useState<any>(null);
    
    const [formData, setFormData] = useState({
        customer_name: '',
        customer_document: '',
        email: '',
        phone: '',
        shipping_zip_code: '',
        shipping_street: '',
        shipping_number: '',
        shipping_complement: '',
        shipping_neighborhood: '',
        shipping_city: '',
        shipping_state: ''
    });

    const [ccData, setCcData] = useState({
        number: '',
        name: '',
        expiry: '',
        cvv: ''
    });

    useEffect(() => {
        const fetchPlan = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const response = await fetch(`${apiUrl}/subscriptions/hotsite/${slug}`);
                
                if (response.ok) {
                    const data = await response.json();
                    setPlanData(data);
                } else if (response.status === 404) {
                    setError("Página não encontrada ou assinatura suspensa.");
                } else {
                    setError("Ocorreu um erro ao carregar o hotsite.");
                }
            } catch (err) {
                setError("Falha de conexão.");
            } finally {
                setLoading(false);
            }
        };
        fetchPlan();
    }, [slug]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let { name, value } = e.target;
        
        // Auto-fetch CEP
        if (name === 'shipping_zip_code') {
            value = value.replace(/\D/g, '');
            if (value.length <= 8) {
                // Formatting
                if (value.length > 5) {
                    value = value.replace(/^(\d{5})(\d)/, '$1-$2');
                }
                if (value.replace(/\D/g, '').length === 8) {
                    fetchAddressByCep(value.replace(/\D/g, ''));
                }
            }
        }
        
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const fetchAddressByCep = async (cepStr: string) => {
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cepStr}/json/`);
            if (response.ok) {
                const data = await response.json();
                if (!data.erro) {
                    setFormData(prev => ({
                        ...prev,
                        shipping_street: data.logradouro || prev.shipping_street,
                        shipping_neighborhood: data.bairro || prev.shipping_neighborhood,
                        shipping_city: data.localidade || prev.shipping_city,
                        shipping_state: data.uf || prev.shipping_state,
                    }));
                }
            }
        } catch (e) {
            console.error("Erro ao buscar CEP", e);
        }
    };

    const handleCcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCcData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const payload = { ...formData, payment_method: paymentMethod };

            const response = await fetch(`${apiUrl}/subscriptions/hotsite/${slug}/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                if (paymentMethod === 'PIX') {
                    toast.success("Reserva realizada! Efetue o pagamento PIX para confirmar.");
                } else {
                    toast.success("Assinatura confirmada com sucesso!");
                }
                setSuccessData(data.payment);
            } else {
                toast.error(data.detail || "Erro ao processar a assinatura.");
            }
        } catch (err) {
            toast.error("Erro de comunicação com o servidor.");
        } finally {
            setSubmitting(false);
        }
    };
    
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Código PIX copiado!");
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary-base)]" />
            </div>
        );
    }

    if (error || !planData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
                <div className="text-center max-w-md w-full p-8 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-16 h-16 mx-auto bg-rose-50 rounded-full flex items-center justify-center mb-6">
                        <AlertCircle className="h-8 w-8 text-rose-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Ops! Algo deu errado</h1>
                    <p className="text-slate-500">{error}</p>
                </div>
            </div>
        );
    }
    
    const isSoldOut = planData.status.is_sold_out;

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-[var(--color-primary-base)] selection:text-white pb-20">
            {/* Header Mini */}
            <div className="bg-white border-b border-slate-200 py-4">
                <div className="max-w-5xl mx-auto px-6 flex justify-between items-center">
                    <Link href={`/h/${slug}`} className="text-slate-500 hover:text-slate-900 font-semibold text-sm transition-colors">
                        ← Voltar para apresentação
                    </Link>
                    <div className="flex items-center gap-2 text-slate-900 font-bold">
                        <ShoppingBag className="h-5 w-5 text-[var(--color-primary-base)]" />
                        Ambiente Seguro
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 mt-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* Left Col: Order Summary */}
                    <div className="lg:col-span-4 lg:sticky lg:top-8 space-y-6">
                        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/40 border border-slate-100">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Resumo da Assinatura</h2>
                            
                            <div className="flex gap-4 items-center mb-6">
                                <div className="h-16 w-16 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 border border-slate-200">
                                    <ShoppingBag className="h-6 w-6 text-slate-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 leading-tight">{planData.name}</h3>
                                    <p className="text-xs text-slate-500 mt-1">{planData.pricing.issues_per_delivery} fascículos mensais</p>
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-slate-100 text-sm">
                                <div className="flex justify-between text-slate-600">
                                    <span>Preço dos Fascículos</span>
                                    <span>R$ {planData.pricing.first_delivery.full_price.toFixed(2).replace('.', ',')}</span>
                                </div>
                                {planData.pricing.first_delivery.discount_percent > 0 && (
                                    <div className="flex justify-between text-emerald-600 font-medium">
                                        <span>Desconto ({planData.status.current_phase})</span>
                                        <span>- R$ {planData.pricing.first_delivery.discount_amount.toFixed(2).replace('.', ',')}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-slate-600">
                                    <span>Frete</span>
                                    <span className="text-emerald-600 font-medium">Grátis</span>
                                </div>
                            </div>

                            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
                                <span className="font-bold text-slate-900">Total Hoje</span>
                                <span className="text-2xl font-black text-[var(--color-primary-base)]">
                                    R$ {planData.pricing.first_delivery.final_price.toFixed(2).replace('.', ',')}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Col: Checkout Form */}
                    <div className="lg:col-span-8">
                        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-xl shadow-slate-200/40 border border-slate-100">
                            
                            {successData ? (
                                /* SUCCESS STATE */
                                <div className="text-center animate-in fade-in zoom-in duration-300 py-8">
                                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-900 mb-2">
                                        {successData.method === 'PIX' ? 'Reserva Garantida!' : 'Pagamento Aprovado!'}
                                    </h3>
                                    <p className="text-slate-600 mb-8 max-w-md mx-auto">
                                        {successData.method === 'PIX' 
                                            ? `Para finalizar e garantir sua vaga, efetue o pagamento PIX no valor de R$ ${successData.amount.toFixed(2).replace('.', ',')}.`
                                            : `Sua assinatura foi confirmada com sucesso em seu cartão de crédito. Você receberá um e-mail com os detalhes em breve.`
                                        }
                                    </p>
                                    
                                    {successData.method === 'PIX' && (
                                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 max-w-sm mx-auto">
                                            {successData.qrcode_image ? (
                                                 <img src={successData.qrcode_image} alt="PIX QR Code" className="w-56 h-56 mx-auto mb-6" />
                                            ) : (
                                                <div className="w-48 h-48 mx-auto bg-slate-100 rounded-xl flex items-center justify-center text-xs text-slate-400 mb-6">Sem Imagem QR</div>
                                            )}
                                            
                                            <div className="text-left space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Copia e Cola</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        readOnly 
                                                        value={successData.qrcode_string || "00020126...MOCK"} 
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-3 text-slate-700 outline-none" 
                                                    />
                                                    <button 
                                                        onClick={() => copyToClipboard(successData.qrcode_string || "00020126...MOCK")}
                                                        className="bg-slate-900 text-white rounded-xl px-4 py-3 text-sm font-bold hover:bg-slate-800 transition-colors"
                                                    >
                                                        Copiar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-xs text-slate-400 mt-8">Transação: {successData.txid}</p>
                                </div>
                            ) : (
                                /* FORM STATE */
                                <form onSubmit={handleSubscribe}>
                                    <div className="mb-10">
                                        <h3 className="text-xl font-bold text-slate-900 mb-6">1. Seus Dados Pessoais</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-sm font-bold text-slate-700">Nome Completo</label>
                                                <input type="text" name="customer_name" required value={formData.customer_name} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="João da Silva" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-bold text-slate-700">CPF do Titular</label>
                                                <input type="text" name="customer_document" required value={formData.customer_document} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="000.000.000-00" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-sm font-bold text-slate-700">Telefone / WhatsApp</label>
                                                <input type="text" name="phone" required value={formData.phone} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="(11) 90000-0000" />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-sm font-bold text-slate-700">E-mail</label>
                                                <input type="email" name="email" required value={formData.email} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="seu@email.com" />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="mb-10">
                                        <h3 className="text-xl font-bold text-slate-900 mb-6">2. Endereço de Entrega</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="space-y-1.5 md:col-span-1">
                                                <label className="text-sm font-bold text-slate-700">CEP</label>
                                                <input type="text" name="shipping_zip_code" required value={formData.shipping_zip_code} onChange={handleFormChange} maxLength={9} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="00000-000" />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-3">
                                                <label className="text-sm font-bold text-slate-700">Endereço</label>
                                                <input type="text" name="shipping_street" required value={formData.shipping_street} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="Rua, Avenida, etc" />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-1">
                                                <label className="text-sm font-bold text-slate-700">Número</label>
                                                <input type="text" name="shipping_number" required value={formData.shipping_number} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-1">
                                                <label className="text-sm font-bold text-slate-700">Complemento</label>
                                                <input type="text" name="shipping_complement" value={formData.shipping_complement} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="Apto, Bloco" />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-sm font-bold text-slate-700">Bairro</label>
                                                <input type="text" name="shipping_neighborhood" required value={formData.shipping_neighborhood} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-3">
                                                <label className="text-sm font-bold text-slate-700">Cidade</label>
                                                <input type="text" name="shipping_city" required value={formData.shipping_city} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" />
                                            </div>
                                            <div className="space-y-1.5 md:col-span-1">
                                                <label className="text-sm font-bold text-slate-700">Estado</label>
                                                <input type="text" name="shipping_state" required value={formData.shipping_state} onChange={handleFormChange} maxLength={2} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 uppercase focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="SP" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mb-8">
                                        <h3 className="text-xl font-bold text-slate-900 mb-4">3. Método de Pagamento</h3>
                                        
                                        <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl mb-8">
                                            <button 
                                                type="button"
                                                onClick={() => setPaymentMethod('PIX')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${paymentMethod === 'PIX' ? 'bg-white text-[var(--color-primary-base)] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                            >
                                                <QrCode className="h-4 w-4" />
                                                PIX
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setPaymentMethod('CREDIT_CARD')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${paymentMethod === 'CREDIT_CARD' ? 'bg-white text-[var(--color-primary-base)] shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                                            >
                                                <CreditCard className="h-4 w-4" />
                                                Cartão de Crédito
                                            </button>
                                        </div>

                                        {paymentMethod === 'PIX' ? (
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                                                <QrCode className="h-10 w-10 text-emerald-600 mx-auto mb-3 opacity-80" />
                                                <p className="text-emerald-800 font-medium mb-1">Aprovação Imediata Secura</p>
                                                <p className="text-sm text-emerald-600/80">O código PIX será gerado na próxima tela após você clicar em Finalizar.</p>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 animate-in fade-in duration-300">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5 col-span-2">
                                                        <label className="text-sm font-bold text-slate-700">Número do Cartão</label>
                                                        <input type="text" name="number" required value={ccData.number} onChange={handleCcChange} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="0000 0000 0000 0000" />
                                                    </div>
                                                    <div className="space-y-1.5 col-span-2">
                                                        <label className="text-sm font-bold text-slate-700">Nome no Cartão</label>
                                                        <input type="text" name="name" required value={ccData.name} onChange={handleCcChange} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="Como impresso no cartão" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-bold text-slate-700">Validade</label>
                                                        <input type="text" name="expiry" required value={ccData.expiry} onChange={handleCcChange} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="MM/AA" />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-bold text-slate-700">CVV</label>
                                                        <input type="text" name="cvv" required value={ccData.cvv} onChange={handleCcChange} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="123" />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="pt-4 border-t border-slate-100">
                                        <button
                                            type="submit"
                                            disabled={isSoldOut || submitting}
                                            className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[var(--color-primary-base)]/30 disabled:opacity-50 disabled:pointer-events-none"
                                        >
                                            {submitting ? (
                                                <Loader2 className="h-6 w-6 animate-spin" />
                                            ) : isSoldOut ? (
                                                "ESGOTADO"
                                            ) : (
                                                `Finalizar Assinatura`
                                            )}
                                        </button>
                                        
                                        <p className="text-xs text-center text-slate-500 mt-4 leading-relaxed max-w-sm mx-auto">
                                            Ao finalizar, você concorda com os termos de assinatura recorrente e cobranças padrão ativadas.
                                        </p>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
