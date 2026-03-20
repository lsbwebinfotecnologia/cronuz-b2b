"use client";

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Rocket, BrainCircuit, Blocks, TrendingUp, ArrowRight, CheckCircle2, ChevronRight, Zap, Layers } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function MarketingPage() {
    const [formData, setFormData] = useState({ name: '', email: '', whatsapp: '', need_type: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!formData.name || !formData.email || !formData.need_type) {
            toast.error("Preencha os campos obrigatórios (Nome, E-mail e Necessidade).");
            return;
        }
        setSubmitting(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/leads/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if(res.ok) {
                toast.success("Mapeamento Solicitado! Nossa IA interna começará a analisar seu contato inicial.");
                setFormData({ name: '', email: '', whatsapp: '', need_type: '', description: '' });
            } else {
                toast.error("Erro ao enviar. Verifique os dados e tente novamente.");
            }
        } catch(err) {
            toast.error("Erro de conexão com nossos servidores ágeis.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 relative font-sans selection:bg-[#01A9AF]/30">
            {/* Background High-Performance Fixed Layer to prevent scroll lag */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-slate-50">
                {/* Tech Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
                
                {/* Soft glow blobs (performance optimized with transform-gpu) */}
                <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#01A9AF]/10 blur-[100px] transform-gpu will-change-transform opacity-70" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-[#FF8A22]/10 blur-[100px] transform-gpu will-change-transform opacity-70" />
            </div>

            {/* Navbar (Sticky + Glassmorphism) */}
            <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/70 backdrop-blur-lg border-b border-slate-200/50 shadow-sm py-4' : 'bg-transparent py-6'}`}>
                <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
                        <img src="https://lsbwebinfo.com.br/images/logo2.png" alt="Lsbwebinfo" className="h-8 md:h-10 w-auto object-contain transition-transform hover:scale-105" />
                    </div>
                    <div className="flex items-center gap-6">
                        <a href="#solucoes" className="hidden md:block text-sm font-semibold text-slate-600 hover:text-[#01A9AF] transition-colors">
                            Nossa Metodologia
                        </a>
                        <a href="#contato" className="hidden sm:inline-flex px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">
                            Iniciar Diagnóstico
                        </a>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-40 pb-32 text-center flex flex-col items-center">
                <motion.div initial={{opacity:0, y:-20}} animate={{opacity:1, y:0}} transition={{duration:0.5}} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm border border-[#01A9AF]/20 shadow-sm mb-8">
                    <SparklesIcon className="w-4 h-4 text-[#01A9AF] animate-pulse" />
                    <span className="text-xs font-bold text-[#016568] tracking-widest uppercase">Inteligência Estratégica & Código</span>
                </motion.div>
                
                <motion.h1 initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{duration:0.6, delay: 0.1}} className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 max-w-4xl text-slate-900 leading-[1.1]">
                    Construímos a solução do <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#01A9AF] via-[#018b90] to-[#FF8A22]">seu negócio</span> em tempo recorde.
                </motion.h1>
                
                <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.8, delay: 0.3}} className="text-lg md:text-xl text-slate-600 max-w-3xl mb-12 leading-relaxed font-medium">
                    A Lsbwebinfo traz um novo paradigma em tecnologia B2B e E-commerce. Entendemos a fundo sua operação, atuando como Arquitetos de Solução para personalizar o ecossistema Cronuz com velocidade e poder de IA.
                </motion.p>
                
                <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{duration:0.5, delay: 0.5}} className="flex flex-col sm:flex-row gap-4 items-center">
                    <a href="#contato" className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-xl shadow-slate-900/20 flex items-center gap-2 group">
                        Agendar Consultoria de IA
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </a>
                </motion.div>
            </section>

            {/* Nossa Metodologia (Serviços LSB) */}
            <section id="solucoes" className="relative z-10 w-full bg-white/80 backdrop-blur-xl py-32 border-y border-slate-200/50">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div initial={{opacity:0, y:30}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-20 max-w-3xl mx-auto">
                        <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6">Como moldamos o futuro da sua empresa</h2>
                        <p className="text-slate-500 text-lg">
                            Somos pioneiros em um formato de serviço inovador. Não entregamos apenas software genérico, construímos uma arquitetura de inteligência sob medida.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <ServiceCard 
                            icon={<Rocket className="w-8 h-8 text-[#01A9AF]" />}
                            title="Diagnóstico & Consultoria"
                            desc="Mergulhamos na sua operação para entender os gargalos de ponta a ponta, desenhar processos lógicos eficientes e projetar a solução exata para crescimento bruto."
                            delay={0.1}
                        />
                        <ServiceCard 
                            icon={<BrainCircuit className="w-8 h-8 text-[#FF8A22]" />}
                            title="Desenvolvimento C/ IA"
                            desc="Nosso diferencial: O fluxo de engenharia é supercarregado por Inteligência Artificial. Entregamos módulos ultracomplexos com segurança e numa fração do tempo da velha economia."
                            delay={0.2}
                        />
                        <ServiceCard 
                            icon={<TrendingUp className="w-8 h-8 text-[#01A9AF]" />}
                            title="Growth & Tração"
                            desc="Grandes tecnologias precisam de tração. Lideramos estratégias validadas de marketing de performance para inundar seu novo ecossistema com compradores qualificados."
                            delay={0.3}
                        />
                    </div>
                </div>
            </section>

            {/* O Motor Tecnológico - Cronuz */}
            <section className="relative z-10 w-full py-32">
                <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
                    <motion.div initial={{opacity:0, x:-40}} whileInView={{opacity:1, x:0}} viewport={{once:true}} transition={{duration:0.6}} className="flex-1 relative w-full">
                        <div className="relative aspect-square max-h-[500px] rounded-3xl bg-white border border-slate-200 p-8 shadow-2xl flex flex-col items-center justify-center text-center overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-[#01A9AF]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            <img src="/images/cronuz-logo.png" alt="Cronuz" className="relative z-10 h-16 w-auto object-contain mb-8 filter drop-shadow-md" />
                            <h3 className="relative z-10 text-2xl font-bold text-slate-900 mb-4 tracking-tight">O Motor Tecnológico</h3>
                            <p className="relative z-10 text-slate-500 leading-relaxed font-medium">
                                Seu negócio avança rápido porque não começamos do zero. Desdobramos o painel de bordo sobre a arquitetura do <strong className="text-slate-800">Cronuz</strong>, nosso ecossistema central já hiper-testado no mercado de alto fluxo.
                            </p>
                            <div className="relative z-10 grid grid-cols-2 gap-4 mt-8 w-full border-t border-slate-100 pt-8">
                                <div className="flex flex-col items-center gap-2 group-hover:-translate-y-1 transition-transform">
                                    <Blocks className="w-6 h-6 text-[#01A9AF]" />
                                    <span className="text-sm font-bold text-slate-700">Módulos B2B</span>
                                </div>
                                <div className="flex flex-col items-center gap-2 group-hover:-translate-y-1 transition-transform delay-75">
                                    <Layers className="w-6 h-6 text-[#FF8A22]" />
                                    <span className="text-sm font-bold text-slate-700">Multi-Tenancy</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                    
                    <motion.div initial={{opacity:0, x:40}} whileInView={{opacity:1, x:0}} viewport={{once:true}} transition={{duration:0.6}} className="flex-1 space-y-8">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white border border-slate-800 text-sm font-bold tracking-wide shadow-sm">
                            <Zap className="w-4 h-4 text-[#FF8A22] mr-2" /> VANTAGEM COMPETITIVA
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold leading-tight text-slate-900">
                            Uma fundação de silício para escalar suas operações.
                        </h2>
                        <ul className="space-y-6">
                            <li className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#01A9AF]/10 border border-[#01A9AF]/20 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                                    <span className="font-extrabold text-[#01A9AF]">1</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 text-xl tracking-tight">Arquitetura Unificada</h4>
                                    <p className="text-slate-600 mt-2 leading-relaxed">Sistemas de venda B2B Corporativo, Varejo B2C, Clubes de Assinatura e Múltiplos CNPJs dividindo o mesmo cérebro central em perfeita sincronia.</p>
                                </div>
                            </li>
                            <li className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-xl bg-[#01A9AF]/10 border border-[#01A9AF]/20 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                                    <span className="font-extrabold text-[#01A9AF]">2</span>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 text-xl tracking-tight">Alta Capacidade Customizável</h4>
                                    <p className="text-slate-600 mt-2 leading-relaxed">Ao invés de frameworks amadores, nós codificamos regras de negócios e fluxos vitais únicos para você em cima do DNA Cronuz, usando lógica algorítmica veloz.</p>
                                </div>
                            </li>
                        </ul>
                    </motion.div>
                </div>
            </section>

            {/* Lead Form Section */}
            <section id="contato" className="relative w-full bg-slate-900 py-32 overflow-hidden">
                <div className="absolute inset-0 bg-[url('/images/grid.svg')] opacity-10" />
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#FF8A22]/50 to-transparent" />
                
                <div className="relative z-10 max-w-4xl mx-auto px-6">
                    <motion.div initial={{opacity:0, scale:0.95}} whileInView={{opacity:1, scale:1}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-12">
                        <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">Decole Seu Projeto Hoje</h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">Agende uma análise ágil conosco. Insira os dados da sua operação e nossa equipe entrará em contato conectada às suas necessidades.</p>
                    </motion.div>

                    <motion.form initial={{opacity:0, y:20}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.6, delay:0.2}} onSubmit={handleSubmit} className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 md:p-12 shadow-2xl space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-300">Responsável *</label>
                                <input required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} type="text" className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent transition-all shadow-inner" placeholder="Seu nome" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-300">WhatsApp Comercial</label>
                                <input value={formData.whatsapp} onChange={e=>setFormData({...formData, whatsapp: e.target.value})} type="text" className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent transition-all shadow-inner" placeholder="(11) 90000-0000" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300">E-mail Administrativo *</label>
                            <input required value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} type="email" className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent transition-all shadow-inner" placeholder="admin@suaempresa.com.br" />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300">Foco Estratégico do Contato *</label>
                            <div className="relative">
                                <select required value={formData.need_type} onChange={e=>setFormData({...formData, need_type: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent appearance-none transition-all shadow-inner">
                                    <option value="" disabled className="text-slate-500">Selecione o eixo de atuação...</option>
                                    <option value="Consultoria Tecnológica">Consultoria Tecnológica e Estratégia B2B</option>
                                    <option value="Implantação B2B/B2C">Implantação Ágil Varejo B2B / B2C</option>
                                    <option value="Desenvolvimento Especial">Arquitetura de Software Sob Medida (Com IA)</option>
                                    <option value="Estratégia Marketing">Diagnóstico e Planejamento de Performance Digital</option>
                                </select>
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                    <ChevronRight className="w-4 h-4 text-slate-400 rotate-90" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300">Briefing Rápido da Oportunidade</label>
                            <textarea rows={4} value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent resize-none transition-all shadow-inner" placeholder="O que hoje limita brutalmente a escalabilidade do seu negócio em termos de processos ou tecnologia?"></textarea>
                        </div>

                        <button disabled={submitting} type="submit" className="w-full py-5 bg-gradient-to-r from-[#01A9AF] to-[#018b90] hover:from-[#018b90] hover:to-[#016568] disabled:opacity-50 text-white rounded-xl font-extrabold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#01A9AF]/30 ring-1 ring-[#01A9AF]/50 hover:ring-[#01A9AF] mt-8 group">
                            {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Sondar Mapeamento com Nossos Engenheiros'}
                            {!submitting && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </motion.form>
                </div>
            </section>

            {/* Footer */}
            <footer className="w-full bg-slate-950 py-12 text-center text-slate-500 relative z-10 border-t border-slate-900">
                <div className="flex flex-col items-center justify-center gap-4">
                    <img src="https://lsbwebinfo.com.br/images/logo2.png" alt="Lsbwebinfo" className="h-6 w-auto object-contain grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-500" />
                    <p className="text-sm font-medium mt-4">© {new Date().getFullYear()} Lsbwebinfo Tecnologia. Vanguarda em Engenharia Ágil.</p>
                </div>
            </footer>
        </div>
    );
}

function ServiceCard({ icon, title, desc, delay = 0 }: { icon: React.ReactNode, title: string, desc: string, delay?: number }) {
    return (
        <motion.div 
            initial={{opacity: 0, y: 30}}
            whileInView={{opacity: 1, y: 0}}
            viewport={{once: true}}
            transition={{duration: 0.5, delay}}
            className="p-10 rounded-3xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:bg-white hover:border-[#01A9AF]/30 group transition-all flex flex-col gap-5 relative overflow-hidden shadow-sm hover:shadow-[0_20px_40px_-15px_rgba(1,169,175,0.15)]"
        >
            <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-10 transition-opacity duration-500 transform translate-x-4 -translate-y-4">
                {icon}
            </div>
            <div className="relative w-14 h-14 rounded-2xl bg-white flex items-center justify-center border border-slate-100 shadow-sm group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
            <h3 className="relative text-xl font-extrabold text-slate-900 tracking-tight">{title}</h3>
            <p className="relative text-slate-500 leading-relaxed text-sm font-medium">
                {desc}
            </p>
        </motion.div>
    );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        </svg>
    )
}
