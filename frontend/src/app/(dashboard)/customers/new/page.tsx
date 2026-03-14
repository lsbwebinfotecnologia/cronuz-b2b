'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, ArrowLeft, Save, MapPin, Users, Building, Plus, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

const steps = [
  { id: 'fiscal', title: 'Dados Fiscais', icon: Building2, desc: 'Informações principais de cadastro' },
  { id: 'address', title: 'Endereços', icon: MapPin, desc: 'Locais de entrega e faturamento' },
  { id: 'contact', title: 'Contatos', icon: Users, desc: 'Colaboradores envolvidos na operação' }
];

export default function NewCustomerPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form State
  const [fiscalData, setFiscalData] = useState({
    customer_type: 'PJ',
    name: '',
    corporate_name: '',
    document: '',
    state_registration: '',
    email: '',
    phone: '',
    credit_limit: 0,
    discount: 0
  });

  // Masking Utilities
  const maskCEP = (val: string) => {
    return val.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').substring(0, 9);
  };

  const maskPhone = (val: string) => {
    let v = val.replace(/\D/g, '');
    if (v.length <= 10) {
      return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').substring(0, 15);
  };

  const maskDocument = (val: string, type: string) => {
    let v = val.replace(/\D/g, '');
    if (type === 'PF') {
      return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').substring(0, 14);
    } else {
      return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').substring(0, 18);
    }
  };

  const [addresses, setAddresses] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  // Helpers to add temporary forms
  const addAddress = () => setAddresses([...addresses, { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip_code: '', type: 'MAIN' }]);
  const removeAddress = (index: number) => setAddresses(addresses.filter((_, i) => i !== index));

  const handleDocumentChange = async (value: string) => {
    const masked = maskDocument(value, fiscalData.customer_type);
    setFiscalData(prev => ({ ...prev, document: masked }));

    if (fiscalData.customer_type === 'PJ') {
       const cleanCnpj = masked.replace(/\D/g, '');
       if (cleanCnpj.length === 14) {
         try {
           const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
           if (res.ok) {
              const data = await res.json();
              setFiscalData(prev => ({
                ...prev,
                name: data.nome_fantasia || data.razao_social || prev.name,
                corporate_name: data.razao_social || prev.corporate_name,
                phone: data.ddd_telefone_1 ? maskPhone(data.ddd_telefone_1) : prev.phone
              }));
              
              // Add address if empty
              if (addresses.length === 0 && data.cep) {
                 setAddresses([{
                   street: data.logradouro || '',
                   number: data.numero || '',
                   complement: data.complemento || '',
                   neighborhood: data.bairro || '',
                   city: data.municipio || '',
                   state: data.uf || '',
                   zip_code: maskCEP(data.cep.toString()),
                   type: 'MAIN'
                 }]);
              }
              toast.success("Dados preenchidos via Receita Federal!");
           }
         } catch (e) {
           // silently fail status
         }
       }
    }
  };

  const addContact = () => setContacts([...contacts, { name: '', email: '', phone: '', role: '' }]);
  const removeContact = (index: number) => setContacts(contacts.filter((_, i) => i !== index));

  const updateAddress = (index: number, field: string, value: string) => {
    const newAddresses = [...addresses];
    newAddresses[index][field] = value;
    setAddresses(newAddresses);
  };

  const updateContact = (index: number, field: string, value: string) => {
    const newContacts = [...contacts];
    newContacts[index][field] = value;
    setContacts(newContacts);
  };

  const handleCepChange = async (index: number, value: string) => {
    const masked = maskCEP(value);
    const cleanCep = masked.replace(/\D/g, '');
    updateAddress(index, 'zip_code', masked);

    if (cleanCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        
        if (!data.erro) {
          const newAddresses = [...addresses];
          newAddresses[index] = {
            ...newAddresses[index],
            street: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || '',
            zip_code: value // keep formatted or user typed
          };
          setAddresses(newAddresses);
          toast.success("Endereço preenchido automaticamente!");
        }
      } catch (error) {
         console.warn("ViaCEP fetch failed", error);
      }
    }
  };

  async function handleSubmit() {
    // Validate minimal
    if (!fiscalData.name || !fiscalData.document) {
      toast.error('Preencha os campos obrigatórios (Nome fantasia e CNPJ)');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...fiscalData,
        addresses: addresses,
        contacts: contacts
      };

      const res = await fetch('http://localhost:8000/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success("Cliente B2B cadastrado com sucesso!");
        router.push('/customers');
      } else {
        const err = await res.json();
        toast.error(err.detail || "Falha ao gravar os dados do cliente.");
      }
    } catch (e) {
      toast.error("Erro sistêmico ao cadastrar cliente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Header Info */}
      <div className="flex items-center gap-5">
        <Link 
          href="/customers"
          className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Adicionar Novo Cliente B2B
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Preencha todos os dados fiscais e operacionais do cliente para homologação.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-2xl">
        {/* Wizard Steps */}
        <div className="flex flex-col sm:flex-row border-b border-slate-800/80 bg-slate-950/50">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`flex-1 flex px-6 py-4 items-center gap-4 transition-colors relative ${isActive ? 'bg-slate-800/30' : 'hover:bg-slate-800/10'}`}
              >
                <div className={`
                  flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all
                  ${isActive ? 'bg-[var(--color-primary-base)] text-white shadow-[0_0_15px_var(--color-primary-base)] shadow-indigo-500/20' 
                   : isCompleted ? 'bg-emerald-500/20 text-emerald-400'
                   : 'bg-slate-800 text-slate-500'}
                `}>
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className={`text-sm font-semibold ${isActive || isCompleted ? 'text-white' : 'text-slate-400'}`}>{step.title}</p>
                  <p className="text-xs text-slate-500">{step.desc}</p>
                </div>
                {isActive && (
                  <motion.div 
                    layoutId="activeWizardStep" 
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-primary-base)]"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Wizard Forms */}
        <div className="p-6 md:p-8">
          <AnimatePresence mode="wait">
            {/* STEP 1: FISCAL */}
            {currentStep === 0 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <h2 className="text-lg font-semibold text-white">1. Dados do Cliente</h2>
                    <p className="text-sm text-slate-400">Insira as informações de identificação do seu cliente para início do processo de faturamento e limites.</p>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                     <label className="text-sm font-medium text-slate-300">Tipo de Cliente *</label>
                     <div className="flex gap-4">
                       <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                         <input 
                           type="radio" 
                           name="customer_type" 
                           value="PJ" 
                           checked={fiscalData.customer_type === 'PJ'} 
                           onChange={e => setFiscalData({ ...fiscalData, customer_type: e.target.value, document: '' })}
                           className="text-indigo-500 bg-slate-900 border-slate-700" 
                         />
                         Pessoa Jurídica (CNPJ)
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                         <input 
                           type="radio" 
                           name="customer_type" 
                           value="PF" 
                           checked={fiscalData.customer_type === 'PF'} 
                           onChange={e => setFiscalData({ ...fiscalData, customer_type: e.target.value, document: '' })}
                           className="text-indigo-500 bg-slate-900 border-slate-700" 
                         />
                         Pessoa Física (CPF)
                       </label>
                     </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">{fiscalData.customer_type === 'PJ' ? 'CNPJ' : 'CPF'} *</label>
                    <input
                      type="text"
                      required
                      placeholder={fiscalData.customer_type === 'PJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                      value={fiscalData.document}
                      onChange={e => handleDocumentChange(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all font-mono"
                    />
                  </div>
                  
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-300">{fiscalData.customer_type === 'PJ' ? 'Razão Social' : 'Nome Completo'} *</label>
                    <input
                      type="text"
                      required
                      placeholder={fiscalData.customer_type === 'PJ' ? 'Livraria Cultura S.A.' : 'João da Silva'}
                      value={fiscalData.corporate_name}
                      onChange={e => setFiscalData({ ...fiscalData, corporate_name: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">{fiscalData.customer_type === 'PJ' ? 'Nome Fantasia *' : 'Apelido (Nome Curto) *'}</label>
                    <input
                      type="text"
                      required
                      placeholder={fiscalData.customer_type === 'PJ' ? 'Livraria Cultura Iguatemi' : 'João Cliente'}
                      value={fiscalData.name}
                      onChange={e => setFiscalData({ ...fiscalData, name: e.target.value })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all"
                    />
                  </div>



                  {fiscalData.customer_type === 'PJ' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-300">Inscrição Estadual (I.E.)</label>
                      <input
                        type="text"
                        placeholder="Isento"
                        value={fiscalData.state_registration}
                        onChange={e => setFiscalData({ ...fiscalData, state_registration: e.target.value })}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all font-mono"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Telefone Principal</label>
                    <input
                      type="text"
                      placeholder="(11) 90000-0000"
                      value={fiscalData.phone}
                      onChange={e => setFiscalData({ ...fiscalData, phone: maskPhone(e.target.value) })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                     <hr className="border-slate-800 my-2" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Limite de Crédito Inicial (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="5000.00"
                      value={fiscalData.credit_limit}
                      onChange={e => setFiscalData({ ...fiscalData, credit_limit: Number(e.target.value) })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-emerald-400 font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Desconto Padrão do Cliente (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      max="100"
                      placeholder="0.00"
                      value={fiscalData.discount}
                      onChange={e => setFiscalData({ ...fiscalData, discount: Number(e.target.value) })}
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-indigo-400 font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end pt-4 border-t border-slate-800/60">
                   <button
                    onClick={() => setCurrentStep(1)}
                    className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-6 rounded-xl transition-all"
                  >
                    Avançar para Endereços
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: ADDRESSES */}
            {currentStep === 1 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-lg font-semibold text-white">2. Múltiplos Endereços</h2>
                    <p className="text-sm text-slate-400">Cadastre os endereços de faturamento e entrega deste cliente.</p>
                  </div>
                  <button
                    onClick={addAddress}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Novo Endereço
                  </button>
                </div>

                {addresses.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500">
                    <MapPin className="h-8 w-8 mb-3 opacity-50" />
                    <p>Nenhum endereço cadastrado ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {addresses.map((addr, idx) => (
                      <div key={idx} className="p-5 border border-slate-700/60 rounded-xl bg-slate-800/20 relative group">
                        <button 
                          onClick={() => removeAddress(idx)}
                          className="absolute top-4 right-4 text-slate-500 hover:text-rose-400 transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1 md:col-span-3">
                             <label className="text-xs font-semibold text-slate-400 uppercase">Tipo do Endereço</label>
                             <select
                               value={addr.type}
                               onChange={(e) => updateAddress(idx, 'type', e.target.value)}
                               className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none"
                             >
                                <option value="MAIN">Matriz (Principal)</option>
                                <option value="SHIPPING">Endereço de Entrega</option>
                                <option value="BILLING">Endereço de Cobrança</option>
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-400 uppercase">CEP</label>
                             <input 
                               type="text" 
                               value={addr.zip_code} 
                               onChange={e => handleCepChange(idx, e.target.value)} 
                               className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors" 
                               placeholder="00000-000"
                               maxLength={9}
                             />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                             <label className="text-xs font-semibold text-slate-400 uppercase">Rua / Logradouro</label>
                             <input type="text" value={addr.street} onChange={e => updateAddress(idx, 'street', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="Av Paulista"/>
                          </div>
                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-400 uppercase">Número</label>
                             <input type="text" value={addr.number} onChange={e => updateAddress(idx, 'number', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="1000"/>
                          </div>
                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-400 uppercase">Bairro</label>
                             <input type="text" value={addr.neighborhood} onChange={e => updateAddress(idx, 'neighborhood', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="Bela Vista"/>
                          </div>
                           <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-400 uppercase">Cidade / UF</label>
                             <div className="flex gap-2">
                               <input type="text" value={addr.city} onChange={e => updateAddress(idx, 'city', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="Sampa"/>
                               <input type="text" value={addr.state} onChange={e => updateAddress(idx, 'state', e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="SP" maxLength={2}/>
                             </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex justify-between pt-4 border-t border-slate-800/60">
                  <button onClick={() => setCurrentStep(0)} className="text-slate-400 hover:text-white px-4 py-2">Voltar</button>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-6 rounded-xl transition-all"
                  >
                    Avançar para Contatos
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: CONTACTS & SUBMIT */}
            {currentStep === 2 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-lg font-semibold text-white">3. Contatos Autorizados</h2>
                    <p className="text-sm text-slate-400">Pessoas que receberão notas ou aprovarão pedidos.</p>
                  </div>
                  <button
                    onClick={addContact}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add Colaborador
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500">
                    <Users className="h-8 w-8 mb-3 opacity-50" />
                    <p>Nenhum contato nomeado.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contacts.map((contact, idx) => (
                      <div key={idx} className="p-5 border border-slate-700/60 rounded-xl bg-slate-800/20 relative group grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button 
                          onClick={() => removeContact(idx)}
                          className="absolute top-4 right-4 text-slate-500 hover:text-rose-400 transition-colors z-10"
                        >
                          <X className="h-5 w-5" />
                        </button>
                        
                        <div className="space-y-1">
                           <label className="text-xs font-semibold text-slate-400 uppercase">Nome Completo</label>
                           <input type="text" value={contact.name} onChange={e => updateContact(idx, 'name', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="Ex: João Silva"/>
                        </div>
                        <div className="space-y-1 pr-8">
                           <label className="text-xs font-semibold text-slate-400 uppercase">Cargo/Setor</label>
                           <input type="text" value={contact.role} onChange={e => updateContact(idx, 'role', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="Ex: Compras"/>
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-semibold text-slate-400 uppercase">E-mail</label>
                           <input type="email" value={contact.email} onChange={e => updateContact(idx, 'email', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none" placeholder="joao@livraria.com"/>
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-semibold text-slate-400 uppercase">Celular/WhatsApp</label>
                           <input type="text" value={contact.phone} onChange={e => updateContact(idx, 'phone', maskPhone(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 transition-colors" placeholder="(11) 90000-0000"/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Submit Action */}
                <div className="flex justify-between items-center pt-8 border-t border-slate-800/60 mt-8">
                  <button onClick={() => setCurrentStep(1)} className="text-slate-400 hover:text-white px-4 py-2">Voltar</button>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex justify-center items-center gap-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin"/> : <Save className="h-5 w-5" />}
                    Concluir e Salvar Cliente
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
