"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle, ShoppingBag, CreditCard, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

const getCardBrand = (number: string) => {
    if (/^4/.test(number)) return 'visa';
    if (/^5[1-5]/.test(number)) return 'mastercard';
    if (/^3[47]/.test(number)) return 'amex';
    if (/^6(?:011|5)/.test(number)) return 'discover';
    if (/^3[68]/.test(number)) return 'diners';
    if (/^35/.test(number)) return 'jcb';
    if (/^(606282|384100|384140|384160)/.test(number)) return 'hipercard';
    if (/^(5067|5090|4576|4011|4389|4514|5041|5094|6362|6363|6277|6500|6504|6505|6507|6509|6516|6550|6582|6583|6584|6585|6586|6587|6588|6589|6590|6591|6592|6593|6594|6595|6596|6597|6598|6599|6592|6593|6594|6595|6596|6597|6598|6599)/.test(number)) return 'elo';
    return 'visa'; // Fallback
};

export default function HotsiteCheckoutPage() {
    const params = useParams();
    const slug = params.slug as string;
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [planData, setPlanData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    
    // UI states
    const [paymentMethod, setPaymentMethod] = useState<'CREDIT_CARD'>('CREDIT_CARD');
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

    // EFI Tokenization Script Injection
    useEffect(() => {
        if (!planData || !planData.efi_settings?.payee_code) return;
        
        const payeeCode = planData.efi_settings.payee_code;
        const isSandbox = planData.efi_settings.sandbox;
        const envUrl = isSandbox ? 'https://sandbox.gerencianet.com.br/v1/cdn/' : 'https://api.gerencianet.com.br/v1/cdn/';
        
        // Define $gn variable as expected by the Gerencianet script BEFORE loading it
        if (!(window as any).$gn) {
            (window as any).$gn = {
                validForm: true,
                sign: true, // MUST be true for the tokenizer to initialize properly
                prefix: ''
            };
        }

        const scriptId = `efi-${payeeCode}`;
        if (!document.getElementById(scriptId)) {
            const s = document.createElement('script');
            s.type = 'text/javascript';
            const v = parseInt((Math.random() * 1000000).toString());
            s.src = `${envUrl}${payeeCode}/${v}`;
            s.async = false;
            s.id = scriptId;
            document.head.appendChild(s);
        }
        
    }, [planData]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let { name, value } = e.target;
        
        // Masks
        if (name === 'customer_document') {
            value = value.replace(/\D/g, '');
            if (value.length <= 11) {
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            } else {
                value = value.substring(0, 14);
                value = value.replace(/^(\d{2})(\d)/, '$1.$2');
                value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
                value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
                value = value.replace(/(\d{4})(\d)/, '$1-$2');
            }
        }
        
        if (name === 'phone') {
            value = value.replace(/\D/g, '');
            value = value.substring(0, 11);
            value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
            value = value.replace(/(\d)(\d{4})$/, '$1-$2');
        }

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
        let { name, value } = e.target;
        
        if (name === 'number') value = value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
        if (name === 'expiry') {
            value = value.replace(/\D/g, '');
            if (value.length > 2) value = value.replace(/^(\d{2})(\d)/, '$1/$2').substring(0, 5);
        }
        if (name === 'cvv') value = value.replace(/\D/g, '').substring(0, 4);

        setCcData(prev => ({ ...prev, [name]: value }));
    };

    const validateCPF = (cpf: string) => {
        if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
        let sum = 0, rest;
        for (let i = 1; i <= 9; i++) sum = sum + parseInt(cpf.substring(i-1, i)) * (11 - i);
        rest = (sum * 10) % 11;
        if ((rest === 10) || (rest === 11)) rest = 0;
        if (rest !== parseInt(cpf.substring(9, 10))) return false;
        sum = 0;
        for (let i = 1; i <= 10; i++) sum = sum + parseInt(cpf.substring(i-1, i)) * (12 - i);
        rest = (sum * 10) % 11;
        if ((rest === 10) || (rest === 11)) rest = 0;
        if (rest !== parseInt(cpf.substring(10, 11))) return false;
        return true;
    };

    const validateCNPJ = (cnpj: string) => {
        if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
        let size = cnpj.length - 2
        let numbers = cnpj.substring(0, size);
        const digits = cnpj.substring(size);
        let sum = 0;
        let pos = size - 7;
        for (let i = size; i >= 1; i--) {
            sum += parseInt(numbers.charAt(size - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        let result = sum % 11 < 2 ? 0 : 11 - sum % 11;
        if (result !== parseInt(digits.charAt(0))) return false;
        size = size + 1;
        numbers = cnpj.substring(0, size);
        sum = 0;
        pos = size - 7;
        for (let i = size; i >= 1; i--) {
            sum += parseInt(numbers.charAt(size - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        result = sum % 11 < 2 ? 0 : 11 - sum % 11;
        if (result !== parseInt(digits.charAt(1))) return false;
        return true;
    };

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        
        const docRaw = formData.customer_document.replace(/\D/g, '');
        if (docRaw.length === 11 && !validateCPF(docRaw)) {
            toast.error("O CPF informado é inválido.");
            setSubmitting(false);
            return;
        }
        if (docRaw.length === 14 && !validateCNPJ(docRaw)) {
            toast.error("O CNPJ informado é inválido.");
            setSubmitting(false);
            return;
        }
        if (docRaw.length !== 11 && docRaw.length !== 14) {
            toast.error("Documento inválido. Informe CPF ou CNPJ com a quantidade correta de dígitos.");
            setSubmitting(false);
            return;
        }
        
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            
            // Get Payment Token using Gerencianet JS
            let paymentToken = '';
            const [expMonth, expYear] = ccData.expiry.split('/');
            if (!expMonth || !expYear) throw new Error("Preencha a validade do cartão (MM/AA).");
            
            const rawNumber = ccData.number.replace(/\D/g, '');
            const brand = getCardBrand(rawNumber);

            const gnParams = {
                brand: brand,
                number: rawNumber,
                cvv: ccData.cvv,
                expiration_month: expMonth,
                expiration_year: expYear.length === 2 ? `20${expYear}` : expYear
            };

            try {
                const tokenData: any = await new Promise((resolve, reject) => {
                    const gn = (window as any).$gn;
                    if (!gn || !gn.ready) {
                        return reject(new Error("Script de pagamento seguro (EFI) ainda não carregado ou não configurado corretamente."));
                    }
                    gn.ready((checkout: any) => {
                        checkout.getPaymentToken(gnParams, (error: any, response: any) => {
                            if (error) {
                                console.error("Erro Efi:", error);
                                reject(new Error(error.error_description || "Cartão inválido ou falha na tokenização EFI."));
                            } else {
                                resolve(response);
                            }
                        });
                    });
                });
                paymentToken = tokenData.data.payment_token;
            } catch (efiErr: any) {
                toast.error(efiErr.message || "Erro ao processar dados do cartão.");
                setSubmitting(false);
                return;
            }

            const payload = { 
                ...formData, 
                payment_method: paymentMethod,
                payment_token: paymentToken // Added token
            };

            const response = await fetch(`${apiUrl}/subscriptions/hotsite/${slug}/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                toast.success("Assinatura confirmada com sucesso!");
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
                                        Assinatura Aprovada!
                                    </h3>
                                    <p className="text-slate-600 mb-8 max-w-md mx-auto">
                                        Sua assinatura recorrente foi processada com sucesso em seu cartão de crédito. Você receberá um e-mail com os detalhes em breve e já conta a partir de agora com o seu pacote de fascículos!
                                    </p>

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
                                                <label className="text-sm font-bold text-slate-700">CPF ou CNPJ</label>
                                                <input type="text" name="customer_document" required value={formData.customer_document} onChange={handleFormChange} disabled={isSoldOut || submitting} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] transition-colors text-sm" placeholder="000.000.000-00 ou CNPJ" />
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
                                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all bg-white text-[var(--color-primary-base)] shadow-sm cursor-default`}
                                            >
                                                <CreditCard className="h-4 w-4" />
                                                Cartão de Crédito (Recorrente)
                                            </button>
                                        </div>

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
