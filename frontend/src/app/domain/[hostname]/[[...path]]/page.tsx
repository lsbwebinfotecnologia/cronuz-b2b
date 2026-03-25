"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, AlertCircle, ArrowRight, BookOpen } from 'lucide-react';
import Link from 'next/link';
import 'react-quill-new/dist/quill.snow.css';

export default function DomainRouter() {
    const params = useParams();
    const hostname = params.hostname as string;
    const path = params.path as string[] | undefined;
    
    // Route: /domain/[hostname]/h/[slug]
    if (path && path.length >= 2 && path[0] === 'h') {
        return <HotsitePage slug={path[1]} hostname={hostname} />;
    }
    
    // Route: /domain/[hostname]
    return <StorefrontHub hostname={hostname} />;
}

// ============== Storefront Hub Component ==============
function StorefrontHub({ hostname }: { hostname: string }) {
    const [loading, setLoading] = useState(true);
    const [hubData, setHubData] = useState<any>(null);
    const [domainInfo, setDomainInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHub = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                
                // 1. Resolve host to company_id
                const domainResponse = await fetch(`${apiUrl}/storefront/domain/${hostname}`);
                if (!domainResponse.ok) {
                    setError("Domínio não configurado.");
                    setLoading(false);
                    return;
                }
                const domainData = await domainResponse.json();
                setDomainInfo(domainData);
                
                // 2. Fetch all active subscriptions (Storefront Hub API)
                const hubResponse = await fetch(`${apiUrl}/subscriptions/hub/${domainData.company_id}`);
                
                if (hubResponse.ok) {
                    const data = await hubResponse.json();
                    setHubData(data);
                } else {
                    setError("Ocorreu um erro ao carregar o catálogo de empresa.");
                }
            } catch (err) {
                setError("Falha de conexão.");
            } finally {
                setLoading(false);
            }
        };
        fetchHub();
    }, [hostname]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="h-10 w-10 animate-spin text-slate-800" />
            </div>
        );
    }

    if (error || !hubData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
                <div className="text-center max-w-md w-full p-8 bg-white rounded-3xl shadow-xl border border-slate-100">
                    <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Ops!</h1>
                    <p className="text-slate-500">{error}</p>
                </div>
            </div>
        );
    }

    const isMythos = domainInfo?.domain?.includes('mythos') || domainInfo?.custom_domain?.includes('mythos');
    const isHorus = hostname.includes('horus') || domainInfo?.custom_domain?.includes('horus');

    const t = {
        bg: isHorus ? 'bg-violet-600' : 'bg-[#00d0b0]',
        hover: isHorus ? 'hover:bg-violet-700' : 'hover:bg-[#00b095]',
        text: isHorus ? 'text-violet-600' : 'text-[#00d0b0]',
        lightBg: isHorus ? 'bg-violet-50' : 'bg-teal-50',
        gradStart: isHorus ? 'from-slate-900' : 'from-slate-900',
        gradVia: isHorus ? 'via-violet-950' : 'via-teal-950',
        gradEnd: isHorus ? 'to-slate-900' : 'to-slate-900',
        accent: isHorus ? 'text-violet-400' : 'text-[#00d0b0]',
        border: isHorus ? 'border-violet-100' : 'border-teal-100',
        ring: isHorus ? 'ring-violet-500/20' : 'ring-teal-500/20'
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
            {/* Elegant Hub Navbar */}
            <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    {hubData.logo_url || domainInfo?.logo ? (
                        <img src={hubData.logo_url || domainInfo?.logo} alt={domainInfo?.name || hubData.company_name} className="h-12 object-contain" />
                    ) : (
                        <div className="flex items-center gap-3">
                            <BookOpen className={`h-8 w-8 ${t.text}`} />
                            <span className="text-2xl font-black text-slate-900 tracking-tight">
                                {domainInfo?.name || hubData.company_name}
                            </span>
                        </div>
                    )}
                    
                    {!isMythos && (
                        <Link href="/login" className={`hidden md:inline-flex ${t.bg} ${t.hover} text-white font-bold py-2.5 px-6 rounded-lg transition-colors shadow flex items-center gap-2`}>
                            Acessar Portal <ArrowRight className="h-4 w-4" />
                        </Link>
                    )}
                </div>
            </header>

            <main className="flex-1 pb-24">
                {/* Hero Banner Section */}
                <div className={`relative bg-gradient-to-br ${t.gradStart} ${t.gradVia} ${t.gradEnd} text-white min-h-[50vh] flex flex-col items-center justify-center text-center overflow-hidden mb-16 shadow-inner`}>
                    <div className="absolute inset-0 bg-[#0f172a] mix-blend-multiply opacity-60 z-10"></div>
                    {(hubData.banner_url || domainInfo?.login_background_url) && (
                        <div className="absolute inset-0 z-0">
                            <img src={hubData.banner_url || domainInfo?.login_background_url} alt="Banner" className="w-full h-full object-cover opacity-40 mix-blend-overlay" />
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-50 to-transparent z-10"></div>
                    
                    <div className="relative z-20 max-w-4xl px-6 pt-16 pb-16">
                        {isMythos ? (
                            <>
                                <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-sm text-center">
                                    Assinaturas e <span className={`${t.accent} font-serif italic font-medium`}>Coleções</span>
                                </h1>
                                <p className="text-xl text-slate-300 font-light mx-auto max-w-2xl text-center">
                                    Escolha o plano ideal para você e receba conteúdo exclusivo diretamente na sua casa com todo conforto e segurança.
                                </p>
                            </>
                        ) : (
                            <>
                                <span className={`inline-block py-1 px-3 rounded-full ${t.lightBg} text-slate-900 text-sm font-semibold tracking-wider mb-6 shadow-sm`}>
                                   Autoatendimento Corporativo
                                </span>
                                <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight drop-shadow-md text-center">
                                    Portal B2B <span className={`${t.accent} block mt-2`}>{domainInfo?.name || hubData?.company_name}</span>
                                </h1>
                                <p className="text-lg md:text-xl text-slate-200 font-light mx-auto max-w-2xl text-center mb-10 leading-relaxed shadow-sm">
                                    Acesse sua plataforma integrada projetada para impulsionar suas compras corporativas com autonomia, segurança e agilidade.
                                </p>
                                <Link href="/login" className={`inline-flex ${t.bg} ${t.hover} text-white font-bold py-4 px-10 rounded-xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 items-center gap-3 text-lg group ring-4 ${t.ring}`}>
                                    Fazer Login <ArrowRight className="h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                {/* Features Grid layout (Only for B2B) */}
                {!isMythos && (
                    <div className="max-w-7xl mx-auto px-6 -mt-8 relative z-20">
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { title: 'Estoque em Tempo Real', desc: 'Consulte a disponibilidade de produtos, lançamentos e campanhas.', icon: '📦' },
                                { title: 'Orçamentos Rápidos', desc: 'Crie, edite e efetive orçamentos e pedidos com total autonomia.', icon: '🛒' },
                                { title: 'Faturas e Boletos', desc: 'Acesse a 2ª via de seus boletos financeiros e notas fiscais a qualquer momento.', icon: '🧾' },
                                { title: 'Consignações', desc: 'Verifique produtos em consignação, acertos e faturamento de saldos.', icon: '🔄' },
                            ].map((feat, idx) => (
                                <div key={idx} className="bg-white rounded-2xl p-6 shadow-xl shadow-slate-200/40 border border-slate-100 hover:-translate-y-1 transition-transform duration-300">
                                    <div className={`w-12 h-12 rounded-xl ${t.lightBg} flex items-center justify-center text-2xl mb-4 shadow-inner ${t.border} border`}>
                                        {feat.icon}
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-2">{feat.title}</h3>
                                    <p className="text-slate-500 text-sm leading-relaxed">{feat.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Plans Grid layout (Only for Mythos) */}
                {isMythos && (
                    <div className="max-w-7xl mx-auto px-6">
                        {hubData.plans?.length > 0 ? (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {hubData.plans.map((plan: any) => (
                                    <div key={plan.id} className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 group border border-slate-100 flex flex-col h-full hover:-translate-y-2">
                                        <div className="aspect-[16/10] bg-slate-100 relative overflow-hidden">
                                            {plan.cover_image ? (
                                                <img src={plan.cover_image} alt={plan.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-50"><BookOpen className="h-10 w-10 text-slate-300"/></div>
                                            )}
                                            <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-4 py-1.5 rounded-full text-[11px] font-black tracking-widest text-slate-900 shadow-sm border border-slate-100">
                                                {plan.payment_frequency === 'MONTHLY' ? 'MENSAL' : 
                                                 plan.payment_frequency === 'YEARLY' ? 'ANUAL' : 
                                                 plan.payment_frequency === 'QUARTERLY' ? 'TRIMESTRAL' : 'ASSINATURA'}
                                            </div>
                                        </div>
                                        <div className="p-6 flex flex-col flex-1">
                                            <h3 className="text-2xl font-black text-slate-900 mb-2">{plan.name}</h3>
                                            <p className="text-slate-500 line-clamp-2 mb-6 text-sm flex-1 leading-relaxed">{plan.description}</p>
                                            
                                            <div className="flex items-end justify-between mt-auto pt-5 border-t border-slate-100">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">A partir de</p>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-lg font-bold text-slate-900">R$</span>
                                                        <span className="text-3xl font-black text-slate-900 leading-none">
                                                            {plan.price_per_issue?.toFixed(2).replace('.', ',')}
                                                        </span>
                                                        <span className="text-sm text-slate-500 font-medium ml-1">/{plan.payment_frequency === 'MONTHLY' ? 'mês' : 'ciclo'}</span>
                                                    </div>
                                                </div>
                                                
                                                <Link href={`/h/${plan.hotsite_slug}`} className={`${t.bg} ${t.hover} text-white p-3.5 rounded-xl transition-all shadow-md hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95 group-hover:${t.bg}`}>
                                                    <ArrowRight className="h-6 w-6" />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm border-2">
                                <BookOpen className="h-12 w-12 mx-auto text-slate-300 mb-6" />
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Nenhum plano disponível</h3>
                                <p className="text-slate-500">Esta empresa ainda não possui assinaturas ativas no catálogo.</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
            
            <footer className="bg-slate-950 py-12 text-center text-slate-500 border-t border-slate-800 flex-shrink-0">
                <p>&copy; {new Date().getFullYear()} {domainInfo?.name || hubData.company_name}. Todos os direitos reservados.</p>
            </footer>
        </div>
    );
}

// ============== Hotsite Detail Component ==============
function HotsitePage({ slug, hostname }: { slug: string, hostname: string }) {
    const [loading, setLoading] = useState(true);
    const [planData, setPlanData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPlan = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                
                const hotsiteResponse = await fetch(`${apiUrl}/subscriptions/hotsite/${slug}`);
                if (hotsiteResponse.ok) {
                    const data = await hotsiteResponse.json();
                    setPlanData(data);
                } else if (hotsiteResponse.status === 404) {
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
                    <Link href={`/`} className="mt-8 inline-block text-indigo-600 font-bold hover:underline">
                        Voltar para a Loja
                    </Link>
                </div>
            </div>
        );
    }
    
    const rawConfig = planData.config || {};
    
    // Normalize config
    const globalConfig = rawConfig.global || {
        logoUrl: '',
        primaryColor: rawConfig.primaryColor || '#dc2626',
        topMenu: []
    };
    
    let blocks = rawConfig.blocks || [];
    
    if (!rawConfig.global && !rawConfig.blocks && rawConfig.heroImage) {
        blocks.push({
            id: 'legacy-hero',
            type: 'BANNER',
            imageUrl: rawConfig.heroImage,
            title: planData.name,
            subtitle: planData.description
        });
    }

    const primaryColor = globalConfig.primaryColor;

    const renderBlock = (block: any, index: number) => {
        switch(block.type) {
            case 'BANNER':
                return (
                    <div id={block.id} key={block.id} className="relative bg-slate-950 text-white min-h-[70vh] flex items-center overflow-hidden" style={block.backgroundColor ? { backgroundColor: block.backgroundColor } : undefined}>
                        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] mix-blend-overlay"></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent"></div>
                        
                        {block.imageUrl && (
                            <div className="absolute inset-0 z-0">
                                <img src={block.imageUrl} alt={block.title || "Banner"} className="w-full h-full object-cover opacity-50" />
                            </div>
                        )}
                        
                        <div className="max-w-7xl mx-auto px-6 relative z-10 w-full pt-32 pb-20">
                            <div className="max-w-2xl space-y-6">
                                {block.title && (
                                    <h1 className="text-5xl lg:text-7xl font-black tracking-tight leading-[1.1] text-white uppercase italic transform -skew-x-6">
                                        {block.title}
                                    </h1>
                                )}
                                {block.subtitle && (
                                    <p className="text-xl lg:text-3xl text-slate-300 font-bold uppercase tracking-wide">
                                        {block.subtitle}
                                    </p>
                                )}
                                <div className="pt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    <Link href={`/h/${planData.id}/checkout`} className="inline-flex items-center justify-center gap-3 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold px-10 py-5 rounded-lg text-xl uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-[var(--color-primary-base)]/40 border-b-4 border-black/30">
                                        Assinar Agora
                                        <ArrowRight className="h-6 w-6" />
                                    </Link>
                                    <Link href="/" className="inline-flex items-center justify-center gap-3 bg-white/10 hover:bg-white/20 text-white font-bold px-8 py-5 rounded-lg text-lg uppercase tracking-wider transition-all backdrop-blur-md">
                                        Explorar Loja
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                );
                
            case 'TEXT_IMAGE': {
                const isLeft = block.layout !== 'image_right';
                return (
                    <div id={block.id} key={block.id} className="py-24 bg-zinc-950 text-white border-y border-white/5 relative overflow-hidden" style={block.backgroundColor ? { backgroundColor: block.backgroundColor } : undefined}>
                        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[var(--color-primary-base)]/5 to-transparent skew-x-12 blur-3xl"></div>
                        <div className="max-w-7xl mx-auto px-6 relative z-10">
                            <div className={`flex flex-col ${isLeft ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-16 items-center`}>
                                {block.imageUrl && (
                                    <div className="lg:w-1/2 w-full h-full">
                                        <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-[var(--color-primary-base)]/20 border border-white/10 group aspect-[4/3] w-full">
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10 pointer-events-none"></div>
                                            <img src={block.imageUrl} alt={block.title || "Imagem"} className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
                                        </div>
                                    </div>
                                )}
                                <div className={`lg:w-1/2 w-full space-y-6 ${!block.imageUrl ? 'text-center lg:w-full max-w-4xl mx-auto' : ''}`}>
                                    {block.title && (
                                        <>
                                            <h2 className="text-4xl lg:text-5xl font-black uppercase italic tracking-tight text-[var(--color-primary-base)] drop-shadow-sm">
                                                {block.title}
                                            </h2>
                                            <div className="w-20 h-2 bg-[var(--color-primary-base)] transform -skew-x-12"></div>
                                        </>
                                    )}
                                    {block.content && (
                                        <div 
                                            className="ql-editor prose prose-base prose-invert prose-slate text-slate-300 [&>p]:mb-4"
                                            dangerouslySetInnerHTML={{ __html: block.content }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
                
            case 'CAROUSEL':
                if (!block.images || block.images.length === 0) return null;
                return (
                    <div id={block.id} key={block.id} className="py-24 bg-zinc-950 border-y border-white/5 relative overflow-hidden group/carousel" style={block.backgroundColor ? { backgroundColor: block.backgroundColor } : undefined}>
                        <div className="max-w-[1400px] mx-auto px-6 relative z-10">
                            {/* Arrows */}
                            {block.images.filter((i: any) => i.url).length > 1 && (
                                <>
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            const container = e.currentTarget.parentElement?.querySelector('.carousel-container');
                                            if(container) container.scrollBy({ left: -container.clientWidth * 0.8, behavior: 'smooth' });
                                        }}
                                        className="absolute left-8 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover/carousel:opacity-100 transition-opacity backdrop-blur-md border border-white/10 hidden md:block"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            const container = e.currentTarget.parentElement?.querySelector('.carousel-container');
                                            if(container) container.scrollBy({ left: container.clientWidth * 0.8, behavior: 'smooth' });
                                        }}
                                        className="absolute right-8 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover/carousel:opacity-100 transition-opacity backdrop-blur-md border border-white/10 hidden md:block"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                </>
                            )}
                            <div className="carousel-container flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory no-scrollbar relative scroll-smooth">
                                {block.images.filter((i: any) => i.url).map((img: any, i: number) => (
                                    <div key={i} className="min-w-[85vw] lg:min-w-[700px] shrink-0 snap-center rounded-3xl overflow-hidden shadow-2xl relative border border-white/10 group aspect-video">
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent z-10 pointer-events-none"></div>
                                        <img src={img.url} alt={`Banner Carrossel ${i+1}`} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
                
            case 'BENEFITS':
                return (
                    <div id={block.id} key={block.id} className="py-24 bg-slate-50 relative overflow-hidden" style={block.backgroundColor ? { backgroundColor: block.backgroundColor } : undefined}>
                        <div className="max-w-7xl mx-auto px-6 relative z-10">
                            {block.title && (
                                <div className="text-center mb-16 space-y-4">
                                    <h2 className="text-4xl md:text-5xl font-black text-slate-900 uppercase italic tracking-tight">
                                        {block.title}
                                    </h2>
                                    <div className="w-24 h-1.5 bg-[var(--color-primary-base)] mx-auto transform -skew-x-12"></div>
                                </div>
                            )}
                            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                                {block.items?.map((item: any, i: number) => (
                                    <div key={i} className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:-translate-y-2 transition-transform duration-300 text-center group">
                                        <div className="w-16 h-16 mx-auto bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-[var(--color-primary-base)]/10 transition-all duration-300 transform -rotate-3">
                                            <AlertCircle className="h-8 w-8 text-[var(--color-primary-base)]" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-3 uppercase tracking-wide">
                                            {item.title}
                                        </h3>
                                        <div 
                                            className="text-slate-600 leading-relaxed font-medium ql-editor"
                                            dangerouslySetInnerHTML={{ __html: item.description }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
                
            case 'HTML':
                return (
                    <div id={block.id} key={block.id} className="py-20 relative" style={block.backgroundColor ? { backgroundColor: block.backgroundColor } : { backgroundColor: '#f8fafc' }}>
                        <div className="max-w-5xl mx-auto px-6 relative z-10">
                            <div className="bg-white p-8 md:p-14 rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-100">
                                <div 
                                    className="ql-editor prose prose-slate prose-lg max-w-none text-slate-800" 
                                    dangerouslySetInnerHTML={{ __html: block.content || '' }} 
                                />
                            </div>
                        </div>
                    </div>
                );
                
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-[var(--color-primary-base)] selection:text-white" style={{ '--color-primary-base': primaryColor, '--color-primary-hover': `${primaryColor}dd` } as React.CSSProperties}>
            
            {/* Dynamic Header */}
            <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-white/10 shadow-2xl shadow-black/20">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 relative group">
                        <div className="absolute inset-0 bg-[var(--color-primary-base)] blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                        {globalConfig.logoUrl ? (
                            <img src={globalConfig.logoUrl} alt={planData.company_name} className="h-10 relative z-10" />
                        ) : (
                            <div className="flex items-center gap-3 relative z-10">
                                <div className="bg-[var(--color-primary-base)] p-2 rounded-lg transform -rotate-6">
                                    <span className="text-white font-black italic">B2B</span>
                                </div>
                                <span className="text-xl font-black text-white italic tracking-wider uppercase">
                                    {planData.company_name}
                                </span>
                            </div>
                        )}
                    </Link>
                    
                    {globalConfig.topMenu && globalConfig.topMenu.length > 0 && (
                        <nav className="hidden md:flex items-center gap-8">
                            {globalConfig.topMenu.map((item: any, i: number) => (
                                <a key={i} href={item.link} className="text-sm font-bold text-slate-300 hover:text-white uppercase tracking-widest transition-colors hover:scale-105 transform">
                                    {item.label}
                                </a>
                            ))}
                        </nav>
                    )}
                    
                    <div className="flex items-center gap-4">
                        <Link href="/" className="hidden md:inline-flex text-white hover:text-[var(--color-primary-base)] font-bold px-4 py-2 text-sm uppercase tracking-widest transition-colors">
                            Ver Store
                        </Link>
                        <Link href={`/h/${planData.id}/checkout`} className="hidden md:inline-flex bg-white hover:bg-slate-200 text-slate-900 font-bold px-6 py-2.5 rounded text-sm uppercase tracking-widest transition-colors transform skew-x-[-10deg] shadow-lg">
                            <span className="skew-x-[10deg] block">Assinar VIP</span>
                        </Link>
                    </div>
                </div>
            </header>

            <main>
                {blocks.length > 0 ? (
                    blocks.map((block: any, index: number) => renderBlock(block, index))
                ) : (
                    <div className="py-32 text-center text-slate-500">
                        Nenhum bloco configurado para esta página.
                    </div>
                )}
            </main>
            
            <footer className="bg-slate-950 border-t border-white/5 py-12 text-center relative overflow-hidden">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-32 bg-[var(--color-primary-base)]/20 blur-[100px] pointer-events-none"></div>
                <div className="relative z-10">
                    <p className="text-slate-500 font-medium">
                        &copy; {new Date().getFullYear()} {planData.company_name}. Todos os direitos reservados.
                    </p>
                </div>
            </footer>
        </div>
    );
}
