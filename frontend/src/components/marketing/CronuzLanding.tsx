"use client";

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Rocket, BrainCircuit, Users, Terminal, LineChart, Blocks, TrendingUp, ArrowRight, CheckCircle2, ChevronRight, Zap, Layers, BriefcaseBusiness, Box, ShoppingBag, Link as LinkIcon, MailPlus, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function CronuzLanding() {
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
                        <img src="/img/logo-lsb.png" alt="Lsbwebinfo" className="h-8 md:h-10 w-auto object-contain transition-transform hover:scale-105" />
                    </div>
                    <div className="flex items-center gap-4 md:gap-8">
                        <a href="#servicos" className="hidden lg:block text-sm font-semibold text-slate-600 hover:text-[#01A9AF] transition-colors">
                            Serviços
                        </a>
                        <a href="#produtos" className="hidden lg:block text-sm font-semibold text-slate-600 hover:text-[#01A9AF] transition-colors">
                            Cronuz
                        </a>
                        <a href="#parceiros" className="hidden lg:block text-sm font-semibold text-slate-600 hover:text-[#01A9AF] transition-colors">
                            Parceiros
                        </a>
                        <div className="hidden lg:flex items-center justify-center border-l h-6 border-slate-300 mx-1"></div>
                        <div className="flex items-center gap-4">
                        <a href="https://app.cronuzb2b.com.br/login" className="hidden md:flex text-sm font-bold text-slate-500 hover:text-[#01A9AF] items-center gap-2 transition-colors">
                            Já sou Cliente
                        </a>
                            <a href="#contato" className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2">
                                Contato Ágil
                            </a>
                        </div>
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
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#01A9AF] via-[#018b90] to-[#FF8A22]">Criatividade</span>, e software de alta performance para sua empresa.
                </motion.h1>
                
                <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.8, delay: 0.3}} className="text-lg md:text-xl text-slate-600 max-w-3xl mb-12 leading-relaxed font-medium">
                    Atuamos em duas frentes vitais: Prestamos <strong>Consultoria e Desenvolvimento</strong> sob medida pela Lsbwebinfo, e licenciamos os produtos do <strong>Ecossistema Cronuz</strong> para escalar vendas no seu B2B ou B2C.
                </motion.p>
                
                <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} transition={{duration:0.5, delay: 0.5}} className="flex flex-col sm:flex-row gap-4 items-center">
                    <a href="#contato" className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-xl shadow-slate-900/20 flex items-center gap-2 group">
                        Entrar em Contato
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </a>
                    <a href="#produtos" className="px-8 py-4 w-full sm:w-auto bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                        Conhecer Produtos (Cronuz)
                    </a>
                </motion.div>
            </section>

            {/* Nossos Serviços (Lsbwebinfo) */}
            <section id="servicos" className="relative z-10 w-full bg-white/80 backdrop-blur-xl py-32 border-y border-slate-200/50">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div initial={{opacity:0, y:30}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-20 max-w-3xl mx-auto">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#01A9AF]/10 text-[#016568] border border-[#01A9AF]/20 text-sm font-bold tracking-wide shadow-sm mb-6">
                            <BriefcaseBusiness className="w-4 h-4 mr-2" /> SERVIÇOS TÉCNICOS: LSBWEBINFO
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">Mão de obra cirúrgica para sua escalabilidade</h2>
                        <p className="text-slate-500 text-lg">
                            Além de ofertar produtos prontos, nós resolvemos feridas críticas operacionais modernizando processos com consultoria especialista e desenvolvimento ágil.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <ServiceCard 
                            icon={<LineChart className="w-8 h-8 text-[#01A9AF]" />}
                            title="Diagnóstico e Consultoria"
                            desc="Auditoria tática ponta a ponta. Identificamos gargalos na sua esteira de vendas e operações, desenhando propostas tecnológicas eficientes para matar o trabalho manual e blindar o crescimento."
                            delay={0.1}
                        />
                        <ServiceCard 
                            icon={<Terminal className="w-8 h-8 text-[#FF8A22]" />}
                            title="Desenvolvimento Assistido (IA)"
                            desc="Construímos módulos complementares, automações e APIs perfeitamente integradas utilizando fluxos de engenharia super-carregados com IA, reduzindo o Time-to-Market vertiginosamente."
                            delay={0.2}
                        />
                        <ServiceCard 
                            icon={<Users className="w-8 h-8 text-[#01A9AF]" />}
                            title="Implantação e Treinamento"
                            desc="Tecnologia sem aderência humana não traciona. Após mapear a solução, sentamos com sua equipe, garantimos o Treinamento Operacional, o Go-Live organizado e validamos o uso fluído no dia a dia."
                            delay={0.3}
                        />
                    </div>
                </div>
            </section>

            {/* Nossos Produtos - Cronuz */}
            <section id="produtos" className="relative z-10 w-full py-32 overflow-hidden bg-slate-50 border-b border-slate-200/50">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div initial={{x:0}} whileInView={{x:0}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-24 max-w-3xl mx-auto">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white border border-slate-800 text-sm font-bold tracking-wide shadow-sm mb-6">
                            <Box className="w-4 h-4 text-[#FF8A22] mr-2" /> PRODUTOS LICENCIADOS
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">O Ecossistema Cronuz</h2>
                        <p className="text-slate-500 text-lg">
                            Em vez de esperar meses ou anos testando ferramentas de prateleira que falham, nós criamos o Cronuz. Um ecossistema de silício moldável pensado no alto fluxo para você plugar sua empresa de imediato.
                        </p>
                    </motion.div>
                    
                    <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto items-stretch">
                        {/* Cronuz B2B */}
                        <motion.div initial={{opacity:0, x:-50}} whileInView={{opacity:1, x:0}} viewport={{once:true}} transition={{duration:0.5}} className="bg-white rounded-3xl p-10 border border-slate-200 shadow-xl shadow-slate-200/40 flex flex-col group hover:-translate-y-2 transition-transform duration-500">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl w-16 h-16 flex items-center justify-center drop-shadow-sm group-hover:bg-white group-hover:shadow transition-all">
                                    <img src="/img/logo-cronuz.png" alt="Cronuz" className="max-h-full max-w-full object-contain" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">Cronuz</h3>
                                    <span className="text-xs font-bold text-slate-500 tracking-widest uppercase">Distribuição/Corporativo/Varejo</span>
                                </div>
                            </div>
                            
                            <p className="text-slate-600 leading-relaxed mb-8 flex-1">
                                Plataforma definitiva de vendas multiplataforma. Gerencie, num ecossistema fechado (Multi-Tenant), múltiplos CNPJs base da sua empresa, tabelas de preço por representantes comerciais, regras de estoque complexas e conecte sem emendas nativamente ao ERP Horus. 
                            </p>
                            <ul className="space-y-4 mb-10 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                <li className="flex items-center text-slate-800 text-sm font-bold"><CheckCircle2 className="w-5 h-5 text-[#01A9AF] mr-3" /> Atacado: Gestão e Limites de Crédito Avançados</li>
                                <li className="flex items-center text-slate-800 text-sm font-bold"><CheckCircle2 className="w-5 h-5 text-[#01A9AF] mr-3" /> Varejo: Sistema de Assinaturas Completo Mensais/Anuais</li>
                                <li className="flex items-center text-slate-800 text-sm font-bold"><CheckCircle2 className="w-5 h-5 text-[#01A9AF] mr-3" /> Frente de Caixa PDV Integrado e Televendas</li>
                            </ul>
                            <a href="#contato" className="mt-auto px-6 py-4 w-full bg-slate-100 border border-slate-300 text-slate-700 text-center rounded-xl font-bold hover:bg-slate-900 hover:border-slate-800 hover:text-white transition-all shadow-sm">Demonstração Comercial do B2B</a>
                        </motion.div>
                        
                        {/* Cronuz B2C */}
                        <motion.div initial={{opacity:0, x:50}} whileInView={{opacity:1, x:0}} viewport={{once:true}} transition={{duration:0.5, delay:0.2}} className="bg-slate-950 rounded-3xl p-10 border border-slate-800 shadow-2xl shadow-[#FF8A22]/5 flex flex-col group hover:-translate-y-2 transition-transform duration-500 relative overflow-hidden">
                            <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#FF8A22]/10 blur-[80px] rounded-full pointer-events-none transition-all duration-700 group-hover:bg-[#FF8A22]/20"></div>
                            <div className="absolute -left-10 top-0 w-64 h-64 bg-[#01A9AF]/10 blur-[80px] rounded-full pointer-events-none"></div>

                            <div className="flex items-center gap-4 mb-8 relative z-10">
                                <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl w-16 h-16 flex items-center justify-center drop-shadow-sm group-hover:bg-slate-800 transition-all">
                                    <ShoppingBag className="h-8 w-8 text-[#FF8A22]" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-3">
                                        Cronuz B2C
                                    </h3>
                                    <span className="text-xs font-bold text-slate-400 tracking-widest uppercase flex items-center gap-2">Varejo Eletrônico <span className="bg-[#FF8A22]/20 text-[#FF8A22] text-[10px] font-black uppercase px-2 py-0.5 rounded border border-[#FF8A22]/30">Lançamento</span></span>
                                </div>
                            </div>
                            
                            <p className="relative text-slate-400 leading-relaxed mb-8 flex-1 z-10">
                                O avanço do ecossistema do Cronuz rumo direto ao consumidor final. Lojas performáticas ultra direcionadas a engajamento, retenção de público com ferramentas modulares para controle de assinaturas recorrentes e UX de ponta, livres das penalidades e limitações engessadas de Marketplaces antigos.
                            </p>
                            
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-6 mb-10 focus-within:ring-1 focus-within:ring-white/20 transition-all group-hover:border-white/20 z-10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[#FF8A22] font-bold text-sm tracking-wide uppercase flex items-center"><Zap className="w-4 h-4 mr-2" /> Validação Descomplicada</span>
                                </div>
                                <p className="text-slate-300 text-sm leading-relaxed mt-2">Comece certo e quebre o ciclo de sistemas errados. Cadastre sua operação varejista em nossa base e ative <strong>15 Dias de Teste Gratuito</strong> para dominar a performance real de um e-commerce Cronuz na prática.</p>
                            </div>

                            <a href="#contato" className="relative mt-auto px-6 py-4 w-full bg-slate-800/80 border border-slate-700/80 text-white text-center rounded-xl font-bold hover:bg-slate-800 hover:border-[#FF8A22]/30 hover:text-[#FF8A22] transition-all shadow-lg flex items-center justify-center gap-2 z-10">
                                Solicite uma Proposta <ArrowRight className="w-4 h-4 ml-1" />
                            </a>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Integrações e Parceiros Oficiais */}
            <section id="parceiros" className="relative z-10 w-full bg-white py-32 border-b border-slate-200/50">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div initial={{opacity:0, y:30}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-20 max-w-3xl mx-auto">
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 text-sm font-bold tracking-wide shadow-sm mb-6">
                            <LinkIcon className="w-4 h-4 text-[#01A9AF] mr-2" /> INTEGRAÇÕES COM HORUS E BOOKINFO
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">Especialistas e Parcerias Estratégicas</h2>
                        <p className="text-slate-500 text-lg">
                            Construímos pontes entre seu negócio e líderes de mercado. Através dos nossos times, <strong>desenvolvemos seu e-commerce ou site institucional</strong> conectado de ponta a ponta com as maiores soluções em gestão.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-8 mb-8">
                        {/* FMZ Tecnologia */}
                        <motion.div initial={{opacity:0, x:-50}} whileInView={{opacity:1, x:0}} viewport={{once:true}} transition={{duration:0.5}} className="bg-slate-900 border border-slate-800 rounded-3xl p-10 flex flex-col group hover:shadow-[0_20px_40px_-15px_rgba(1,169,175,0.2)] hover:border-[#01A9AF]/50 transition-all cursor-default">
                            <div className="h-20 flex items-center mb-6 w-full">
                                <img src="/img/logo-fmz-new.jpg" alt="FMZ Tecnologia" className="max-h-16 w-auto object-contain transition-all opacity-80 group-hover:opacity-100" />
                            </div>
                            <h4 className="text-xl font-bold text-white mb-3">FMZ Tecnologia (ERP Horus)</h4>
                            <p className="text-slate-400 font-medium text-sm">
                                Com mais de 20 anos de solidez no mercado industrial e atacado, a FMZ Tecnologia consolida o Horus ERP como espinha dorsal da operação estrutural. Nossas soluções de ponta são conectadas aos APIs deles.
                            </p>
                        </motion.div>

                        {/* Bookinfo */}
                        <motion.div initial={{opacity:0, x:50}} whileInView={{opacity:1, x:0}} viewport={{once:true}} transition={{duration:0.5, delay:0.2}} className="bg-slate-50 border border-slate-200 rounded-3xl p-10 flex flex-col group hover:shadow-[0_20px_40px_-15px_rgba(1,169,175,0.15)] hover:border-[#01A9AF]/30 hover:bg-white transition-all cursor-default">
                            <div className="h-20 flex items-center mb-6 w-full">
                                <img src="/img/logo-bookinfo.png" alt="Bookinfo" className="max-h-12 w-auto object-contain grayscale group-hover:grayscale-0 transition-all opacity-70 group-hover:opacity-100" />
                            </div>
                            <h4 className="text-xl font-bold text-slate-900 mb-3">Bookinfo</h4>
                            <p className="text-slate-500 font-medium">
                                Plataforma líder em inteligência de negócios para o mercado editorial. Nossa parceria técnica permite transacionar os dados de catálogo na velocidade que o mercado exige.
                            </p>
                        </motion.div>
                    </div>

                    {/* E-Commerce Partners */}
                    <motion.div initial={{opacity:0, y:30}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.5, delay:0.4}} className="bg-slate-50 border border-slate-200 rounded-3xl p-10 shadow-sm relative overflow-hidden group hover:bg-white transition-colors">
                        <div className="absolute inset-0 bg-gradient-to-r from-[#01A9AF]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10 text-center">
                            <h4 className="text-sm font-black text-slate-400 mb-10 uppercase tracking-widest">Desenvolvimento de Lojas Virtuais</h4>
                            <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                                <img src="/img/logo-shopify.png" alt="Shopify" className="h-8 md:h-12 w-auto object-contain mx-auto" />
                                <img src="/img/logo-tray.png" alt="Tray" className="h-8 md:h-12 w-auto object-contain mx-auto" />
                                <img src="/img/logo-loja-integrada.png" alt="Loja Integrada" className="h-8 md:h-12 w-auto object-contain mx-auto" />
                                <img src="/img/logo-bagy.png" alt="Bagy" className="h-8 md:h-12 w-auto object-contain mx-auto" />
                            </div>
                            <p className="text-slate-500 font-medium mt-10 max-w-2xl mx-auto text-sm">
                                Desenvolvemos, projetamos e lançamos sua <strong>loja virtual completa</strong> alavancando as melhores e mais flexíveis plataformas do varejo global: Shopify, Tray, Loja Integrada e Bagy. Cuidamos do design à integração.
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Lead Form Section */}
            <section id="contato" className="relative w-full bg-slate-900 py-32 overflow-hidden">
                <div className="absolute inset-0 bg-[url('/images/grid.svg')] opacity-10 filter invert pointer-events-none" />
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#01A9AF]/30 to-transparent pointer-events-none" />
                
                <div className="relative z-10 max-w-4xl mx-auto px-6">
                    <motion.div initial={{opacity:0, scale:0.95}} whileInView={{opacity:1, scale:1}} viewport={{once:true}} transition={{duration:0.6}} className="text-center mb-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-slate-800/50 border border-slate-700 text-[#01A9AF] mb-6 shadow-md">
                            <MailPlus className="w-8 h-8" />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">Fale com Nossos Especialistas</h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">Interessado em escalar seus lucros por meio de <strong>Consultoria Técnica LSB</strong>, desenvolvimento inteligente e os produtos consolidados <strong>Cronuz (B2B ou o Teste B2C)</strong>? Mande sua solicitação estruturada aqui embaixo.</p>
                    </motion.div>

                    <motion.form initial={{opacity:0, y:20}} whileInView={{opacity:1, y:0}} viewport={{once:true}} transition={{duration:0.6, delay:0.2}} onSubmit={handleSubmit} className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 md:p-12 shadow-2xl space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">Seu Nome / Responsável *</label>
                                <input required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} type="text" className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent transition-all shadow-inner" placeholder="Ex: João Roberto" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">WhatsApp para Contato *</label>
                                <input required value={formData.whatsapp} onChange={handlePhoneInput} type="text" className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent transition-all shadow-inner" placeholder="(11) 90000-0000" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">E-mail Corporativo *</label>
                            <input required value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} type="email" className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent transition-all shadow-inner" placeholder="contato@suaempresa.com.br" />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">Foco Principal da Análise *</label>
                            <div className="relative">
                                <select required value={formData.need_type} onChange={e=>setFormData({...formData, need_type: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent appearance-none transition-all shadow-inner cursor-pointer">
                                    <option value="" disabled className="text-slate-600">-- Por favor, indique do que se trata --</option>
                                    <optgroup label="Serviços (Lsbwebinfo)" className="text-slate-700 font-bold bg-slate-100">
                                        <option value="Serviços: Diagnóstico e Consultoria" className="bg-slate-800 text-white font-normal">Auditoria, Diagnóstico de T.I. e Consultoria</option>
                                        <option value="Serviços: Desenvolvimento e IA" className="bg-slate-800 text-white font-normal">Desenvolvimento de Sistemas / Integrações / IA</option>
                                        <option value="Serviços: Implantação e Treinamento" className="bg-slate-800 text-white font-normal">Implantação de Ferramentas / Treinamentos Corporativos</option>
                                    </optgroup>
                                    <optgroup label="Produtos (Ecossistema Cronuz)" className="text-slate-700 font-bold bg-slate-100 mt-2">
                                        <option value="Produto: Cronuz Corporate" className="bg-slate-800 text-white font-normal">Quero uma demonstração do Cronuz Corporate</option>
                                        <option value="Produto: Cronuz Assinaturas ou Varejo" className="bg-[#FF8A22] text-white font-bold">Solicitar Motor de Assinaturas ou Varejo (Cronuz C2C)</option>
                                    </optgroup>
                                </select>
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                    <ChevronDown className="w-4 h-4 text-slate-300" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 tracking-wide uppercase">Comentários (Nos dê Briefing)</label>
                            <textarea rows={4} value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700/80 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#01A9AF] focus:border-transparent resize-none transition-all shadow-inner" placeholder="O que hoje limita brutalmente a escalabilidade do seu negócio em termos de processos ou tecnologia?"></textarea>
                        </div>

                        <button disabled={submitting} type="submit" className="w-full py-5 bg-gradient-to-r from-[#01A9AF] to-[#018b90] hover:from-[#018b90] hover:to-[#016568] disabled:opacity-50 text-white rounded-xl font-extrabold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#01A9AF]/30 ring-1 ring-[#01A9AF]/50 hover:ring-[#01A9AF] mt-8 group h-16">
                            {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Entrar em Contato e Solicitar Avaliação'}
                            {!submitting && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 group-hover:scale-110 transition-transform ml-2" />}
                        </button>
                    </motion.form>
                </div>
            </section>

            {/* Footer */}
            <footer className="w-full bg-slate-950 py-12 text-center text-slate-500 relative z-10 border-t border-slate-900">
                <div className="flex flex-col items-center justify-center gap-4">
                    <img src="/img/logo-lsb.png" alt="Lsbwebinfo" className="h-6 w-auto object-contain brightness-0 invert opacity-60 hover:opacity-100 transition-all duration-500" />
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
            className="p-10 rounded-3xl bg-white/50 backdrop-blur-sm border border-slate-200 hover:bg-white hover:border-[#01A9AF]/30 group transition-all flex flex-col gap-5 relative overflow-hidden shadow-sm hover:shadow-[0_20px_40px_-15px_rgba(1,169,175,0.15)] bg-gradient-to-br from-white to-slate-50"
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
