'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, Search, ClipboardCheck, Box, Package, ShieldCheck, 
  Printer, CheckCircle2, AlertTriangle, Play, Check, ChevronRight, X, Plus
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

type Branch = {
  id: number;
  nome: string;
  cnpj: string;
  cod_empresa: string;
  cod_filial: string;
};

type VolumeItem = {
  id: number;
  volume_id: number;
  isbn: string;
  name: string;
  quantity: number;
};

type Volume = {
  id: number;
  conference_id: number;
  volume_number: number;
  barcode: string;
  weight?: number;
  created_at: string;
  items: VolumeItem[];
};

type ConferenceSession = {
  id: number;
  company_id: number;
  branch_id: number;
  cod_cli: string;
  cod_pedido_origem: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  created_at: string;
  volumes: Volume[];
};

type HorusItem = {
  BARRAS_ISBN: string;
  DESCRICAO: string;
  QTD_PEDIDA: string | number;
  [key: string]: any;
};

type HorusOrder = {
  COD_PED_VENDA: string | number;
  NOM_CLI: string;
  STATUS_PEDIDO_VENDA: string;
  CIDADE?: string;
  UF?: string;
  [key: string]: any;
};

export default function OrderConferencePage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [codCli, setCodCli] = useState('');
  const [codPedidoOrigem, setCodPedidoOrigem] = useState('');

  // Execution states
  const [searching, setSearching] = useState(false);
  const [session, setSession] = useState<ConferenceSession | null>(null);
  const [horusOrder, setHorusOrder] = useState<HorusOrder | null>(null);
  const [horusItems, setHorusItems] = useState<HorusItem[]>([]);
  const [openVolume, setOpenVolume] = useState<Volume | null>(null);

  // Listing states
  const [viewMode, setViewMode] = useState<'list' | 'search' | 'conference'>('list');
  const [conferences, setConferences] = useState<any[]>([]);
  const [loadingConferences, setLoadingConferences] = useState(false);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [orderFilter, setOrderFilter] = useState<string>('');

  // Scanning mode states
  const [scanMode, setScanMode] = useState<'direct' | 'manual'>('direct');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [scannedItem, setScannedItem] = useState<HorusItem | null>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  // Scanning inputs
  const [barcodeInput, setBarcodeInput] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);

  // Printing/Label states
  const [printingVolume, setPrintingVolume] = useState<Volume | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchBranches();
    fetchConferences();
  }, []);

  async function fetchConferences() {
    setLoadingConferences(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/orders/conferences`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConferences(data);
    } catch (err) {
      toast.error('Erro ao buscar lista de conferências.');
    } finally {
      setLoadingConferences(false);
    }
  }

  async function handleResumeConference(confId: number) {
    setSearching(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/orders/conferences/${confId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao carregar detalhes da conferência.');
      }
      
      setSession(data.session);
      setSelectedBranchId(data.session.branch_id.toString());
      setCodCli(data.session.cod_cli);
      setCodPedidoOrigem(data.session.cod_pedido_origem);
      
      if (data.session.status === 'COMPLETED') {
        setHorusOrder({
          COD_PED_VENDA: data.session.cod_pedido_origem,
          NOM_CLI: 'Cliente - Conferência Finalizada',
          STATUS_PEDIDO_VENDA: 'LEX'
        });
        setHorusItems([]);
        
        // Reconstruct items list from volume details for completed orders
        const resolvedItemsMap: Record<string, { isbn: string, name: string, quantity: number }> = {};
        data.session.volumes.forEach((vol: any) => {
          vol.items.forEach((item: any) => {
            if (!resolvedItemsMap[item.isbn]) {
              resolvedItemsMap[item.isbn] = { isbn: item.isbn, name: item.name, quantity: 0 };
            }
            resolvedItemsMap[item.isbn].quantity += item.quantity;
          });
        });
        setHorusItems(Object.values(resolvedItemsMap).map(item => ({
          BARRAS_ISBN: item.isbn,
          NOM_ITEM: item.name,
          DESCRICAO: item.name,
          QTD_PEDIDA: item.quantity,
          QT_PEDIDA: item.quantity
        })));
      } else {
        setHorusOrder(data.horus_order);
        setHorusItems(data.horus_items);
        
        const vols = data.session.volumes || [];
        if (vols.length > 0) {
          setOpenVolume(vols[vols.length - 1]);
        } else {
          setOpenVolume(null);
        }
      }
      
      setViewMode('conference');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao retomar conferência.');
    } finally {
      setSearching(false);
    }
  }

  async function handleDeleteConference(confId: number) {
    const confirmDelete = confirm('Tem certeza que deseja excluir esta conferência? Esta ação não pode ser desfeita.');
    if (!confirmDelete) return;

    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/orders/conferences/${confId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Erro ao excluir conferência.');
      }
      
      toast.success('Conferência excluída com sucesso!');
      fetchConferences();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir conferência.');
    }
  }

  function handleSaveAndExit() {
    fetchConferences();
    setViewMode('list');
    setSession(null);
    setHorusOrder(null);
    setHorusItems([]);
    setOpenVolume(null);
  }

  // Auto-focus scanner input when scanning is active
  useEffect(() => {
    if (session && session.status === 'IN_PROGRESS' && openVolume) {
      scannerRef.current?.focus();
    }
  }, [session, openVolume]);

  async function fetchBranches() {
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/branches`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBranches(data);
      if (data.length > 0) {
        setSelectedBranchId(data[0].id.toString());
      }
    } catch (err) {
      toast.error('Erro ao buscar filiais do seller.');
    }
  }

  // Pure Web Audio beep helper (to prevent needing static files)
  function playBeep(type: 'success' | 'error') {
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = context.createOscillator();
      const gain = context.createGain();
      
      osc.connect(gain);
      gain.connect(context.destination);
      
      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, context.currentTime); // High pitch
        gain.gain.setValueAtTime(0.1, context.currentTime);
        osc.start();
        osc.stop(context.currentTime + 0.1);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, context.currentTime); // Low buzz
        gain.gain.setValueAtTime(0.15, context.currentTime);
        osc.start();
        osc.stop(context.currentTime + 0.3);
      }
    } catch (e) {}
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBranchId || !codCli || !codPedidoOrigem) {
      toast.error('Preencha todos os campos do filtro.');
      return;
    }
    setSearching(true);
    setSession(null);
    setHorusOrder(null);
    setHorusItems([]);
    setOpenVolume(null);

    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/logistics/orders/search?branch_id=${selectedBranchId}&cod_cli=${codCli}&cod_pedido_origem=${codPedidoOrigem}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao carregar pedido.');
      }

      setSession(data.session);
      
      // If completed, just display session details
      if (data.session.status === 'COMPLETED') {
        setHorusOrder({
          COD_PED_VENDA: data.session.cod_pedido_origem,
          NOM_CLI: 'Cliente - Conferência Finalizada',
          STATUS_PEDIDO_VENDA: 'LEX'
        });
        toast.info('Esta conferência já foi encerrada.');
      } else {
        setHorusOrder(data.horus_order);
        setHorusItems(data.horus_items);
        
        // Find if there is an active volume (last created one, or we can check items)
        const vols = data.session.volumes || [];
        if (vols.length > 0) {
          // In our simple flow, we check if the last volume is open, or we let them choose.
          // By default, let's treat the last volume as the open one.
          setOpenVolume(vols[vols.length - 1]);
        }
      }
      setViewMode('conference');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setSearching(false);
    }
  }

  async function handleOpenVolume() {
    if (!session) return;
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/orders/session/volume/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          branch_id: session.branch_id,
          cod_cli: session.cod_cli,
          cod_pedido_origem: session.cod_pedido_origem
        })
      });
      if (!res.ok) throw new Error();
      const newVol = await res.json();
      
      // Refresh session
      setSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          volumes: [...(prev.volumes || []), newVol]
        };
      });
      setOpenVolume(newVol);
      toast.success(`Caixa ${newVol.volume_number} aberta!`);
      playBeep('success');
    } catch (err) {
      toast.error('Erro ao abrir caixa.');
    }
  }

  // Get total quantity checked across ALL volumes for this ISBN
  function getItemCheckedQuantity(isbn: string): number {
    if (!session || !session.volumes) return 0;
    return session.volumes.reduce((total, vol) => {
      const item = vol.items?.find(i => i.isbn === isbn);
      return total + (item ? item.quantity : 0);
    }, 0);
  }

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!session || !openVolume) {
      toast.error('Abra uma caixa para iniciar a conferência.');
      playBeep('error');
      return;
    }

    const cleanBarcode = barcodeInput.trim();
    if (!cleanBarcode) return;

    // 1. Validate if item belongs to Horus Order Items
    const horusItem = horusItems.find(i => (i.COD_BARRA_ITEM ?? i.BARRAS_ISBN ?? i.ISBN ?? '').toString().trim() === cleanBarcode);
    if (!horusItem) {
      toast.error(`Produto com ISBN/EAN ${cleanBarcode} não pertence ao pedido.`);
      playBeep('error');
      return;
    }

    const itemName = horusItem.NOM_ITEM ?? horusItem.DESCRICAO ?? 'Produto Horus';
    const limitQty = parseInt((horusItem.QTD_PEDIDA ?? horusItem.QT_PEDIDA ?? 0).toString());
    const currentChecked = getItemCheckedQuantity(cleanBarcode);

    // If manual quantity mode and scanned item is not yet locked, lock it and focus quantity input
    if (scanMode === 'manual' && !scannedItem) {
      if (currentChecked >= limitQty) {
        toast.error(`Quantidade limite (${limitQty}) já alcançada para o item: ${itemName}.`);
        playBeep('error');
        return;
      }
      setScannedItem(horusItem);
      setTimeout(() => {
        quantityRef.current?.focus();
        quantityRef.current?.select();
      }, 50);
      return;
    }

    // Determine quantity to check
    let qtyToCheck = 1;
    if (scanMode === 'manual') {
      const parsedQty = parseInt(quantityInput);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        toast.error('Informe uma quantidade válida maior que zero.');
        playBeep('error');
        return;
      }
      qtyToCheck = parsedQty;
    }

    // 2. Validate quantity limits
    if (currentChecked + qtyToCheck > limitQty) {
      toast.error(`Quantidade informada (${qtyToCheck}) excede o limite restante (${limitQty - currentChecked}) para o item: ${itemName}.`);
      playBeep('error');
      return;
    }

    // 3. Send to Horus & Database
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/orders/session/volume/item?volume_id=${openVolume.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          isbn: cleanBarcode,
          name: itemName,
          quantity: qtyToCheck,
          cod_item: (horusItem.COD_ITEM ?? '').toString(),
          cod_ped_venda: (horusOrder?.COD_PED_VENDA ?? '').toString()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao registrar conferência.');
      }

      // Play success synth sound!
      playBeep('success');
      toast.success(`Conferido: ${qtyToCheck}x ${itemName}`);
      if (data.horus_response) {
        toast.info(`Retorno Horus: ${JSON.stringify(data.horus_response)}`, { duration: 5000 });
      }

      // Reset scanning states
      setBarcodeInput('');
      setQuantityInput('1');
      setScannedItem(null);

      // Update session state
      setSession(data.session);
      // Update open volume reference
      const updatedVol = data.session.volumes.find((v: Volume) => v.id === openVolume.id);
      if (updatedVol) {
        setOpenVolume(updatedVol);
      }

      setTimeout(() => {
        scannerRef.current?.focus();
      }, 50);

    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar item.');
      playBeep('error');
    }
  }

  async function handleCloseVolume(vol: Volume) {
    const weightStr = prompt(`Informe o peso da Caixa ${vol.volume_number} em KG (ex: 4.5):`);
    if (weightStr === null) return; // User cancelled
    
    const weight = parseFloat(weightStr.replace(',', '.'));
    if (isNaN(weight) || weight <= 0) {
      toast.error('Peso inválido. Deve ser um número maior que zero.');
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/orders/session/volume/close?volume_id=${vol.id}&weight=${weight}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Erro ao fechar volume.');
      }
      
      toast.success(`Caixa ${vol.volume_number} finalizada com peso ${weight} KG!`);
      
      // Update local session volumes weight to avoid having to reload
      setSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          volumes: prev.volumes.map(v => v.id === vol.id ? { ...v, weight } : v)
        };
      });
      
      // Open label dialog
      setPrintingVolume({ ...vol, weight });
      setOpenVolume(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fechar volume.');
    }
  }

  async function handleFinalizeSession() {
    if (!session) return;
    
    const codPedVenda = horusOrder?.COD_PED_VENDA;
    if (!codPedVenda) {
      toast.error('Código do pedido de venda do Horus não encontrado. Não é possível finalizar.');
      return;
    }
    
    // Check if there are missing items
    let missingCount = 0;
    horusItems.forEach(item => {
      const ped = parseInt((item.QTD_PEDIDA ?? item.QT_PEDIDA ?? 0).toString());
      const itemBarcode = item.COD_BARRA_ITEM ?? item.BARRAS_ISBN ?? item.ISBN ?? '';
      const conf = getItemCheckedQuantity(itemBarcode);
      if (conf < ped) {
        missingCount += (ped - conf);
      }
    });

    if (missingCount > 0) {
      const confirmEnd = confirm(`Atenção: Ainda restam ${missingCount} itens pendentes de conferência. Deseja encerrar mesmo assim?`);
      if (!confirmEnd) return;
    } else {
      const confirmEnd = confirm('Deseja encerrar e finalizar a conferência deste pedido?');
      if (!confirmEnd) return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/orders/session/finalize?conference_id=${session.id}&cod_ped_venda=${codPedVenda}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Erro ao finalizar conferência.');
      }
      
      toast.success('Conferência finalizada com sucesso!');
      setSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'COMPLETED'
        };
      });
      setOpenVolume(null);
      fetchConferences();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao finalizar conferência.');
    }
  }

  // Handle label print layout rendering
  function triggerPrint(vol: Volume) {
    const branch = branches.find(b => b.id.toString() === selectedBranchId);
    
    // Create iframe or raw HTML print page
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    const itemsRows = vol.items.map(item => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="font-family: monospace; font-size: 8px; padding: 2px 0; white-space: nowrap;">${item.isbn}</td>
        <td style="font-size: 8px; padding: 2px 4px 2px 0; line-height: 1.1; word-break: break-all;">${item.name}</td>
        <td style="text-align: right; font-size: 8px; padding: 2px 0; font-weight: bold;">${item.quantity}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <html>
        <head>
          <title>Etiqueta de Caixa - Volume ${vol.volume_number}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
          <style>
            @page { size: 100mm 150mm; margin: 0; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10px;
              color: #000;
              margin: 10px;
              padding: 0;
            }
            .header {
              border-bottom: 2px dashed #000;
              padding-bottom: 4px;
              margin-bottom: 6px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 2px;
            }
            .title {
              font-size: 13px;
              font-weight: bold;
              text-transform: uppercase;
              text-align: center;
              border: 1px solid #000;
              padding: 3px;
              margin-bottom: 6px;
            }
            .destinatario {
              border: 1px solid #000;
              padding: 4px;
              margin-bottom: 6px;
            }
            .table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 6px;
              margin-bottom: 8px;
            }
            .table th {
              border-bottom: 1.5px solid #000;
              text-align: left;
              font-size: 8px;
              padding: 2px 0;
            }
            .barcode-container {
              text-align: center;
              margin-top: 10px;
              padding: 6px;
              border-top: 2px dashed #000;
            }
            .barcode-text {
              font-size: 11px;
              font-weight: bold;
              letter-spacing: 2px;
              margin-top: 2px;
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="title">Volume: ${vol.volume_number.toString().padStart(2, '0')}</div>
          
          <div class="header">
            <strong>REMETENTE (FILIAL):</strong><br/>
            ${branch?.nome || 'Matriz'}<br/>
            CNPJ: ${branch?.cnpj || '-'}<br/>
          </div>
          
          <div class="destinatario">
            <strong>DESTINATÁRIO:</strong><br/>
            ${horusOrder?.NOM_CLI || 'Cliente B2B'}<br/>
          </div>

          <div class="row">
            <span><strong>PEDIDO ORIGEM:</strong> ${session?.cod_pedido_origem}</span>
            <span><strong>VOLUME ID:</strong> ${vol.id}</span>
          </div>

          <div class="row">
            <span><strong>PESO:</strong> ${vol.weight ? vol.weight.toFixed(3) + ' KG' : '-'}</span>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th style="width: 35%;">ISBN</th>
                <th style="width: 50%;">Item</th>
                <th style="width: 15%; text-align: right;">Qtd</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="barcode-container">
            <!-- Representing the box barcode -->
            <div style="font-size: 30px; font-family: 'Libre Barcode 39', monospace; margin: 5px 0;">*${vol.barcode}*</div>
            <div class="barcode-text">${vol.barcode}</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  const filteredConferences = conferences.filter(conf => {
    const matchesStatus = statusFilter === 'ALL' || 
      (statusFilter === 'IN_PROGRESS' && conf.status === 'IN_PROGRESS') ||
      (statusFilter === 'COMPLETED' && conf.status === 'COMPLETED');
    
    const matchesOrder = orderFilter.trim() === '' || 
      conf.cod_pedido_origem.toLowerCase().includes(orderFilter.toLowerCase());
      
    return matchesStatus && matchesOrder;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-12 bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-indigo-500" /> Conferência de Expedição (Horus)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pesquise o pedido de expedição, abra uma caixa, bipe o código de barras dos produtos e emita as etiquetas de volume.
          </p>
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="p-6 max-w-6xl space-y-6">
          <div className="flex justify-between items-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">Conferências Realizadas</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Histórico e sessões de conferência de expedição.</p>
            </div>
            <button
              onClick={() => {
                setCodCli('');
                setCodPedidoOrigem('');
                setSession(null);
                setHorusOrder(null);
                setHorusItems([]);
                setOpenVolume(null);
                setViewMode('search');
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Nova Conferência
            </button>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Filtrar por Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              >
                <option value="ALL">Todos os status</option>
                <option value="IN_PROGRESS">Em Andamento</option>
                <option value="COMPLETED">Encerrada</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Buscar por Número do Pedido</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Digite o número do pedido..."
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {loadingConferences ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                Carregando conferências...
              </div>
            ) : filteredConferences.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                {conferences.length === 0 
                  ? 'Nenhuma conferência iniciada ainda. Clique em "Nova Conferência" para começar.'
                  : 'Nenhuma conferência corresponde aos filtros selecionados.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase bg-slate-50/10">
                      <th className="px-6 py-3">Pedido Origem</th>
                      <th className="px-6 py-3">Cliente</th>
                      <th className="px-6 py-3">Filial</th>
                      <th className="px-6 py-3 text-center">Status</th>
                      <th className="px-6 py-3 text-center">Volumes</th>
                      <th className="px-6 py-3 text-center">Itens Conferidos</th>
                      <th className="px-6 py-3">Última Atualização</th>
                      <th className="px-6 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConferences.map(conf => {
                      const isCompleted = conf.status === 'COMPLETED';
                      return (
                        <tr key={conf.id} className="border-b border-slate-100 dark:border-slate-800/40 text-sm hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                          <td className="px-6 py-3.5 font-semibold text-slate-850 dark:text-slate-200">
                            #{conf.cod_pedido_origem}
                          </td>
                          <td className="px-6 py-3.5 text-slate-600 dark:text-slate-400">
                            {conf.cod_cli}
                          </td>
                          <td className="px-6 py-3.5 text-slate-600 dark:text-slate-400">
                            {conf.branch_name}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-full ${
                              isCompleted 
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' 
                                : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                            }`}>
                              {isCompleted ? 'Encerrada' : 'Em Andamento'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-300">
                            {conf.total_volumes}
                          </td>
                          <td className="px-6 py-3.5 text-center font-bold text-slate-750 dark:text-slate-200">
                            {conf.total_items}
                          </td>
                          <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">
                            {new Date(conf.updated_at).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-3.5 text-right flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleResumeConference(conf.id)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                                isCompleted 
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                              }`}
                            >
                              {isCompleted ? 'Ver Detalhes' : 'Continuar'}
                            </button>
                            {!isCompleted && (
                              <button
                                onClick={() => handleDeleteConference(conf.id)}
                                className="px-3 py-1.5 text-xs font-bold text-red-650 hover:text-white hover:bg-red-600 border border-red-200 dark:border-red-500/20 hover:border-red-600 dark:hover:bg-red-500/10 rounded-xl transition flex items-center gap-1"
                              >
                                Excluir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'search' && (
        <div className="p-6 max-w-6xl space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 dark:text-white text-base mb-4">Iniciar Nova Conferência</h3>
            <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Filial do Seller</label>
                <select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  disabled={searching || !!session}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Código Cliente (Horus)</label>
                <input
                  type="text"
                  value={codCli}
                  onChange={e => setCodCli(e.target.value)}
                  placeholder="Ex: 200664962"
                  disabled={searching || !!session}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Número Pedido Origem</label>
                <input
                  type="text"
                  value={codPedidoOrigem}
                  onChange={e => setCodPedidoOrigem(e.target.value)}
                  placeholder="Ex: 500081"
                  disabled={searching || !!session}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={searching || !selectedBranchId || !codCli || !codPedidoOrigem}
                  className="w-full px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition flex items-center justify-center gap-2"
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )} Buscar Pedido
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-355 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-xl transition"
                >
                  Voltar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewMode === 'conference' && session && (
        <div className="p-6 max-w-6xl space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Order details & scanning */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Order Info & Scanning Section */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      Pedido #{session.cod_pedido_origem}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cliente: {horusOrder?.NOM_CLI}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveAndExit}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-lg transition mr-1"
                    >
                      {session.status === 'COMPLETED' ? 'Voltar para Lista' : 'Salvar e Sair'}
                    </button>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      session.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10'
                    }`}>
                      {session.status === 'COMPLETED' ? 'Encerrado' : 'Em Andamento'}
                    </span>
                  </div>
                </div>

                {session.status === 'IN_PROGRESS' ? (
                  <div className="space-y-4">
                    {openVolume ? (
                      // Scanner Active
                      <div className="bg-indigo-50/50 dark:bg-indigo-500/5 rounded-xl p-4 border border-indigo-100/50 dark:border-indigo-500/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setScanMode('direct');
                                setScannedItem(null);
                                setBarcodeInput('');
                                setQuantityInput('1');
                                setTimeout(() => scannerRef.current?.focus(), 50);
                              }}
                              className={`px-3 py-1 text-xs font-bold rounded-md transition ${scanMode === 'direct' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                            >
                              Direto (1x1)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setScanMode('manual');
                                setScannedItem(null);
                                setBarcodeInput('');
                                setQuantityInput('1');
                                setTimeout(() => scannerRef.current?.focus(), 50);
                              }}
                              className={`px-3 py-1 text-xs font-bold rounded-md transition ${scanMode === 'manual' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                            >
                              Com Quantidade
                            </button>
                          </div>
                          <span className="text-xs font-mono font-bold text-slate-400">{openVolume.barcode}</span>
                        </div>
                        <form onSubmit={handleScanSubmit} className="flex gap-2">
                          <input
                            ref={scannerRef}
                            type="text"
                            value={barcodeInput}
                            onChange={e => setBarcodeInput(e.target.value)}
                            disabled={scannedItem !== null}
                            placeholder={scannedItem ? "Aguardando quantidade..." : "Aponte o leitor de código de barras ou digite o ISBN..."}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-indigo-200 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75"
                            onKeyDown={e => {
                              if (e.key === 'Escape') {
                                setScannedItem(null);
                                setBarcodeInput('');
                                setQuantityInput('1');
                                setTimeout(() => scannerRef.current?.focus(), 50);
                              }
                            }}
                          />
                          {scanMode === 'manual' && scannedItem && (
                            <input
                              ref={quantityRef}
                              type="number"
                              min="1"
                              value={quantityInput}
                              onChange={e => setQuantityInput(e.target.value)}
                              placeholder="Qtd..."
                              className="w-24 text-center px-3 py-2 text-sm rounded-xl border border-indigo-200 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              onKeyDown={e => {
                                if (e.key === 'Escape') {
                                  setScannedItem(null);
                                  setBarcodeInput('');
                                  setQuantityInput('1');
                                  setTimeout(() => scannerRef.current?.focus(), 50);
                                }
                              }}
                            />
                          )}
                          <button
                            type="submit"
                            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition flex items-center gap-1.5 shrink-0"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" /> Confirmar
                          </button>
                        </form>
                        {scannedItem && (
                          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                            Produto: {scannedItem.NOM_ITEM ?? scannedItem.DESCRICAO}. Informe a quantidade e pressione Enter (Esc para cancelar).
                          </p>
                        )}
                        <p className="text-xxs text-slate-400">
                          * Dica: Mantenha o cursor focado no input de código de barras para bipar sequencialmente.
                        </p>
                      </div>
                    ) : (
                      // Open Box Trigger
                      <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        <Box className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700 mb-3 animate-pulse" />
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Nenhuma caixa aberta.</p>
                        <p className="text-xs text-slate-400 mb-4 mt-0.5">Abra uma caixa para registrar os bipes deste volume.</p>
                        <button
                          onClick={handleOpenVolume}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition"
                        >
                          <Plus className="h-4 w-4" /> Abrir Caixa / Volume
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 rounded-xl p-4 flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Conferência Finalizada</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Esta conferência foi totalmente auditada e fechada. Novas bipagens estão desativadas. Você pode reimprimir etiquetas de qualquer volume à direita.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Itens do Pedido ({horusItems.length})
                  </h3>
                </div>
                {horusItems.length === 0 && session.status !== 'COMPLETED' ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    Carregando itens...
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase bg-slate-50/10">
                        <th className="px-6 py-3">Produto</th>
                        <th className="px-6 py-3 text-center">Pedida</th>
                        <th className="px-6 py-3 text-center">Conferida</th>
                        <th className="px-6 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {horusItems.map(item => {
                        const pedQty = parseInt((item.QTD_PEDIDA ?? item.QT_PEDIDA ?? 0).toString());
                        const itemBarcode = item.COD_BARRA_ITEM ?? item.BARRAS_ISBN ?? item.ISBN ?? '';
                        const itemName = item.NOM_ITEM ?? item.DESCRICAO ?? 'Produto Horus';
                        const confQty = getItemCheckedQuantity(itemBarcode);
                        const isDone = confQty >= pedQty;
                        
                        return (
                          <tr key={itemBarcode} className={`border-b border-slate-100 dark:border-slate-800/40 text-sm ${isDone ? 'opacity-50 bg-emerald-500/5' : ''}`}>
                            <td className="px-6 py-3.5">
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{itemName}</p>
                              <p className="text-xs font-mono text-slate-400 mt-0.5">{itemBarcode}</p>
                            </td>
                            <td className="px-6 py-3.5 text-center font-bold text-slate-700 dark:text-slate-300">
                              {pedQty}
                            </td>
                            <td className="px-6 py-3.5 text-center font-bold text-indigo-600 dark:text-indigo-400">
                              {confQty}
                            </td>
                            <td className="px-6 py-3.5 text-right font-bold">
                              {isDone ? (
                                <span className="text-emerald-500 flex items-center justify-end gap-1"><CheckCircle2 className="h-4 w-4" /> OK</span>
                              ) : confQty > 0 ? (
                                <span className="text-indigo-500">Conferindo</span>
                              ) : (
                                <span className="text-slate-400">Pendente</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Right Column: Active boxes / volumes list */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Volumes / Caixas</h3>
                  {session.status === 'IN_PROGRESS' && (
                    <button
                      onClick={handleFinalizeSession}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-sm"
                    >
                      Finalizar Conferência
                    </button>
                  )}
                </div>

                {(!session.volumes || session.volumes.length === 0) ? (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhum volume registrado para esta conferência.</p>
                ) : (
                  <div className="space-y-3">
                    {session.volumes.map(vol => {
                      const isOpen = openVolume?.id === vol.id;
                      const totalItemsCount = vol.items?.reduce((t, i) => t + i.quantity, 0) || 0;
                      
                      return (
                        <div 
                          key={vol.id} 
                          className={`p-4 border rounded-xl transition ${
                            isOpen 
                              ? 'border-indigo-500 bg-indigo-500/5' 
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold uppercase text-slate-700 dark:text-slate-350">
                              Caixa #{vol.volume_number}
                            </p>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                              {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'}
                            </span>
                          </div>
                          <p className="text-xxs font-mono text-slate-400 mb-3">{vol.barcode}</p>
                          
                          {/* List items inside this volume */}
                          {vol.items && vol.items.length > 0 && (
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-2 mb-3 space-y-1.5 max-h-40 overflow-y-auto">
                              {vol.items.map(item => (
                                <div key={item.id} className="flex justify-between text-xxs text-slate-500 dark:text-slate-400">
                                  <span className="truncate max-w-[150px]">{item.name}</span>
                                  <span className="font-bold shrink-0">{item.quantity}x</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => triggerPrint(vol)}
                              className="w-full py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition flex items-center justify-center gap-1"
                            >
                              <Printer className="h-3.5 w-3.5" /> Etiqueta
                            </button>
                            {isOpen && session.status === 'IN_PROGRESS' && (
                              <button
                                onClick={() => handleCloseVolume(vol)}
                                className="w-full py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition flex items-center justify-center gap-1"
                              >
                                Fechar Caixa
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Label Printing Modal (preview) */}
      <AnimatePresence>
        {printingVolume && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden shadow-xl"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">Etiqueta Pronta</h3>
                <button onClick={() => setPrintingVolume(null)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full">
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 space-y-2 text-xs">
                  <p><strong>Remetente:</strong> {branches.find(b => b.id.toString() === selectedBranchId)?.nome}</p>
                  <p><strong>Destinatário:</strong> {horusOrder?.NOM_CLI}</p>
                  <p><strong>Volume:</strong> {printingVolume.volume_number}</p>
                  <p><strong>Itens na Caixa:</strong> {printingVolume.items?.reduce((t, i) => t + i.quantity, 0)}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPrintingVolume(null)}
                    className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 rounded-xl transition"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => {
                      triggerPrint(printingVolume);
                      setPrintingVolume(null);
                    }}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition flex items-center justify-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> Imprimir Etiqueta
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
