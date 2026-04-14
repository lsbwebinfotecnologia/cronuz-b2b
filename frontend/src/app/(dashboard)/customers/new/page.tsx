'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, ArrowLeft, Save, MapPin, Users, Building, Plus, X, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';

const steps = [
  { id: 'fiscal', title: 'Dados Fiscais', icon: Building2, desc: 'Informações principais de cadastro' },
  { id: 'address', title: 'Endereços', icon: MapPin, desc: 'Locais de entrega e faturamento' },
  { id: 'contact', title: 'Contatos', icon: Users, desc: 'Colaboradores envolvidos na operação' }
];

export default function NewCustomerPage() {
  const router = useRouter();
  const user = getUser();
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
    open_debts: 0,
    consignment_status: 'INACTIVE',
    discount: 0,
    id_guid: '',
    id_doc: ''
  });

  const [searchingHorus, setSearchingHorus] = useState(false);

  // Masking Utilities
  const maskCEP = (val: string) => {
    return val.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').substring(0, 9);
  };

  const maskPhone = (val: string) => {
    const v = val.replace(/\D/g, '');
    if (v.length <= 10) {
      return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').substring(0, 15);
  };

  const maskDocument = (val: string, type: string) => {
    const v = val.replace(/\D/g, '');
    if (type === 'PF') {
      return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').substring(0, 14);
    } else {
      return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').substring(0, 18);
    }
  };

  const [addresses, setAddresses] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  // Helpers to add temporary forms
  const addAddress = () => setAddresses([...addresses, { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip_code: '', ibge_code: '', type: 'MAIN' }]);
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
                   ibge_code: data.codigo_municipio ? data.codigo_municipio.toString() : '',
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

  const handleHorusSearch = async () => {
    if (fiscalData.customer_type !== 'PJ') return;
    const cleanCnpj = fiscalData.document.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast.error('Preencha o CNPJ completo antes de buscar no Horus');
      return;
    }

    setSearchingHorus(true);
    try {
      if (!user?.company_id) throw new Error('Não foi possível obter dados da Empresa vinculada ao usuário');
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${user.company_id}/horus/customers/${cleanCnpj}`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });

      if (res.ok) {
        const payload = await res.json();
        const data = payload.data;
        
        setFiscalData(prev => ({
          ...prev,
          name: data.NOM_CLI || prev.name,
          corporate_name: data.NOM_CLI || prev.corporate_name,
          email: payload.email || prev.email,
          id_guid: data.ID_GUID || prev.id_guid,
          id_doc: payload.cnpj_seller || prev.id_doc,
          credit_limit: payload.financials?.credit_limit || prev.credit_limit,
          open_debts: payload.financials?.open_debts || prev.open_debts,
          consignment_status: payload.financials?.consignment_status || prev.consignment_status
        }));
        
        toast.success(payload.msg || 'Cliente localizado no Horus e dados preenchidos!');
      } else {
        const err = await res.json();
        throw new Error(err.detail || 'Cliente não encontrado no Horus ou api inativa.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao conectar com a API Horus. Verifique se ela está habilitada nas configurações.');
    } finally {
      setSearchingHorus(false);
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
            zip_code: value,
            ibge_code: data.ibge || ''
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

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers`, {
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
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-transparent dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Adicionar Novo Cliente B2B
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Preencha todos os dados fiscais e operacionais do cliente para homologação.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:shadow-2xl transition-colors">
        {/* Wizard Steps */}
        <div className="flex flex-col sm:flex-row border-b border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/50">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`flex-1 flex px-6 py-4 items-center gap-4 transition-colors relative ${isActive ? 'bg-white shadow-sm dark:bg-slate-800/30 dark:shadow-none' : 'hover:bg-slate-100 dark:hover:bg-slate-800/10'}`}
              >
                <div className={`
                  flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all
                  ${isActive ? 'bg-[var(--color-primary-base)] text-white shadow-[0_0_15px_var(--color-primary-base)] shadow-[var(--color-primary-base)]/20' 
                   : isCompleted ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                   : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}
                `}>
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className={`text-sm font-semibold ${isActive || isCompleted ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{step.title}</p>
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
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Dados do Cliente</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Insira as informações de identificação do seu cliente para início do processo de faturamento e limites.</p>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipo de Cliente *</label>
                     <div className="flex gap-4">
                       <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                         <input 
                           type="radio" 
                           name="customer_type" 
                           value="PJ" 
                           checked={fiscalData.customer_type === 'PJ'} 
                           onChange={e => setFiscalData({ ...fiscalData, customer_type: e.target.value, document: '' })}
                           className="text-[var(--color-primary-base)] bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-700" 
                         />
                         Pessoa Jurídica (CNPJ)
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                         <input 
                           type="radio" 
                           name="customer_type" 
                           value="PF" 
                           checked={fiscalData.customer_type === 'PF'} 
                           onChange={e => setFiscalData({ ...fiscalData, customer_type: e.target.value, document: '' })}
                           className="text-[var(--color-primary-base)] bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-700" 
                         />
                         Pessoa Física (CPF)
                       </label>
                     </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{fiscalData.customer_type === 'PJ' ? 'CNPJ' : 'CPF'} *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder={fiscalData.customer_type === 'PJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                        value={fiscalData.document}
                        onChange={e => handleDocumentChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all font-mono dark:bg-slate-950/50 dark:border-slate-800 dark:text-white"
                      />
                      {fiscalData.customer_type === 'PJ' && (
                        <button
                          type="button"
                          onClick={handleHorusSearch}
                          disabled={searchingHorus}
                          className="px-4 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 dark:border-indigo-500/20 rounded-xl transition-colors flex items-center gap-2 font-medium shrink-0 disabled:opacity-50"
                        >
                          {searchingHorus ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                          <span className="hidden sm:inline">Buscar no Horus</span>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{fiscalData.customer_type === 'PJ' ? 'Razão Social' : 'Nome Completo'} *</label>
                    <input
                      type="text"
                      required
                      placeholder={fiscalData.customer_type === 'PJ' ? 'Livraria Cultura S.A.' : 'João da Silva'}
                      value={fiscalData.corporate_name}
                      onChange={e => setFiscalData({ ...fiscalData, corporate_name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all dark:bg-slate-950/50 dark:border-slate-800 dark:text-white"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{fiscalData.customer_type === 'PJ' ? 'Nome Fantasia *' : 'Apelido (Nome Curto) *'}</label>
                    <input
                      type="text"
                      required
                      placeholder={fiscalData.customer_type === 'PJ' ? 'Livraria Cultura Iguatemi' : 'João Cliente'}
                      value={fiscalData.name}
                      onChange={e => setFiscalData({ ...fiscalData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all dark:bg-slate-950/50 dark:border-slate-800 dark:text-white"
                    />
                  </div>



                  {fiscalData.customer_type === 'PJ' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Inscrição Estadual (I.E.)</label>
                      <input
                        type="text"
                        placeholder="Isento"
                        value={fiscalData.state_registration}
                        onChange={e => setFiscalData({ ...fiscalData, state_registration: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all font-mono dark:bg-slate-950/50 dark:border-slate-800 dark:text-white"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Telefone Principal</label>
                    <input
                      type="text"
                      placeholder="(11) 90000-0000"
                      value={fiscalData.phone}
                      onChange={e => setFiscalData({ ...fiscalData, phone: maskPhone(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all dark:bg-slate-950/50 dark:border-slate-800 dark:text-white"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                     <hr className="border-slate-200 dark:border-slate-800 my-2" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Limite de Crédito Inicial (R$)</label>
                    <CurrencyInput
                      prefixStr="R$ "
                      placeholder="5000,00"
                      value={fiscalData.credit_limit}
                      onChangeValue={val => setFiscalData({ ...fiscalData, credit_limit: val })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all dark:bg-slate-950/50 dark:border-slate-800"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Desconto Padrão do Cliente (%)</label>
                    <CurrencyInput
                      suffixStr="%"
                      maxDecimals={2}
                      placeholder="0,00%"
                      value={fiscalData.discount}
                      onChangeValue={val => setFiscalData({ ...fiscalData, discount: val })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[var(--color-primary-base)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all dark:bg-slate-950/50 dark:border-slate-800"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2 mt-4">
                    <label className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Observações Padrão para NFS-e (Opcional)</label>
                    <textarea
                      placeholder="Texto fixo que sempre sairá anexado à descrição do serviço nas NFS-e deste cliente."
                      value={fiscalData.nfse_notes || ''}
                      onChange={e => setFiscalData({ ...fiscalData, nfse_notes: e.target.value })}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all dark:bg-slate-950/50 dark:border-slate-800 dark:text-white"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800/60 mt-4">
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
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Múltiplos Endereços</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Cadastre os endereços de faturamento e entrega deste cliente.</p>
                  </div>
                  <button
                    onClick={addAddress}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 dark:border-indigo-500/20 rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Novo Endereço
                  </button>
                </div>

                {addresses.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <MapPin className="h-8 w-8 mb-3 opacity-50" />
                    <p>Nenhum endereço cadastrado ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {addresses.map((addr, idx) => (
                      <div key={idx} className="p-5 border border-slate-200 rounded-xl bg-slate-50 relative group dark:border-slate-700/60 dark:bg-slate-800/20">
                        <button 
                          onClick={() => removeAddress(idx)}
                          className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors dark:text-slate-500 dark:hover:text-rose-400"
                        >
                          <X className="h-5 w-5" />
                        </button>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1 md:col-span-3">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Tipo do Endereço</label>
                             <select
                               value={addr.type}
                               onChange={(e) => updateAddress(idx, 'type', e.target.value)}
                               className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:border-[var(--color-primary-base)] transition-colors shadow-sm"
                             >
                                <option value="MAIN">Matriz (Principal)</option>
                                <option value="SHIPPING">Endereço de Entrega</option>
                                <option value="BILLING">Endereço de Cobrança</option>
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">CEP</label>
                             <input 
                               type="text" 
                               value={addr.zip_code} 
                               onChange={e => handleCepChange(idx, e.target.value)} 
                               className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" 
                               placeholder="00000-000"
                               maxLength={9}
                             />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Rua / Logradouro</label>
                             <input type="text" value={addr.street} onChange={e => updateAddress(idx, 'street', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Av Paulista"/>
                          </div>
                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Número</label>
                             <input type="text" value={addr.number} onChange={e => updateAddress(idx, 'number', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="1000"/>
                          </div>
                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Bairro</label>
                             <input type="text" value={addr.neighborhood} onChange={e => updateAddress(idx, 'neighborhood', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Bela Vista"/>
                          </div>
                           <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Cidade / UF</label>
                             <div className="flex gap-2">
                               <input type="text" value={addr.city} onChange={e => updateAddress(idx, 'city', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Sampa"/>
                               <input type="text" value={addr.state} onChange={e => updateAddress(idx, 'state', e.target.value)} className="w-16 bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="SP" maxLength={2}/>
                             </div>
                          </div>
                          <div className="space-y-1">
                             <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Código IBGE</label>
                             <input type="text" value={addr.ibge_code || ''} onChange={e => updateAddress(idx, 'ibge_code', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" placeholder="3504107"/>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-800/60">
                  <button onClick={() => setCurrentStep(0)} className="text-slate-500 hover:text-slate-900 px-4 py-2 dark:text-slate-400 dark:hover:text-white">Voltar</button>
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
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Contatos Autorizados</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Pessoas que receberão notas ou aprovarão pedidos.</p>
                  </div>
                  <button
                    onClick={addContact}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 dark:border-indigo-500/20 rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add Colaborador
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <Users className="h-8 w-8 mb-3 opacity-50" />
                    <p>Nenhum contato nomeado.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contacts.map((contact, idx) => (
                      <div key={idx} className="p-5 border border-slate-200 rounded-xl bg-slate-50 relative group grid grid-cols-1 md:grid-cols-2 gap-4 dark:border-slate-700/60 dark:bg-slate-800/20">
                        <button 
                          onClick={() => removeContact(idx)}
                          className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors z-10 dark:text-slate-500 dark:hover:text-rose-400"
                        >
                          <X className="h-5 w-5" />
                        </button>
                        
                        <div className="space-y-1">
                           <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Nome Completo</label>
                           <input type="text" value={contact.name} onChange={e => updateContact(idx, 'name', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Ex: João Silva"/>
                        </div>
                        <div className="space-y-1 pr-8">
                           <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Cargo/Setor</label>
                           <input type="text" value={contact.role} onChange={e => updateContact(idx, 'role', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Ex: Compras"/>
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">E-mail</label>
                           <input type="email" value={contact.email} onChange={e => updateContact(idx, 'email', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="joao@livraria.com"/>
                        </div>
                        <div className="space-y-1">
                           <label className="text-xs font-semibold text-slate-500 uppercase dark:text-slate-400">Celular/WhatsApp</label>
                           <input type="text" value={contact.phone} onChange={e => updateContact(idx, 'phone', maskPhone(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="(11) 90000-0000"/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Submit Action */}
                <div className="flex justify-between items-center pt-8 border-t border-slate-200 dark:border-slate-800/60 mt-8">
                  <button onClick={() => setCurrentStep(1)} className="text-slate-500 hover:text-slate-900 px-4 py-2 dark:text-slate-400 dark:hover:text-white">Voltar</button>
                  
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
