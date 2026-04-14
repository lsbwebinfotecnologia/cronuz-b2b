'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface PrintPoint {
  id: number;
  name: string;
  document_type: string;
  is_service: boolean;
  is_electronic: boolean;
  current_number: number;
  serie?: string;
  is_active: boolean;
}

export function PrintPointsTab() {
  const [points, setPoints] = useState<PrintPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PrintPoint | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState('NFSE');
  const [isService, setIsService] = useState(true);
  const [isElectronic, setIsElectronic] = useState(true);
  const [currentNumber, setCurrentNumber] = useState(1);
  const [serie, setSerie] = useState('');

  const fetchPoints = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/print-points`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPoints(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPoints();
  }, []);

  const openNew = () => {
    setEditingPoint(null);
    setName('');
    setDocumentType('NFSE');
    setIsService(true);
    setIsElectronic(true);
    setCurrentNumber(1);
    setSerie('');
    setShowModal(true);
  };

  const openEdit = (p: PrintPoint) => {
    setEditingPoint(p);
    setName(p.name);
    setDocumentType(p.document_type);
    setIsService(p.is_service);
    setIsElectronic(p.is_electronic);
    setCurrentNumber(p.current_number);
    setSerie(p.serie || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    const payload = {
      name,
      document_type: documentType,
      is_service: isService,
      is_electronic: isElectronic,
      current_number: currentNumber,
      serie: serie || null,
      is_active: true
    };

    try {
      const url = editingPoint 
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/print-points/${editingPoint.id}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/print-points`;
        
      const method = editingPoint ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Falha ao salvar o ponto de impressão.');
      toast.success('Ponto de Impressão salvo sucesso!');
      setShowModal(false);
      fetchPoints();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente desativar esta série?')) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/print-points/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Série desativada.');
        fetchPoints();
      }
    } catch (e) {
      toast.error('Erro ao excluir série.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            Pontos de Impressão / Séries
          </h2>
          <p className="text-slate-500 text-sm mt-1">Gerencie as numerações de NFS-e, NF-e, Recibos de sua empresa.</p>
        </div>
        <button 
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary-base)] text-white rounded-lg hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" /> Novo Ponto
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary-base)]" /></div>
        ) : points.filter(p => p.is_active).length === 0 ? (
           <div className="p-10 text-center text-slate-500">Nenhum Ponto de Impressão criado. Crie um acima.</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
              <tr>
                <th className="px-6 py-4">Nome</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Série</th>
                <th className="px-6 py-4">Numeração Atual</th>
                <th className="px-6 py-4">Serviço/Eletrônica?</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {points.filter(p => p.is_active).map(p => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{p.name}</td>
                  <td className="px-6 py-4 font-medium">{p.document_type}</td>
                  <td className="px-6 py-4 text-slate-500">{p.serie || '-'}</td>
                  <td className="px-6 py-4 text-[var(--color-primary-base)] font-bold">{p.current_number}</td>
                  <td className="px-6 py-4">
                     <span className="inline-flex gap-2">
                        {p.is_service ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs">Serviços</span> : <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs">Produtos</span>}
                        {p.is_electronic && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs">Eletrônica</span>}
                     </span>
                  </td>
                  <td className="px-6 py-4 flex justify-end gap-2">
                     <button onClick={() => openEdit(p)} className="p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-slate-100 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>
                     <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-4">{editingPoint ? 'Editar Ponto' : 'Novo Ponto de Impressão'}</h3>
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Ponto</label>
                  <input required placeholder="Série A - Nacional" className="w-full px-3 py-2 border rounded-lg" value={name} onChange={e => setName(e.target.value)} />
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Documento</label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={documentType} onChange={e => setDocumentType(e.target.value)}>
                     <option value="NFSE">NFS-e (Serviço)</option>
                     <option value="NFE">NF-e (Produto)</option>
                     <option value="NFCE">NFC-e (Consumidor)</option>
                     <option value="FATURA">Fatura / Recibo Genérico</option>
                  </select>
               </div>
               <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                     <input type="checkbox" checked={isService} onChange={e => setIsService(e.target.checked)} className="rounded text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)]" />
                     Nota de Serviço?
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                     <input type="checkbox" checked={isElectronic} onChange={e => setIsElectronic(e.target.checked)} className="rounded text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)]" />
                     Eletrônica?
                  </label>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Código da Série</label>
                    <input placeholder="Ex: 900" className="w-full px-3 py-2 border rounded-lg" value={serie} onChange={e => setSerie(e.target.value)} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Próximo Número a Emitir</label>
                    <input required type="number" min="1" className="w-full px-3 py-2 border rounded-lg" value={currentNumber} onChange={e => setCurrentNumber(Number(e.target.value))} />
                 </div>
               </div>
               
               <div className="flex gap-3 justify-end mt-6">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">Cancelar</button>
                  <button type="button" onClick={(e) => handleSave(e)} className="px-4 py-2 bg-[var(--color-primary-base)] text-white font-medium rounded-lg hover:brightness-110 transition-all">Salvar</button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
