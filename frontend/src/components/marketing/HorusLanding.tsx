"use client";

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowRight, CheckCircle2, ShieldCheck, Box, LineChart, Handshake, Users, ArrowUpRight, MailPlus, ChevronDown, PackageCheck, BriefcaseBusiness, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HorusLanding() {
    const [formData, setFormData] = useState({ name: '', email: '', whatsapp: '', need_type: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
        if (!x) return;
        const formatted = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        setFormData({ ...formData, whatsapp: formatted });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!formData.name || !formData.email || !formData.need_type) {
            toast.error("Preencha os campos obrigatórios (Nome, E-mail e Necessidade).");
            return;
        }
        setSubmitting(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/leads/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if(res.ok) {
                toast.success("Mapeamento Solicitado! Nossa equipe analisará seu caso em breve.");
                setFormData({ name: '', email: '', whatsapp: '', need_type: '', description: '' });
            } else {
                toast.error("Erro ao enviar. Verifique os dados e tente novamente.");
            }
        } catch(err) {
            toast.error("Erro de conexão com nossos servidores.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 relative font-sans selection:bg-[#7C3AED]/30">
            {/* Background High-Performance Fixed Layer */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-slate-50">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
                
                {/* Soft purple glow blobs (Horus Identity) */}
                <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#7C3AED]/10 blur-[100px] transform-gpu will-change-transform opacity-70" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#6D28D9]/10 blur-[100px] transform-gpu will-change-transform opacity-70" />
            </div>

            {/* Navbar (Sticky + Glassmorphism) */}
            <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-lg border-b border-slate-200/50 shadow-sm py-4' : 'bg-transparent py-6'}`}>
                <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                    <div className="flex items-center gap-6 cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
                        <img src="/img/logo-fmz.png" alt="FMZ Tecnologia" className="h-8 md:h-10 w-auto object-contain transition-transform hover:scale-105" />
                        <span className="hidden md:inline text-slate-300 font-light">+</span>
                        <img src="/img/logo-lsb.png" alt="Lsbwebinfo" className="hidden md:block h-6 md:h-8 w-auto object-contain transition-transform hover:scale-105" />
                    </div>
                    <div className="flex items-center gap-4 md:gap-8">
                        <a href="#funcionalidades" className="hidden lg:block text-sm font-semibold text-slate-600 hover:text-[#7C3AED] transition-colors">
                            Módulos
                        </a>
                        <div className="hidden lg:flex items-center justify-center border-l h-6 border-slate-300 mx-1"></div>
                        <div className="flex items-center gap-4">
                            <a href="https://app.horusb2b.com.br/login" className="hidden md:flex text-sm font-bold text-slate-500 hover:text-[#7C3AED] items-center gap-2 transition-colors">
                                Marketplace B2B
                            </a>
                            <a href="#contato" className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2">
                                Ativar Solução
                            </a>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-48 pb-32 text-center flex flex-col items-center">
                <motion.div initial={{opacity:0, y:-20}} animate={{opacity:1, y:0}} transition={{duration:0.5}} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-md border border-[#7C3AED]/20 shadow-sm mb-8">
                    <Sparkles className="w-4 h-4 text-[#7C3AED] animate-pulse" />
                    <span className="text-xs font-bold text-[#6D28D9] tracking-widest uppercase">FMZ & Lsbwebinfo em Parceria Inédita</span>
                </motion.div>
                
                <motion.h1 initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{duration:0.6, delay: 0.1}} className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 max-w-4xl text-slate-900 leading-[1.1]">
                    O B2B que <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7C3AED] to-[#9333EA]">facilita a vida</span> de Editoras, Distribuidoras e Livrarias.
                </motion.h1>
                
                <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.8, delay: 0.3}} className="text-lg md:text-xl text-slate-600 max-w-3xl mb-12 leading-relaxed font-medium">
                    A mais poderosa vitrine integrada ao <strong>ERP Horus</strong>. Domine seu atacado com políticas comerciais precisas, limite de crédito dinâmico, consignações sob controle e a força técnica da <strong>FMZ Tecnologia e Lsbwebinfo</strong> juntas.
                </motion.p>
                
                <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{duration:0.5, delay: 0.5}} className="flex flex-col sm:flex-row gap-4 items-center">
                    <a href="#contato" className="px-8 py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-xl font-bold transition-all shadow-xl shadow-[#7C3AED]/30 flex items-center gap-2 group">
                        Tenha acesso ao Novo B2B
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </a>
                </motion.div>
            </section>

            {/* Core Modules Section */}
            <section id="funcionalidades" className="relative z-10 w-full bg-white/80 backdrop-blur-xl py-32 border-y border-slate-200/50">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div initial={{opacity:0, y:30}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-20 max-w-3xl mx-auto">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#7C3AED]/10 text-[#6D28D9] border border-[#7C3AED]/20 text-sm font-bold tracking-wide shadow-sm mb-6">
                            <Box className="w-4 h-4 mr-2" /> MÓDULOS ESSENCIAIS HORUS
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">O Motor de Vendas para o Mercado Editorial</h2>
                        <p className="text-slate-500 text-lg">
                            Tudo o que sua equipe de representantes e lojistas parceiros(as) precisam para girar produtos e faturar mais, sem fricção, totalmente sincronizado da vitrine até o faturamento.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <FeatureCard 
                            icon={<Users className="w-7 h-7 text-[#7C3AED]" />}
                            title="Módulo Agente"
                            desc="Hierarquia completa! Comissionamento e permissões organizadas. Seus representantes (agentes) gerenciam a carteira própria de clientes com autonomia guiada."
                            delay={0.1}
                        />
                        <FeatureCard 
                            icon={<ShieldCheck className="w-7 h-7 text-[#9333EA]" />}
                            title="Política Comercial"
                            desc="Campanhas flexíveis e restrições amarradas ao perfil do comprador. Não venda fora da política e descontos que você programou no ERP Atacadista."
                            delay={0.2}
                        />
                        <FeatureCard 
                            icon={<Handshake className="w-7 h-7 text-[#7C3AED]" />}
                            title="Pedidos Venda/Consignado"
                            desc="Módulo híbrido super ágil: Criação de pedidos de vendas normais ou consignados direto pela vitrine com precisão técnica. Acesso total pelos lojistas."
                            delay={0.3}
                        />
                        <FeatureCard 
                            icon={<LineChart className="w-7 h-7 text-[#9333EA]" />}
                            title="Limite de Crédito Ativo"
                            desc="Nada de surpresas na aprovação manual! O comprador vê no painel qual é o seu limite disponível de crédito com você na hora exata da compra."
                            delay={0.4}
                        />
                        <FeatureCard 
                            icon={<PackageCheck className="w-7 h-7 text-[#7C3AED]" />}
                            title="Estoque em Tempo Real"
                            desc="Conexão direta com armazém lógico da Horus! Seu e-commerce bloqueia ou expõe volumes exatamente conforme a realidade física e fiscal do acervo."
                            delay={0.5}
                        />
                        <FeatureCard 
                            icon={<BriefcaseBusiness className="w-7 h-7 text-[#9333EA]" />}
                            title="Acerto de Consignação"
                            desc="Acompanhamento e acerto cirúrgico. Visualize débitos atrelados a remessas anteriores. Saiba o que foi vendido para acertar e reabastecer as prateleiras da Livraria com inteligência."
                            delay={0.6}
                        />
                        <div className="lg:col-start-2 lg:col-span-1">
                            <FeatureCard 
                                icon={<ArrowUpRight className="w-7 h-7 text-[#7C3AED]" />}
                                title="Visualização de Débitos"
                                desc="Total clareza para seus parceiros Lojistas B2B acessarem a plataforma e consultarem Faturas, Títulos e repasses atrasados sem dor de cabeça no telefone."
                                delay={0.7}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* C2A / Partnership Banner */}
            <section className="relative z-10 w-full py-32 overflow-hidden bg-[#7C3AED] border-b border-purple-800">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <motion.div initial={{y:30, opacity:0}} whileInView={{y:0, opacity:1}} viewport={{once:true}} transition={{duration:0.6}} className="flex flex-col items-center">
                        <div className="flex items-center gap-6 mb-10 bg-white/10 p-6 rounded-2xl border border-white/20 backdrop-blur-md">
                            <img src="/img/logo-fmz.png" alt="FMZ Tecnologia" className="h-10 md:h-12 w-auto object-contain brightness-0 invert opacity-90" />
                            <div className="w-px h-10 bg-white/30 hidden md:block"></div>
                            <img src="/img/logo-lsb.png" alt="Lsbwebinfo" className="h-8 md:h-10 w-auto object-contain brightness-0 invert opacity-90 hidden md:block" />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight max-w-4xl">Aliança e Engenharia de Software.</h2>
                        <p className="text-purple-100 text-lg max-w-2xl">
                           Unimos a formidável infraestrutura do ERP Horus de gestão atacadista/editorial com a inovação front-end super rápida desenvolvida pela Lsbwebinfo, formando o ambiente definitivo para atacadistas modernos escalarem seu e-commerce B2B.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Lead Form Section */}
            <section id="contato" className="relative w-full bg-slate-900 py-32 overflow-hidden">
                <div className="absolute inset-0 bg-[url('/images/grid.svg')] opacity-10 filter invert pointer-events-none" />
                
                <div className="relative z-10 max-w-4xl mx-auto px-6">
                    <motion.div initial={{opacity:0, scale:0.95}} whileInView={{opacity:1, scale:1}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-slate-800/50 border border-slate-700 text-[#7C3AED] mb-6 shadow-md">
                            <MailPlus className="w-8 h-8" />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">Ative seu Módulo B2B</h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">Pronto para colocar seu catálogo editorial inteiro num Storefront impecável conectado ao seu servidor Horus? Preencha os campos e ativamos você.</p>
                    </motion.div>

                    <motion.form initial={{opacity:0, y:20}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.6, delay:0.2}} onSubmit={handleSubmit} className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 md:p-12 shadow-2xl space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">Sua Empresa (Cliente FMZ) *</label>
                                <input required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} type="text" className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent transition-all shadow-inner" placeholder="Razão Social ou Fantasia" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">WhatsApp para Contato *</label>
                                <input required value={formData.whatsapp} onChange={handlePhoneInput} type="text" className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent transition-all shadow-inner" placeholder="(11) 90000-0000" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">Seu E-mail Corporativo *</label>
                            <input required value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} type="email" className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent transition-all shadow-inner" placeholder="comercial@suaempresa.com.br" />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">O que você busca? *</label>
                            <div className="relative">
                                <select required value={formData.need_type} onChange={e=>setFormData({...formData, need_type: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent appearance-none transition-all shadow-inner cursor-pointer">
                                    <option value="" disabled className="text-slate-600">-- Selecione uma opção --</option>
                                    <option value="Hotsite Horus (Catálogo)" className="bg-slate-800 text-white">Quero minha Storefront de Catálogo e Vendas Atacado agora</option>
                                    <option value="Apoio LSB" className="bg-slate-800 text-white">Sou Editora buscando adequações ou integrações extras</option>
                                </select>
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                    <ChevronDown className="w-4 h-4 text-slate-300" />
                                </div>
                            </div>
                        </div>

                        <button disabled={submitting} type="submit" className="w-full py-5 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white rounded-xl font-extrabold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#7C3AED]/30 ring-1 ring-[#7C3AED]/50 hover:ring-[#7C3AED] mt-8 group h-16">
                            {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Solicitar Ativação B2B (Módulo Integrado)'}
                            {!submitting && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 group-hover:scale-110 transition-transform ml-2" />}
                        </button>
                    </motion.form>
                </div>
            </section>

            {/* Footer */}
            <footer className="w-full bg-slate-950 py-12 text-center text-slate-500 relative z-10 border-t border-slate-900">
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="flex gap-4 items-center mb-2">
                         <img src="/img/logo-fmz.png" alt="FMZ" className="h-6 w-auto object-contain brightness-0 invert opacity-40 hover:opacity-80 transition-all duration-500" />
                         <span className="text-slate-700">|</span>
                         <img src="/img/logo-lsb.png" alt="Lsbwebinfo" className="h-5 w-auto object-contain brightness-0 invert opacity-40 hover:opacity-80 transition-all duration-500" />
                    </div>
                    <p className="text-sm font-medium mt-4">© {new Date().getFullYear()} Horus B2B. Tecnologia Distribuída - LSB / FMZ.</p>
                </div>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, desc, delay = 0 }: { icon: React.ReactNode, title: string, desc: string, delay?: number }) {
    return (
        <motion.div 
            initial={{opacity: 0, y: 30}}
            whileInView={{opacity: 1, y: 0}}
            viewport={{once: true}}
            transition={{duration: 0.5, delay}}
            className="p-8 rounded-3xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:bg-white hover:border-[#7C3AED]/30 group transition-all flex flex-col gap-4 relative overflow-hidden shadow-sm hover:shadow-[0_20px_40px_-15px_rgba(124,58,237,0.15)] bg-gradient-to-br from-white to-purple-50/20"
        >
            <div className="relative w-14 h-14 rounded-2xl bg-white flex items-center justify-center border border-purple-100 shadow-sm group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
            <h3 className="relative text-xl font-extrabold text-slate-900 tracking-tight">{title}</h3>
            <p className="relative text-slate-500 leading-relaxed text-sm font-medium">
                {desc}
            </p>
        </motion.div>
    );
}
