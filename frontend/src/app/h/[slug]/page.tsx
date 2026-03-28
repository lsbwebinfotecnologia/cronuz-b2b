"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, AlertCircle, Layers, ArrowRight, Star, Truck, ShieldCheck, Gift } from 'lucide-react';
import Link from 'next/link';
import 'react-quill-new/dist/quill.snow.css';

export default function HotsiteLandingPage() {
    const params = useParams();
    const slug = params.slug as string;
    
    const [loading, setLoading] = useState(true);
    const [planData, setPlanData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

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
    const rawConfig = planData.config || {};
    
    // Normalize config
    const globalConfig = rawConfig.global || {
        logoUrl: '',
        primaryColor: rawConfig.primaryColor || '#dc2626',
        topMenu: []
    };
    
    let blocks = rawConfig.blocks || [];
    
    // Fallback for old configurations
    if (!rawConfig.global && !rawConfig.blocks) {
        if (rawConfig.heroImage) {
            blocks.push({
                id: 'legacy-hero',
                type: 'BANNER',
                imageUrl: rawConfig.heroImage,
                title: planData.name,
                subtitle: planData.description
            });
        }
    }

    const primaryColor = globalConfig.primaryColor;

    const renderBlock = (block: any, index: number) => {
        switch(block.type) {
            case 'BANNER':
                return (
                    <div id={block.id} key={block.id} className="relative bg-zinc-950 text-white min-h-[70vh] flex items-center overflow-hidden" style={block.backgroundColor ? { backgroundColor: block.backgroundColor } : undefined}>
                        
                        {block.imageUrl && (
                            <div className="absolute inset-0 z-0 flex items-center justify-center pt-20">
                                <img src={block.imageUrl} alt={block.title || "Banner"} className="w-full max-w-[1400px] h-full object-contain opacity-70" />
                            </div>
                        )}
                        
                        <div className="max-w-7xl mx-auto px-6 relative z-10 w-full pt-32 pb-20">
                            <div className="max-w-2xl space-y-6 bg-black/60 p-8 lg:p-12 rounded-3xl backdrop-blur-md shadow-2xl border border-white/10">
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
                                {index === 0 && (
                                    <div className="pt-8">
                                        <Link href={`/h/${slug}/checkout`} className="inline-flex items-center justify-center gap-3 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold px-10 py-5 rounded-lg text-xl uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-[var(--color-primary-base)]/40 border-b-4 border-black/30">
                                            Assinar Agora
                                            <ArrowRight className="h-6 w-6" />
                                        </Link>
                                    </div>
                                )}
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
                                        className="absolute left-2 lg:left-8 top-1/2 -translate-y-1/2 z-20 text-[#fde047] hover:scale-110 p-2 rounded-full transition-transform drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] hidden md:block"
                                    >
                                        <svg className="w-14 h-14 lg:w-20 lg:h-20 fill-current" viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                                    </button>
                                    
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            const container = e.currentTarget.parentElement?.querySelector('.carousel-container');
                                            if(container) container.scrollBy({ left: container.clientWidth * 0.8, behavior: 'smooth' });
                                        }}
                                        className="absolute right-2 lg:right-8 top-1/2 -translate-y-1/2 z-20 text-[#fde047] hover:scale-110 p-2 rounded-full transition-transform drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] hidden md:block"
                                    >
                                        <svg className="w-14 h-14 lg:w-20 lg:h-20 fill-current" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                                    </button>
                                </>
                            )}
                            <div className="carousel-container flex overflow-x-auto gap-12 pb-8 snap-x snap-mandatory no-scrollbar relative scroll-smooth items-center">
                                {block.images.filter((i: any) => i.url).map((img: any, i: number) => (
                                    <div key={i} className="min-w-[80vw] lg:min-w-[800px] shrink-0 snap-center flex justify-center items-center relative group p-4">
                                        <img src={img.url} alt={`Banner Carrossel ${i+1}`} className="w-full max-w-[1000px] max-h-[70vh] object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.7)] group-hover:scale-105 transition-transform duration-700" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
                
            case 'VIDEO':
                return (
                    <div id={block.id} key={block.id} className="py-24 bg-black relative" style={block.backgroundColor ? { backgroundColor: block.backgroundColor } : undefined}>
                        <div className="absolute inset-0 bg-[var(--color-primary-base)]/5 mix-blend-screen opacity-50"></div>
                        <div className="max-w-5xl mx-auto px-6 relative z-10 text-center">
                            {block.title && (
                                <h2 className="text-3xl lg:text-5xl font-black uppercase text-white mb-16 tracking-tight">
                                    {block.title}
                                </h2>
                            )}
                            {block.videoUrl && (
                                <div className="aspect-video w-full bg-slate-900 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 ring-4 ring-[var(--color-primary-base)]/20">
                                    {block.videoUrl.includes('youtube.com') || block.videoUrl.includes('youtu.be') ? (
                                        <iframe 
                                            className="w-full h-full"
                                            src={block.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')} 
                                            title="YouTube video player" 
                                            frameBorder="0" 
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                            allowFullScreen
                                        ></iframe>
                                    ) : (
                                        <video src={block.videoUrl} controls className="w-full h-full object-cover bg-black" />
                                    )}
                                </div>
                            )}
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
        <div className="min-h-screen bg-slate-950 font-sans selection:bg-[var(--color-primary-base)] selection:text-white" style={{ '--dynamic-primary': primaryColor, '--color-primary-base': primaryColor, '--color-primary-hover': primaryColor + 'cc' } as React.CSSProperties}>
            
            {/* STICKY HEADER */}
            <header className="fixed top-0 w-full z-50 transition-all duration-300 bg-black text-white border-b-4 border-[var(--color-primary-base)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                <div className="max-w-[1400px] mx-auto px-4 lg:px-8 h-20 flex items-center justify-between">
                    <div className="flex-shrink-0 h-12 flex items-center">
                        <span className="text-2xl font-black uppercase italic tracking-tighter text-white">{planData.name}</span>
                    </div>
                    
                    <nav className="hidden md:flex items-center gap-8">
                        {globalConfig.topMenu && globalConfig.topMenu.map((item: any, i: number) => (
                            <a key={i} href={`#${item.targetId}`} className="text-sm font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:italic transition-all">
                                {item.label}
                            </a>
                        ))}
                    </nav>

                    <div className="flex items-center gap-4">
                        <Link href={`/h/${slug}/login`} className="text-sm font-bold uppercase tracking-wider text-slate-300 hover:text-white transition-all hidden md:block group flex items-center gap-2">
                            <span className="group-hover:italic">Área do Cliente</span>
                        </Link>
                        <Link href={`/h/${slug}/checkout`} className="hidden md:flex bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold uppercase px-6 py-2.5 rounded transform -skew-x-12 transition-all">
                            <span className="skew-x-12">Assinar</span>
                        </Link>
                    </div>
                </div>
            </header>

            {/* MAIN BLOCKS ENGINE */}
            <main className="pt-20">
                {blocks.map((block: any, index: number) => renderBlock(block, index))}
            </main>

            {/* FALLBACK LEGACY BENEFITS IF NO TEXT BLOCKS ARE ADDED AND FEATURES EXIST */}
            {blocks.length === 1 && blocks[0].type === 'BANNER' && rawConfig.features && rawConfig.features.length > 0 && (
                <div id="benefits" className="bg-zinc-900 border-y border-zinc-800 py-16">
                    <div className="max-w-7xl mx-auto px-6">
                        <div className="flex flex-col items-center justify-center text-center space-y-12">
                            <div className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
                                {rawConfig.features.map((feature: any, idx: number) => (
                                    <div key={idx} className="flex flex-col items-center gap-4 text-center md:px-8 pt-8 md:pt-0">
                                        <Star className="h-10 w-10 text-[var(--color-primary-base)] drop-shadow-[0_0_15px_var(--color-primary-base)]" />
                                        <div>
                                            <h4 className="font-black text-xl uppercase uppercase tracking-wide text-white">{feature.title}</h4>
                                            <p className="text-sm text-zinc-400 mt-2">{feature.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CHECKOUT / PRICING SECTION (Always at bottom) */}
            <div id="checkout-pricing" className="py-32 bg-slate-100 text-slate-900 relative overflow-hidden">
                <div className="absolute top-0 w-full h-8 bg-gradient-to-b from-black/20 to-transparent"></div>
                <div className="absolute -left-1/4 top-0 w-1/2 h-full bg-[var(--color-primary-base)]/10 blur-[100px] rounded-full mix-blend-multiply"></div>
                <div className="absolute -right-1/4 bottom-0 w-1/2 h-full bg-indigo-500/10 blur-[100px] rounded-full mix-blend-multiply"></div>

                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-4xl lg:text-6xl font-black uppercase text-slate-900 tracking-tighter mb-4">Assine Agora</h2>
                        <div className="w-24 h-2 bg-[var(--color-primary-base)] mx-auto transform -skew-x-12 mb-6"></div>
                        <p className="text-xl text-slate-600 font-medium">Garanta sua reserva com vantagens exclusivas {planData.status.current_phase !== 'STANDARD' ? `da fase ${planData.status.current_phase}` : ''}.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto transform perspective-1000">
                        
                        {/* 1st Delivery Box */}
                        <div className="relative bg-white border-2 border-[var(--color-primary-base)] rounded-3xl p-10 xl:p-12 shadow-2xl flex flex-col group hover:-translate-y-2 transition-all duration-300">
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-[var(--color-primary-base)] text-white px-8 py-2 rounded-full text-sm font-black uppercase tracking-widest shadow-xl">
                                Oferta Inicial
                            </div>
                            
                            <div className="text-center mt-6 mb-10">
                                <h3 className="text-3xl font-black text-slate-900 uppercase">Primeiro Envio</h3>
                                <p className="text-slate-500 mt-2 text-lg">Receba os volumes 1 {planData.pricing.issues_per_delivery > 1 ? `a ${planData.pricing.issues_per_delivery}` : ''}</p>
                            </div>
                            
                            <div className="text-center mb-10">
                                {planData.pricing.first_delivery.discount_percent > 0 && (
                                    <div className="text-slate-400 line-through decoration-rose-500 decoration-4 text-xl font-bold mb-2">
                                        De: R$ {planData.pricing.first_delivery.full_price.toFixed(2).replace('.', ',')}
                                    </div>
                                )}
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-slate-500 font-bold self-start mt-2">Por R$</span>
                                    <span className="text-7xl font-black text-[var(--color-primary-base)] tracking-tighter drop-shadow-sm">
                                        {planData.pricing.first_delivery.final_price.toFixed(2).replace('.', ',')}
                                    </span>
                                </div>
                                {planData.pricing.first_delivery.discount_percent > 0 && (
                                    <div className="inline-block mt-6 bg-emerald-100 text-emerald-800 font-black px-4 py-2 rounded-xl text-sm uppercase tracking-wider">
                                        Economia de {planData.pricing.first_delivery.discount_percent}%
                                    </div>
                                )}
                            </div>
                            
                            <div className="mt-auto pt-8 border-t-2 border-slate-100">
                                <Link 
                                    href={`/h/${slug}/checkout`}
                                    className={`w-full flex items-center justify-center p-5 rounded-xl font-black uppercase tracking-widest text-lg text-white transition-all shadow-xl ${isSoldOut ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] hover:shadow-[var(--color-primary-base)]/40 active:scale-95'}`}
                                >
                                    {isSoldOut ? 'Esgotado' : 'Assinar'}
                                </Link>
                                {!isSoldOut && planData.status.is_near_limit && (
                                    <p className="text-center mt-4 text-rose-600 font-bold text-sm animate-pulse">
                                        Resta apenas {planData.status.remaining_spots} assinaturas
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Future Deliveries Box */}
                        <div className="bg-white border-2 border-slate-200 rounded-3xl p-10 xl:p-12 shadow-xl flex flex-col justify-center transform hover:-translate-y-2 transition-all duration-300">
                            <Layers className="h-16 w-16 text-[var(--color-primary-base)] opacity-50 mx-auto mb-8" />
                            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase text-center">Próximos Envios</h3>
                            <p className="text-slate-500 mb-10 text-center text-lg">A cada {planData.pricing.issues_per_delivery} fascículos novos</p>
                            
                            <div className="flex items-center justify-center gap-2 mb-10">
                                <span className="text-slate-500 font-bold self-start mt-1">R$</span>
                                <span className="text-6xl font-black text-slate-800 tracking-tighter">
                                    {planData.pricing.future_deliveries.price.toFixed(2).replace('.', ',')}
                                </span>
                            </div>
                            
                            <p className="text-sm font-medium text-slate-500 mt-auto px-4 text-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                O valor é descontado automaticamente do seu cartão a cada novo envio. Cancele quando desejar sem taxas.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-black py-12 border-t border-zinc-900 text-center">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <p className="text-zinc-600 font-medium">
                        © {new Date().getFullYear()} {planData.company_name}. Todos os direitos reservados.
                    </p>
                    <div className="flex items-center gap-8 shadow-sm">
                         {globalConfig.topMenu && globalConfig.topMenu.map((item: any, i: number) => (
                            <a key={i} href={`#${item.targetId}`} className="text-sm font-bold uppercase tracking-wider text-zinc-500 hover:text-white transition-all">
                                {item.label}
                            </a>
                        ))}
                    </div>
                </div>
            </footer>
        </div>
    );
}
