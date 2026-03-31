"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, ShoppingCart, User, Menu, ChevronRight, Loader2, Star } from 'lucide-react';

export default function CommerceStorefront({ hostname, domainInfo }: { hostname: string, domainInfo: any }) {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                
                // Fetch first page of products (highlighted/general)
                const res = await fetch(`${apiUrl}/storefront/search?q=a&limit=24&filter=default`);
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data.items || []);
                }
            } catch (err) {
                console.error("Commerce view fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, [hostname]);

    const primaryColor = domainInfo?.primaryColor || '#dc2626';

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if(searchQuery.trim().length > 0) {
           window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="h-10 w-10 animate-spin text-slate-800" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans flex flex-col" style={{ '--color-primary-base': primaryColor } as React.CSSProperties}>
            
            {/* Topbar Info (optional) */}
            <div className="bg-slate-900 text-slate-300 text-xs py-2 px-6 flex justify-between items-center hidden md:flex">
                <p>Bem-vindo à {domainInfo?.name}!</p>
                <div className="flex gap-4">
                    <Link href="/contact" className="hover:text-white transition-colors">Atendimento</Link>
                    <Link href="/tracking" className="hover:text-white transition-colors">Rastreio</Link>
                </div>
            </div>

            {/* Header Main */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20 gap-8">
                        
                        {/* Logo */}
                        <div className="flex-shrink-0 flex items-center">
                            <Link href="/">
                                {domainInfo?.logo ? (
                                    <img src={domainInfo.logo} alt={domainInfo.name} className="h-12 w-auto object-contain" />
                                ) : (
                                    <span className="text-2xl font-black text-slate-900 tracking-tight">{domainInfo?.name}</span>
                                )}
                            </Link>
                        </div>

                        {/* Search Bar - Center */}
                        <div className="flex-1 max-w-2xl hidden md:block">
                            <form onSubmit={handleSearch} className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[var(--color-primary-base)] transition-colors" />
                                <input
                                    type="text"
                                    placeholder="O que você está procurando?"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-100/80 border-transparent focus:bg-white focus:border-[var(--color-primary-base)] focus:ring-2 focus:ring-[var(--color-primary-base)]/20 rounded-full py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-500 transition-all shadow-inner"
                                />
                                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-[var(--color-primary-base)] text-white px-5 py-2 rounded-full text-sm font-bold hover:shadow-lg hover:opacity-90 transition-all">
                                    Buscar
                                </button>
                            </form>
                        </div>

                        {/* Actions Right */}
                        <div className="flex items-center gap-6">
                            <Link href="/login" className="flex items-center gap-2 group text-slate-600 hover:text-[var(--color-primary-base)] transition-colors">
                                <div className="p-2 bg-slate-100 rounded-full group-hover:bg-indigo-50 transition-colors">
                                    <User className="h-5 w-5" />
                                </div>
                                <div className="hidden lg:block text-left leading-tight">
                                    <p className="text-[10px] uppercase font-bold text-slate-400">Minha Conta</p>
                                    <p className="text-sm font-bold text-slate-700 group-hover:text-[var(--color-primary-base)] transition-colors">Entrar / Cadastrar</p>
                                </div>
                            </Link>

                            <Link href="/cart" className="flex items-center gap-2 group text-slate-600 hover:text-[var(--color-primary-base)] transition-colors relative">
                                <div className="p-2 bg-slate-100 rounded-full group-hover:bg-indigo-50 transition-colors relative">
                                    <ShoppingCart className="h-5 w-5" />
                                    <span className="absolute -top-1 -right-1 bg-[var(--color-primary-base)] text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center shadow-sm">
                                        0
                                    </span>
                                </div>
                                <div className="hidden lg:block text-left leading-tight">
                                    <p className="text-[10px] uppercase font-bold text-slate-400">Carrinho</p>
                                    <p className="text-sm font-bold text-slate-700 group-hover:text-[var(--color-primary-base)] transition-colors">R$ 0,00</p>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Categories Navigation Bar */}
                <div className="bg-white border-t border-slate-100 hidden md:block">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <nav className="flex items-center gap-8 h-12">
                            <button className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 hover:text-[var(--color-primary-base)] transition-colors h-full px-2 border-b-2 border-transparent hover:border-[var(--color-primary-base)]">
                                <Menu className="h-5 w-5" />
                                Todos os Departamentos
                            </button>
                            {/* Dummy Categories for Layout */}
                            {['Lançamentos', 'Mais Vendidos', 'Ofertas', 'Pré-venda'].map(cat => (
                                <Link key={cat} href={`/category/${cat.toLowerCase()}`} className="text-sm font-bold text-slate-600 hover:text-[var(--color-primary-base)] transition-colors">
                                    {cat}
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>
            </header>

            <main className="flex-1 pb-24">
                {/* Hero Banner */}
                {domainInfo?.login_background_url && (
                    <div className="w-full bg-slate-900 relative h-[400px] overflow-hidden">
                        <img 
                            src={domainInfo.login_background_url} 
                            alt="Banner Principal" 
                            className="w-full h-full object-cover opacity-80" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent flex items-center">
                            <div className="max-w-7xl mx-auto px-6 lg:px-8 w-full">
                                <h1 className="text-4xl md:text-6xl font-black text-white max-w-2xl uppercase tracking-tighter leading-tight drop-shadow-lg">
                                    Os Melhores Livros e Coleções Estão Aqui
                                </h1>
                                <p className="text-xl text-slate-200 mt-4 max-w-lg mb-8 font-medium">
                                    Descubra lançamentos exclusivos com o melhor preço e entrega rápida.
                                </p>
                                <button className="bg-[var(--color-primary-base)] text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest hover:opacity-90 transform transition-all hover:-translate-y-1 shadow-xl hover:shadow-[var(--color-primary-base)]/40 flex items-center gap-2">
                                    Explorar Catálogo <ChevronRight className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16">
                    
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <span className="w-2 h-8 bg-[var(--color-primary-base)] rounded-full block"></span>
                            Destaques
                        </h2>
                        <Link href="/search" className="text-sm font-bold text-[var(--color-primary-base)] hover:underline flex items-center gap-1">
                            Ver todos <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>

                    {products.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-8 gap-4">
                            {products.map(product => (
                                <Link href={`/product/${product.sku || product.id}`} key={product.id} className="bg-white border border-slate-100 rounded-2xl p-4 md:p-6 group hover:shadow-2xl hover:border-slate-200 hover:-translate-y-1 transition-all duration-300 flex flex-col h-full relative overflow-hidden">
                                    
                                    {/* Action Badges */}
                                    {product.promotional_price && product.base_price > product.promotional_price && (
                                        <div className="absolute top-4 left-4 z-10 bg-rose-500 text-white text-[10px] font-black px-2 py-1 rounded shadow-sm uppercase tracking-wider">
                                            -{Math.round(((product.base_price - product.promotional_price) / product.base_price) * 100)}%
                                        </div>
                                    )}
                                    {product.stock_status_label === "PRÉ-VENDA" && (
                                        <div className="absolute top-4 right-4 z-10 bg-[var(--color-primary-base)] text-white text-[10px] font-black px-2 py-1 rounded shadow-sm uppercase tracking-wider">
                                            Pré-Venda
                                        </div>
                                    )}

                                    <div className="aspect-[3/4] mb-4 bg-slate-50 rounded-xl overflow-hidden relative">
                                        <img 
                                            src={product.cover_url || `https://via.placeholder.com/300x400?text=${encodeURIComponent(product.name)}`} 
                                            alt={product.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    </div>

                                    <div className="flex-1 flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 line-clamp-1">{product.brand}</span>
                                        <h3 className="font-bold text-slate-900 group-hover:text-[var(--color-primary-base)] transition-colors line-clamp-2 text-sm md:text-base leading-tight">
                                            {product.name}
                                        </h3>
                                        
                                        <div className="flex items-center gap-1 mt-2">
                                            {[...Array(5)].map((_, i) => (
                                                <Star key={i} className="h-3 w-3 fill-[#fbbf24] text-[#fbbf24]" />
                                            ))}
                                            <span className="text-xs text-slate-400 ml-1 font-medium">(12)</span>
                                        </div>

                                        <div className="mt-auto pt-4 flex flex-col items-start gap-1">
                                            {product.promotional_price && product.base_price > product.promotional_price ? (
                                                <>
                                                    <span className="text-xs text-slate-400 line-through font-medium">R$ {product.base_price.toFixed(2).replace('.', ',')}</span>
                                                    <span className="text-xl font-black text-[var(--color-primary-base)] tracking-tight">R$ {product.promotional_price.toFixed(2).replace('.', ',')}</span>
                                                </>
                                            ) : (
                                                <span className="text-xl font-black text-slate-900 tracking-tight mt-4">R$ {product.base_price.toFixed(2).replace('.', ',')}</span>
                                            )}
                                        </div>
                                        
                                        <div className="text-xs text-slate-500 font-medium mt-1">
                                            ou 3x de R$ {((product.promotional_price || product.base_price) / 3).toFixed(2).replace('.',',')} sem juros
                                        </div>
                                    </div>
                                    
                                    {/* Action Hover Button */}
                                    <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-white via-white to-transparent pt-12 transition-all duration-300">
                                        <button className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-[var(--color-primary-base)] transition-colors flex items-center justify-center gap-2 shadow-lg">
                                            <ShoppingCart className="h-4 w-4" />
                                            {product.allow_purchase ? 'Comprar' : 'Avise-me'}
                                        </button>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-24 border border-dashed border-slate-300 rounded-3xl bg-slate-50">
                            <p className="text-slate-500 font-medium">Nenhum produto em destaque.</p>
                        </div>
                    )}
                </div>
            </main>

            <footer className="bg-slate-950 text-slate-400 py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-12">
                    <div>
                        {domainInfo?.logo ? (
                            <img src={domainInfo.logo} alt={domainInfo.name} className="h-8 object-contain brightness-0 invert opacity-80 mb-6" />
                        ) : (
                            <h4 className="text-white text-xl font-black mb-6 uppercase tracking-widest">{domainInfo?.name}</h4>
                        )}
                        <p className="text-sm font-medium leading-relaxed">A sua loja online com as melhores coleções literárias e entregas expressas para todo o Brasil.</p>
                    </div>
                    <div>
                        <h5 className="text-white font-bold uppercase tracking-widest mb-6">Ajuda & Suporte</h5>
                        <ul className="space-y-3 text-sm font-medium">
                            <li><Link href="/faq" className="hover:text-[var(--color-primary-base)] transition-colors">Perguntas Frequentes</Link></li>
                            <li><Link href="/shipping" className="hover:text-[var(--color-primary-base)] transition-colors">Política de Frete</Link></li>
                            <li><Link href="/returns" className="hover:text-[var(--color-primary-base)] transition-colors">Devoluções e Trocas</Link></li>
                            <li><Link href="/contact" className="hover:text-[var(--color-primary-base)] transition-colors">Fale Conosco</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h5 className="text-white font-bold uppercase tracking-widest mb-6">Institucional</h5>
                        <ul className="space-y-3 text-sm font-medium">
                            <li><Link href="/about" className="hover:text-[var(--color-primary-base)] transition-colors">Sobre a Livraria</Link></li>
                            <li><Link href="/terms" className="hover:text-[var(--color-primary-base)] transition-colors">Termos de Uso</Link></li>
                            <li><Link href="/privacy" className="hover:text-[var(--color-primary-base)] transition-colors">Política de Privacidade</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h5 className="text-white font-bold uppercase tracking-widest mb-6">Atendimento</h5>
                        <p className="text-sm font-medium mb-2">Segunda a Sexta, das 9h às 18h</p>
                        <p className="text-lg font-black text-white mb-2">(11) 4002-8922</p>
                        <p className="text-sm font-medium">contato@{hostname}</p>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-8 border-t border-slate-800 text-sm font-medium text-center md:text-left flex flex-col md:flex-row items-center justify-between">
                    <p>&copy; {new Date().getFullYear()} {domainInfo?.name}. Todos os direitos reservados.</p>
                    <div className="font-bold tracking-widest uppercase text-xs mt-4 md:mt-0 opacity-50">
                        Powered by Cronuz
                    </div>
                </div>
            </footer>
        </div>
    );
}
