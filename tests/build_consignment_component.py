import os

code = """
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Search, CheckCircle2, AlertTriangle, Upload, RefreshCw, XCircle, FileSpreadsheet, ArrowRight, BookOpen, Calculator, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface HorusConsignmentManagerProps {
    apiBaseUrl: string; // ex: '/me/consignment' ou '/companies/1/horus/customers/xxx/consignment'
    token: string;
    backUrl?: string; // a url to go back
}

interface ConsignmentSummary {
    COD_CTR: number;
    SALDO_ITENS: number;
    VLR_TOTAL_LIQUIDO: number;
}

interface ConsignmentItem {
    COD_ITEM: number;
    NOM_ITEM: string;
    NOM_EDITORA: string;
    COD_BARRA_ITEM: string;
    QTD_ATENDIDA: number;
    QTD_FATURADA: number;
    QTD_DEV_FAT: number;
    VLR_PRECO: string;
    VLR_LIQUIDO: string;
    SALDO_ITENS: number;
    VLR_TOTAL_LIQUIDO: number;
    // Client-side fields
    qtdConferida: number;
}

interface SubmitResult {
    BARRAS_ISBN?: string;
    QTD?: string;
    Mensagem?: string;
    Falha?: boolean;
}

export default function HorusConsignmentManager({ apiBaseUrl, token, backUrl }: HorusConsignmentManagerProps) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [summary, setSummary] = useState<ConsignmentSummary | null>(null);
    const [items, setItems] = useState<ConsignmentItem[]>([]);
    
    // "A" = Acerto, "D" = Devolucao
    const [operationType, setOperationType] = useState<"A" | "D">("A");
    
    // Scan Mode
    const [scanMode, setScanMode] = useState<"contador" | "geral">("contador");
    
    const [barcodeInput, setBarcodeInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Pending Qty Modal for "Geral" mode
    const [pendingQuantityItem, setPendingQuantityItem] = useState<{barcode: string, index: number, name: string, max: number} | null>(null);
    const [pendingQtyInput, setPendingQtyInput] = useState("1");
    const pendingQtyInputRef = useRef<HTMLInputElement>(null);

    // After submit results
    const [submitResults, setSubmitResults] = useState<SubmitResult[] | null>(null);

    // Filter
    const [searchTerm, setSearchTerm] = useState("");
    
    // Import errors to show at the end
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [showImportModal, setShowImportModal] = useState(false);

    useEffect(() => {
        fetchData();
    }, [apiBaseUrl, token]);

    // Auto-focus the quantity input if it opens
    useEffect(() => {
        if (pendingQuantityItem && pendingQtyInputRef.current) {
            setTimeout(() => {
                pendingQtyInputRef.current?.focus();
                pendingQtyInputRef.current?.select();
            }, 100);
        }
    }, [pendingQuantityItem]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            
            // Tenta pegar o sumario
            const summaryRes = await fetch(`${baseUrl}${apiBaseUrl}/summary`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const summaryData = await summaryRes.json();
            
            if (!summaryRes.ok) throw new Error(summaryData.detail || 'Erro ao carregar resumo do contrato');
            
            if (Array.isArray(summaryData) && summaryData.length > 0) {
                 setSummary({
                     COD_CTR: summaryData[0].COD_CTR || 0,
                     SALDO_ITENS: summaryData[0].SALDO_ITENS || 0,
                     VLR_TOTAL_LIQUIDO: summaryData[0].VLR_TOTAL_LIQUIDO || 0
                 });
            } else if (summaryData && !Array.isArray(summaryData)) {
                 setSummary({
                     COD_CTR: summaryData.COD_CTR || 0,
                     SALDO_ITENS: summaryData.SALDO_ITENS || 0,
                     VLR_TOTAL_LIQUIDO: summaryData.VLR_TOTAL_LIQUIDO || 0
                 });
            }

            // Pega o detalhamento analitico
            const detailsRes = await fetch(`${baseUrl}${apiBaseUrl}/details`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const detailsData = await detailsRes.json();
            
            if (!detailsRes.ok) throw new Error(detailsData.detail || 'Erro ao carregar itens do contrato');
            
            const detailedArray = Array.isArray(detailsData) ? detailsData : [detailsData];
            
            const normalizedItems = detailedArray.map(item => ({
                COD_ITEM: item.COD_ITEM,
                NOM_ITEM: item.NOM_ITEM,
                NOM_EDITORA: item.NOM_EDITORA,
                COD_BARRA_ITEM: item.COD_BARRA_ITEM,
                QTD_ATENDIDA: item.QTD_ATENDIDA || 0,
                QTD_FATURADA: item.QTD_FATURADA || 0,
                QTD_DEV_FAT: item.QTD_DEV_FAT || 0,
                VLR_PRECO: item.VLR_PRECO,
                VLR_LIQUIDO: item.VLR_LIQUIDO,
                SALDO_ITENS: item.SALDO_ITENS || 0,
                VLR_TOTAL_LIQUIDO: item.VLR_TOTAL_LIQUIDO || 0,
                // Reset Conferida on fetch
                qtdConferida: 0
            }));
            
            setItems(normalizedItems);
            
        } catch (err: any) {
             setError(err.message || 'Falha ao comunicar com a API');
             toast.error(err.message || 'Falha ao comunicar com a API');
        } finally {
             setLoading(false);
        }
    };

    const handleBarcodeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = barcodeInput.trim();
        if(!code) return;
        
        const itemIndex = items.findIndex(i => i.COD_BARRA_ITEM === code);
        if (itemIndex === -1) {
            toast.error(`Produto ${code} não encontrado no contrato!`);
            setBarcodeInput("");
            return;
        }

        const item = items[itemIndex];
        
        // Se for o modo "GERAL", abre o pop up exigindo o numero
        if (scanMode === 'geral') {
             setPendingQuantityItem({ barcode: code, index: itemIndex, name: item.NOM_ITEM, max: item.SALDO_ITENS });
             setPendingQtyInput(item.qtdConferida > 0 ? String(item.qtdConferida + 1) : "1");
             setBarcodeInput("");
             return;
        }

        // Se for "CONTADOR", apenas adiciona +1
        if (item.qtdConferida + 1 > item.SALDO_ITENS) {
             toast.warning(`Saldo insuficiente para o item ${code}. O contrato possui apenas ${item.SALDO_ITENS}.`);
             setBarcodeInput("");
             return;
        }

        const newItems = [...items];
        newItems[itemIndex].qtdConferida += 1;
        setItems(newItems);
        toast.success(`Adicionado 1x ${item.NOM_ITEM.substring(0, 20)}...`);
        setBarcodeInput("");
    };

    const handleModalPendingQuantitySubmit = (e: React.FormEvent) => {
         e.preventDefault();
         if (!pendingQuantityItem) return;
         
         const valToAdd = parseInt(pendingQtyInput) || 0;
         const newItems = [...items];
         
         if (valToAdd < 0) {
             toast.error(`Quantidade não pode ser negativa.`);
             return;
         }
         
         if (valToAdd > pendingQuantityItem.max) {
             toast.warning(`Quantidade informada (${valToAdd}) reduzida para o saldo máximo permitido: ${pendingQuantityItem.max}.`);
             newItems[pendingQuantityItem.index].qtdConferida = pendingQuantityItem.max;
         } else {
             newItems[pendingQuantityItem.index].qtdConferida = valToAdd;
         }
         
         setItems(newItems);
         setPendingQuantityItem(null);
         
         // Voltar o cursor pra barra automaticamente
         setTimeout(() => {
             inputRef.current?.focus();
         }, 100);
    };

    const handleQtdChange = (index: number, val: string) => {
        const newVal = parseInt(val) || 0;
        const newItems = [...items];
        if (newVal > newItems[index].SALDO_ITENS) {
             toast.warning(`Quantidade maior que o saldo do contrato (${newItems[index].SALDO_ITENS}).`);
             newItems[index].qtdConferida = newItems[index].SALDO_ITENS;
        } else {
             newItems[index].qtdConferida = newVal;
        }
        setItems(newItems);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
             try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                // Espera-se [BARRAS_ISBN, QTD] headers ou array
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];
                
                const newItems = [...items];
                const notFound: string[] = [];
                
                // Pular header (row 0)
                for (let i = 1; i < data.length; i++) {
                     const row = data[i];
                     if(row.length < 2) continue;
                     
                     const barcode = String(row[0]).trim();
                     let qty = parseInt(String(row[1]));
                     if(isNaN(qty) || qty <= 0) continue;
                     
                     const itemIndex = newItems.findIndex(x => x.COD_BARRA_ITEM === barcode);
                     if (itemIndex === -1) {
                         notFound.push(barcode);
                     } else {
                         if (qty > newItems[itemIndex].SALDO_ITENS) {
                              qty = newItems[itemIndex].SALDO_ITENS;
                         }
                         newItems[itemIndex].qtdConferida = qty;
                     }
                }
                
                setItems(newItems);
                if (notFound.length > 0) {
                     setImportErrors(notFound);
                     setShowImportModal(true);
                     toast.warning(`${notFound.length} produtos não encontrados na consignação, mas importação dos válidos continuará.`);
                } else {
                     toast.success("Planilha processada com sucesso sem erros!");
                }
                
                // Clear input
                if(e.target) e.target.value = '';

             } catch (err: any) {
                 toast.error("Falha ao ler o arquivo: " + err.message);
             }
        };
        reader.readAsBinaryString(file);
    };

    const submitBatch = async () => {
         const itemsToSubmit = items.filter(x => x.qtdConferida > 0);
         if (itemsToSubmit.length === 0) {
              toast.warning("Nenhum item com quantidade informada.");
              return;
         }

         const payload = {
              tipo_a_d: operationType,
              cod_ctr: summary?.COD_CTR ? String(summary.COD_CTR) : null,
              items: itemsToSubmit.map(i => ({
                  BARRAS_ISBN: i.COD_BARRA_ITEM,
                  QTD: String(i.qtdConferida)
              }))
         };

         if(!confirm(`Confirma o envio em lote desta operação de ${operationType === 'A' ? 'ACERTO' : 'DEVOLUÇÃO'}?
Total de itens únicos: ${itemsToSubmit.length}`)) {
              return;
         }

         setSubmitting(true);
         try {
             const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
             const submitRes = await fetch(`${baseUrl}${apiBaseUrl}/submit`, {
                 method: 'POST',
                 headers: { 
                     'Authorization': `Bearer ${token}`,
                     'Content-Type': 'application/json' 
                 },
                 body: JSON.stringify(payload)
             });
             const dataRes = await submitRes.json();

             if (!submitRes.ok) {
                 throw new Error(dataRes.detail || "Erro ao processar as quantidades");
             }
             
             // O Horus devolve Array com a tag 'Mensagem' em cada item
             // Ou um Objeto geral com 'Falha' = True em caso de bloqueio.
             if (Array.isArray(dataRes)) {
                 setSubmitResults(dataRes);
                 // Os detalhes ficarão bloqueados no background, usuário fecha a modal para dar reload.
             } else if (dataRes && dataRes.Falha) {
                 throw new Error(dataRes.Mensagem || "Contrato bloqueado ou ocorrência geral ao processar o Horus.");
             } else {
                 toast.success(`Operação de ${operationType === 'A' ? 'ACERTO' : 'DEVOLUÇÃO'} finalizada com formato de resposta desconhecido!`);
                 await fetchData();
             }
         } catch(err: any) {
             toast.error(err.message || 'Erro ao enviar o lote de quantidades');
         } finally {
             setSubmitting(false);
         }
    };

    const closeResultsModal = () => {
         setSubmitResults(null);
         fetchData(); // Recarrega saldos sempre que fechar
    };

    const filteredItems = items.filter(i => 
        i.NOM_ITEM.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.COD_BARRA_ITEM.includes(searchTerm) ||
        i.NOM_EDITORA.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculations
    const totalQtdApurada = items.reduce((acc, curr) => acc + curr.qtdConferida, 0);
    const totalValorApurado = items.reduce((acc, curr) => {
        let _liq = parseFloat(curr.VLR_LIQUIDO.replace(',', '.')) || 0;
        return acc + (_liq * curr.qtdConferida);
    }, 0);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                <p className="text-slate-500 font-medium">Buscando saldos na API Horus...</p>
            </div>
        );
    }

    if (error && !summary && items.length === 0) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-2xl mx-auto text-center">
                 <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                 <h2 className="text-xl font-bold text-red-900 mb-2">Ops! Verificamos um problema.</h2>
                 <p className="text-red-700 mb-6">{error}</p>
                 <div className="flex justify-center gap-4">
                      {backUrl && (
                          <a href={backUrl} className="px-4 py-2 bg-white text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Voltar</a>
                      )}
                      <button onClick={fetchData} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
                          <RefreshCw className="w-4 h-4" /> Tentar Novamente
                      </button>
                 </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm relative">
             {/* Header Section */}
             <div className="bg-slate-50 border-b border-slate-200 p-6 flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div>
                       <div className="flex items-center gap-2 mb-1">
                            <BookOpen className="w-5 h-5 text-blue-600" />
                            <h2 className="text-xl font-bold text-slate-800">Conferência Consignação Horus</h2>
                       </div>
                       <p className="text-sm text-slate-500">
                           {summary?.COD_CTR ? `Contrato ativo: #${summary.COD_CTR}` : "Carregando Contrato..."}
                       </p>
                  </div>
                  
                  {/* Totalizadores Fixos em cima */}
                  {summary && (
                      <div className="flex flex-wrap gap-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                           <div>
                               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Saldo do Contrato</p>
                               <p className="text-lg font-black text-slate-800">{summary.SALDO_ITENS} <span className="text-sm font-normal text-slate-500 font-medium">un</span></p>
                           </div>
                           <div className="w-px bg-slate-200"></div>
                           <div>
                               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Valor Líq. Total</p>
                               <p className="text-lg font-black text-slate-800">R$ {summary.VLR_TOTAL_LIQUIDO.toFixed(2).replace('.',',')}</p>
                           </div>
                      </div>
                  )}
             </div>

             {/* Command Center */}
             <div className="p-4 border-b border-slate-100 flex flex-col xl:flex-row gap-4 items-end bg-white">
                  
                  {/* Toggle Type */}
                  <div className="flex-none min-w-[200px] w-full xl:w-auto">
                       <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Tipo de Operação</label>
                       <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                            <button 
                                onClick={() => React.startTransition(() => {
                                    if(operationType !== 'A' && totalQtdApurada > 0) {
                                         if(confirm("Alterar o tipo de operação apagará as quantidades já informadas. Confirma?")) {
                                             setItems(items.map(i => ({...i, qtdConferida: 0})));
                                             setOperationType("A");
                                         }
                                    } else {
                                        setOperationType("A");
                                    }
                                })}
                                className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${operationType === 'A' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                                Acerto
                            </button>
                            <button 
                                onClick={() => React.startTransition(() => {
                                    if(operationType !== 'D' && totalQtdApurada > 0) {
                                         if(confirm("Alterar o tipo de operação apagará as quantidades já informadas. Confirma?")) {
                                             setItems(items.map(i => ({...i, qtdConferida: 0})));
                                             setOperationType("D");
                                         }
                                    } else {
                                        setOperationType("D");
                                    }
                                })}
                                className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${operationType === 'D' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                            >
                                Devolução
                            </button>
                       </div>
                  </div>

                  {/* Scan Mode Toggle */}
                  <div className="flex-none min-w-[200px] w-full xl:w-auto">
                       <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Modo Conferência</label>
                       <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200">
                            <button 
                                onClick={() => {
                                    setScanMode("geral");
                                    inputRef.current?.focus();
                                }}
                                className={`flex-1 py-1.5 text-sm font-bold flex items-center justify-center gap-1 rounded-md transition-all ${scanMode === 'geral' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Calculator className="w-4 h-4" /> Digitar Qtd.
                            </button>
                            <button 
                                onClick={() => {
                                    setScanMode("contador");
                                    inputRef.current?.focus();
                                }}
                                className={`flex-1 py-1.5 text-sm font-bold flex items-center justify-center gap-1 rounded-md transition-all ${scanMode === 'contador' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <ScanLine className="w-4 h-4" /> Bipar (+1)
                            </button>
                       </div>
                  </div>

                  {/* Bipar Barcode */}
                  <form onSubmit={handleBarcodeSubmit} className="flex-1 w-full xl:min-w-[250px] relative">
                       <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block animate-pulse">Bipe o Código de Barras (Enter)</label>
                       <input 
                           ref={inputRef}
                           type="text" 
                           value={barcodeInput}
                           onChange={(e) => setBarcodeInput(e.target.value)}
                           className="w-full px-4 py-2 border-2 border-[var(--color-primary-base, #3b82f6)] rounded-lg outline-none focus:ring-4 focus:ring-blue-500/20 text-slate-800 font-bold tracking-widest placeholder:text-slate-300 placeholder:font-normal placeholder:tracking-normal"
                           placeholder="Ex: 9788595082069"
                           autoFocus
                       />
                       <button type="submit" className="absolute right-2 top-8 p-1.5 bg-blue-100 text-blue-600 rounded pt-[2px] pb-[2px]">
                            <ArrowRight className="w-5 h-5" />
                       </button>
                  </form>

                  {/* Right Tools (CSV Import, Refresh, Local Search) */}
                  <div className="flex items-center gap-2 w-full xl:w-auto">
                       <div className="relative flex-1">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            <input 
                               type="text" 
                               value={searchTerm}
                               onChange={(e) => setSearchTerm(e.target.value)}
                               placeholder="Filtrar grid..." 
                               className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-slate-300" 
                            />
                       </div>

                       <div className="relative">
                            <input 
                                type="file" 
                                accept=".csv, .xlsx, .xls" 
                                onChange={handleFileUpload} 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                                title="Importar XLSX com Cód. Barras e Qtd"
                            />
                            <div className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg flex items-center gap-2 transition-colors cursor-pointer text-sm font-bold whitespace-nowrap">
                                 <FileSpreadsheet className="w-4 h-4" /> 
                                 <span className="hidden sm:inline">Importar</span>
                            </div>
                       </div>
                       
                       <button onClick={fetchData} className="p-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 rounded-lg transition-colors cursor-pointer" title="Recarregar contrato do Horus">
                            <RefreshCw className="w-4 h-4" />
                       </button>
                  </div>
             </div>

             {/* Modal of "Geral" Scan Mode (Enter Quantity) */}
             {pendingQuantityItem && (
                 <div className="absolute top-0 left-0 right-0 bg-white border-b-2 border-indigo-500 shadow-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 z-20 animate-in slide-in-from-top-4">
                     <div className="flex-1">
                         <div className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-1">Informe a quantidade apurada</div>
                         <div className="text-slate-800 font-bold truncate max-w-xl">{pendingQuantityItem.barcode} - {pendingQuantityItem.name}</div>
                         <div className="text-xs text-slate-500">Saldo Máximo Disponível: {pendingQuantityItem.max} un.</div>
                     </div>
                     <form onSubmit={handleModalPendingQuantitySubmit} className="flex gap-2 w-full md:w-auto">
                        <input
                            ref={pendingQtyInputRef}
                            type="number"
                            min="0"
                            max={pendingQuantityItem.max}
                            value={pendingQtyInput}
                            onChange={e => setPendingQtyInput(e.target.value)}
                            className="w-24 text-center text-lg px-4 py-2 font-black border-2 border-slate-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20"
                        />
                        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                            Confirmar (Enter)
                        </button>
                        <button type="button" onClick={() => { setPendingQuantityItem(null); inputRef.current?.focus(); }} className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold py-2 px-4 rounded-lg transition-colors">
                            Cancelar
                        </button>
                     </form>
                 </div>
             )}

             {/* Interactive Grid */}
             <div className="overflow-x-auto min-h-[400px]">
                  <table className="w-full text-left text-sm whitespace-nowrap text-slate-600">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10 box-border">
                          <tr>
                              <th className="px-4 py-3">Código / ISBN</th>
                              <th className="px-4 py-3">Título do Item</th>
                              <th className="px-4 py-3">Editora</th>
                              <th className="px-4 py-3 text-right">Preço Líq.</th>
                              <th className="px-4 py-3 text-center border-x border-slate-200 bg-slate-100/50">Saldo Estoque</th>
                              <th className={`px-4 py-3 text-center ${operationType === 'A' ? 'text-indigo-600 bg-indigo-50' : 'text-rose-600 bg-rose-50'}`}>QTD {operationType === 'A' ? 'Acerto' : 'Devolvida'}</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {filteredItems.map((item, idx) => {
                              // Find actual index in original array to mutate correctly
                              const originalIdx = items.findIndex(i => i.COD_ITEM === item.COD_ITEM);
                              const hasErrorOrDanger = item.qtdConferida > item.SALDO_ITENS;
                              const isConferido = item.qtdConferida > 0;

                              return (
                                  <tr 
                                      key={item.COD_ITEM} 
                                      className={`transition-colors hover:bg-slate-50/80 ${isConferido ? (operationType === 'A' ? 'bg-indigo-50/20' : 'bg-rose-50/20') : ''}`}
                                  >
                                      <td className="px-4 py-3 font-mono font-medium text-slate-700">{item.COD_BARRA_ITEM}</td>
                                      <td className="px-4 py-3 truncate max-w-[280px]" title={item.NOM_ITEM}>{item.NOM_ITEM}</td>
                                      <td className="px-4 py-3 truncate max-w-[150px]">{item.NOM_EDITORA}</td>
                                      <td className="px-4 py-3 text-right font-medium">R$ {item.VLR_LIQUIDO}</td>
                                      <td className="px-4 py-3 text-center font-bold border-x border-slate-100 bg-slate-50/50">
                                          {item.SALDO_ITENS}
                                      </td>
                                      <td className={`px-4 py-3 w-32 ${operationType === 'A' ? 'bg-indigo-50/10' : 'bg-rose-50/10'}`}>
                                           <div className="flex justify-center">
                                                <input 
                                                    type="number"
                                                    min="0"
                                                    max={item.SALDO_ITENS}
                                                    value={item.qtdConferida.toString()}
                                                    onChange={(e) => handleQtdChange(originalIdx, e.target.value)}
                                                    className={`w-20 text-center px-2 py-1.5 rounded border font-bold bg-white focus:outline-none focus:ring-2 ${hasErrorOrDanger ? 'border-red-500 text-red-600 focus:ring-red-500/20' : isConferido ? (operationType === 'A' ? 'border-indigo-500 text-indigo-700 focus:ring-indigo-500/20' : 'border-rose-500 text-rose-700 focus:ring-rose-500/20') : 'border-slate-300 text-slate-700 focus:ring-blue-500/20 focus:border-blue-500'}`}
                                                />
                                           </div>
                                      </td>
                                  </tr>
                              );
                          })}
                          
                          {filteredItems.length === 0 && (
                              <tr>
                                  <td colSpan={6} className="text-center py-10 text-slate-500">
                                      {searchTerm ? "Nenhum produto encontrado na pesquisa." : "Este contrato não possui itens pendentes no balanço."}
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
             </div>

             {/* Footer Control Room */}
             <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
                  
                  {/* Progress Indicator */}
                  <div className="flex items-center gap-6 divide-x divide-slate-200">
                       <div className="pr-6">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Total Itens Apurados</p>
                            <p className={`text-2xl font-black ${totalQtdApurada > 0 ? (operationType === 'A' ? 'text-indigo-600' : 'text-rose-600') : 'text-slate-400'}`}>
                                {totalQtdApurada} 
                                <span className="text-sm font-medium text-slate-400"> un.</span>
                            </p>
                       </div>
                       <div className="pl-6">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Valor Conferido</p>
                            <p className={`text-xl font-bold ${totalValorApurado > 0 ? 'text-slate-800' : 'text-slate-400'}`}>
                                R$ {totalValorApurado.toFixed(2).replace('.', ',')}
                            </p>
                       </div>
                  </div>

                  <button
                      onClick={submitBatch}
                      disabled={submitting || totalQtdApurada === 0}
                      className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white transition-all transform active:scale-95 shadow-sm 
                          ${submitting ? 'opacity-70 cursor-not-allowed bg-slate-500' : 
                            totalQtdApurada === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 
                            operationType === 'A' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                          }`}
                  >
                      {submitting ? (
                          <><Loader2 className="w-5 h-5 animate-spin"/> PROCESSANDO NO HORUS...</>
                      ) : (
                          <><CheckCircle2 className="w-5 h-5"/> Enviar Lote de {operationType === 'A' ? 'Acerto' : 'Devolução'}</>
                      )}
                  </button>
             </div>

             {/* Spreadsheet Errors Modal */}
             {showImportModal && importErrors.length > 0 && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                       <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                            <button onClick={() => setShowImportModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                                 <XCircle className="w-6 h-6" />
                            </button>
                            <div className="flex items-center gap-3 mb-4 text-orange-600">
                                 <AlertTriangle className="w-8 h-8" />
                                 <h3 className="text-xl font-bold">Aviso na Importação</h3>
                            </div>
                            <p className="text-slate-600 mb-4 text-sm">
                                Os códigos a seguir não foram localizados no saldo do contrato ou não existem. Eles foram <strong>ignorados</strong>. O restante da planilha foi importado com sucesso!
                            </p>
                            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 max-h-40 overflow-y-auto font-mono text-xs text-slate-700">
                                 {importErrors.map((code, idx) => (
                                      <div key={idx} className="mb-1">{code}</div>
                                 ))}
                            </div>
                            <button onClick={() => setShowImportModal(false)} className="w-full mt-6 bg-slate-900 text-white rounded-xl py-3 font-bold hover:bg-slate-800 transition-colors">
                                Ciente, Continuar
                            </button>
                       </div>
                  </div>
             )}

             {/* Submission Results Modal */}
             {submitResults && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                       <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                            <div className="flex items-center gap-3 mb-4">
                                 {submitResults.some(r => r.Mensagem?.includes("ERRO")) ? (
                                     <AlertTriangle className="w-8 h-8 text-orange-500" />
                                 ) : (
                                     <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                 )}
                                 <h3 className="text-xl font-bold text-slate-800">Resultado do Processamento (Horus B2B)</h3>
                            </div>
                            <p className="text-slate-600 mb-4 text-sm">
                                A requisição foi finalizada. Abaixo está o relatório retorno item a item diretamente do sistema Horus.
                            </p>
                            
                            <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-y-auto flex-1 p-0">
                                <table className="w-full text-left text-sm whitespace-nowrap text-slate-600">
                                  <thead className="bg-slate-100/50 sticky top-0 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 box-border">
                                      <tr>
                                          <th className="px-4 py-3">Cód Barras (ISBN)</th>
                                          <th className="px-4 py-3 text-center">Enviado</th>
                                          <th className="px-4 py-3 w-full">Mensagem Padrão Horus</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {submitResults.map((res, i) => {
                                          const isError = res.Mensagem?.includes("ERRO");
                                          return (
                                              <tr key={i} className={isError ? "bg-red-50/50" : "bg-emerald-50/20"}>
                                                  <td className="px-4 py-2 font-mono font-medium">{res.BARRAS_ISBN || "-"}</td>
                                                  <td className="px-4 py-2 text-center text-slate-800 font-bold">{res.QTD || "0"}</td>
                                                  <td className={`px-4 py-2 whitespace-normal leading-tight font-medium ${isError ? 'text-red-700' : 'text-emerald-700'}`}>
                                                      {res.Mensagem || "OK - PROCESSADO"}
                                                  </td>
                                              </tr>
                                          )
                                      })}
                                  </tbody>
                                </table>
                            </div>

                            <button onClick={closeResultsModal} className="w-full mt-6 bg-slate-900 text-white rounded-xl py-3 font-bold hover:bg-slate-800 transition-colors">
                                Fechar e Recarregar Contrato
                            </button>
                       </div>
                  </div>
             )}
        </div>
    );
}

"""

with open("frontend/src/components/HorusConsignmentManager.tsx", "w") as f:
    f.write(code)

