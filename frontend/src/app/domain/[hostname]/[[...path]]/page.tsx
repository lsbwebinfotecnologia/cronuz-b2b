"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import 'react-quill-new/dist/quill.snow.css';

export default function DomainLandingPage() {
    const params = useParams();
    const hostname = params.hostname as string;
    
    const [loading, setLoading] = useState(true);
    const [planData, setPlanData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPlan = async () => {
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
                
                // 2. Fetch the primary hotsite for this company
                const hotsiteResponse = await fetch(`${apiUrl}/subscriptions/hotsite_by_company/${domainData.company_id}`);
                
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
    }, [hostname]);

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
                                <div className="pt-8">
                                    <Link href={`/h/${planData.id}/checkout`} className="inline-flex items-center justify-center gap-3 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold px-10 py-5 rounded-lg text-xl uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-[var(--color-primary-base)]/40 border-b-4 border-black/30">
                                        Assinar Agora
                                        <ArrowRight className="h-6 w-6" />
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
                    <div className="flex items-center gap-3 relative group">
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
                    </div>
                    
                    {globalConfig.topMenu && globalConfig.topMenu.length > 0 && (
                        <nav className="hidden md:flex items-center gap-8">
                            {globalConfig.topMenu.map((item: any, i: number) => (
                                <a key={i} href={item.link} className="text-sm font-bold text-slate-300 hover:text-white uppercase tracking-widest transition-colors hover:scale-105 transform">
                                    {item.label}
                                </a>
                            ))}
                        </nav>
                    )}
                    
                    <Link href={`/h/${planData.id}/checkout`} className="hidden md:inline-flex bg-white hover:bg-slate-200 text-slate-900 font-bold px-6 py-2.5 rounded text-sm uppercase tracking-widest transition-colors transform skew-x-[-10deg] shadow-lg">
                        <span className="skew-x-[10deg] block">Assinar VIP</span>
                    </Link>
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
