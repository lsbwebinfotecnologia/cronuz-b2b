'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2, Plus, Pencil, Trash2, Upload, ShieldCheck,
  ShieldX, X, Loader2, Check, MapPin, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

interface Branch {
  id: number;
  nome: string;
  cnpj: string | null;
  cod_empresa: string;
  cod_filial: string;
  active: boolean;
  sefaz_environment: 'HOMOLOGACAO' | 'PRODUCAO';
  uf: string;
  cod_local_estoque: string[];
  has_sefaz_cert: boolean;
  sefaz_ultimo_nsu: string | null;
}

const emptyForm = {
  nome: '',
  cnpj: '',
  cod_empresa: '',
  cod_filial: '',
  active: true,
  sefaz_environment: 'HOMOLOGACAO' as 'HOMOLOGACAO' | 'PRODUCAO',
  uf: 'SP',
  cod_local_estoque: [] as string[],
};

export function SefazBranchesTab() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [localInput, setLocalInput] = useState('');

  // Cert upload
  const [showCertModal, setShowCertModal] = useState(false);
  const [certBranchId, setCertBranchId] = useState<number | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [uploadingCert, setUploadingCert] = useState(false);

  useEffect(() => { fetchBranches(); }, []);

  async function fetchBranches() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/sefaz/branches`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setBranches(await res.json());
      else toast.error('Erro ao carregar filiais.');
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({ ...emptyForm });
    setLocalInput('');
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(b: Branch) {
    setForm({
      nome: b.nome,
      cnpj: b.cnpj || '',
      cod_empresa: b.cod_empresa,
      cod_filial: b.cod_filial,
      active: b.active,
      sefaz_environment: b.sefaz_environment,
      uf: b.uf || 'SP',
      cod_local_estoque: b.cod_local_estoque || [],
    });
    setLocalInput('');
    setEditingId(b.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `${API}/sefaz/branches/${editingId}` : `${API}/sefaz/branches`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao salvar filial.');
        return;
      }
      toast.success(editingId ? 'Filial atualizada!' : 'Filial criada com sucesso!');
      setShowModal(false);
      await fetchBranches();
    } catch {
      toast.error('Erro de conexão ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, nome: string) {
    if (!confirm(`Remover a filial "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`${API}/sefaz/branches/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok || res.status === 204) {
        toast.success('Filial removida.');
        fetchBranches();
      } else {
        toast.error('Erro ao remover filial.');
      }
    } catch {
      toast.error('Erro de conexão.');
    }
  }

  function openCertUpload(id: number) {
    setCertBranchId(id);
    setCertFile(null);
    setCertPassword('');
    setShowCertModal(true);
  }

  async function handleCertUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!certFile || !certBranchId) return;
    setUploadingCert(true);
    try {
      const fd = new FormData();
      fd.append('file', certFile);
      fd.append('password', certPassword);
      const res = await fetch(`${API}/sefaz/branches/${certBranchId}/upload-cert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (res.ok) {
        toast.success('Certificado carregado com sucesso!');
        setShowCertModal(false);
        fetchBranches();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao enviar certificado.');
      }
    } catch {
      toast.error('Erro de conexão ao enviar certificado.');
    } finally {
      setUploadingCert(false);
    }
  }

  async function handleRemoveCert(id: number) {
    if (!confirm('Remover o certificado desta filial?')) return;
    try {
      const res = await fetch(`${API}/sefaz/branches/${id}/cert`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        toast.success('Certificado removido.');
        fetchBranches();
      }
    } catch {
      toast.error('Erro ao remover certificado.');
    }
  }

  function addLocalEstoque() {
    const val = localInput.trim();
    if (!val) return;
    if (form.cod_local_estoque.includes(val)) { toast.error('Código já adicionado.'); return; }
    setForm(p => ({ ...p, cod_local_estoque: [...p.cod_local_estoque, val] }));
    setLocalInput('');
  }

  // ── Validação CNPJ ──────────────────────────────────────────────
  function validateCnpj(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    if (!digits) return true; // campo opcional
    if (digits.length !== 14) return false;
    if (/^(\d)\1+$/.test(digits)) return false; // todos iguais

    const calcDv = (seq: string, weights: number[]) => {
      const total = seq.split('').reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
      const rem = total % 11;
      return rem < 2 ? 0 : 11 - rem;
    };
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return calcDv(digits.slice(0, 12), w1) === parseInt(digits[12])
        && calcDv(digits.slice(0, 13), w2) === parseInt(digits[13]);
  }

  const cnpjDigits = form.cnpj.replace(/\D/g, '');
  const cnpjIsEmpty  = cnpjDigits.length === 0;
  const cnpjComplete = cnpjDigits.length === 14;
  const cnpjValid    = cnpjIsEmpty || (cnpjComplete && validateCnpj(form.cnpj));
  const cnpjError    = !cnpjIsEmpty && !cnpjValid;

  const formatCnpj = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Empresas / Filiais SEFAZ</h2>
          <p className="text-slate-500 text-sm mt-1">
            Configure as filiais para download de NF-e e NFC-e. Cada filial precisa de um certificado digital .pfx.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/settings/sefaz-download"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium whitespace-nowrap"
          >
            <Download className="w-4 h-4" /> Baixar XMLs
          </Link>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary-base)] text-white rounded-lg hover:brightness-110 transition-all text-sm font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Nova Filial
          </button>
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary-base)]" />
          </div>
        ) : branches.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Building2 className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-700 font-semibold text-base">Nenhuma filial cadastrada</p>
            <p className="text-slate-400 text-sm mt-1 max-w-sm">
              Cadastre suas empresas e filiais para consultar e baixar XMLs diretamente da SEFAZ.
            </p>
            <button
              onClick={openCreate}
              className="mt-5 flex items-center gap-2 px-4 py-2 bg-[var(--color-primary-base)] text-white rounded-lg hover:brightness-110 transition-all text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Cadastrar Primeira Filial
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {branches.map(b => (
              <div key={b.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors">

                {/* Ícone ambiente */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  b.sefaz_environment === 'PRODUCAO'
                    ? 'bg-indigo-50'
                    : 'bg-amber-50'
                }`}>
                  <Building2 className={`w-5 h-5 ${
                    b.sefaz_environment === 'PRODUCAO' ? 'text-indigo-500' : 'text-amber-500'
                  }`} />
                </div>

                {/* Info principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{b.nome}</span>

                    {/* Badge ambiente */}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      b.sefaz_environment === 'PRODUCAO'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {b.sefaz_environment === 'PRODUCAO' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}
                    </span>

                    {/* Badge UF */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
                      <MapPin className="w-3 h-3" />{b.uf}
                    </span>

                    {/* Badge inativo */}
                    {!b.active && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                        Inativa
                      </span>
                    )}
                  </div>

                  {/* Detalhes secundários */}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    {b.cnpj && (
                      <span className="text-xs text-slate-400">
                        CNPJ: <span className="text-slate-600 font-medium">{b.cnpj}</span>
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      Empresa: <span className="text-slate-600 font-medium">{b.cod_empresa}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      Filial: <span className="text-slate-600 font-medium">{b.cod_filial}</span>
                    </span>
                    {b.cod_local_estoque?.length > 0 && (
                      <span className="text-xs text-slate-400">
                        Locais: <span className="text-slate-600 font-medium">{b.cod_local_estoque.join(', ')}</span>
                      </span>
                    )}
                    {/* NSU: só mostra se já tiver um valor real (> 0) */}
                    {b.sefaz_ultimo_nsu && b.sefaz_ultimo_nsu.replace(/^0+/, '') !== '' && (
                      <span className="text-xs text-slate-400">
                        Último NSU: <span className="text-indigo-600 font-medium font-mono">{b.sefaz_ultimo_nsu}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {b.has_sefaz_cert ? (
                    <button
                      onClick={() => handleRemoveCert(b.id)}
                      title="Certificado OK — clique para remover"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Cert. OK
                    </button>
                  ) : (
                    <button
                      onClick={() => openCertUpload(b.id)}
                      title="Clique para enviar certificado"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      <ShieldX className="w-3.5 h-3.5" /> Sem Cert.
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(b)}
                    className="p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-slate-100 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b.id, b.nome)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          Modal Criar / Editar
      ══════════════════════════════════════════ */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingId ? 'Editar Filial' : 'Nova Filial SEFAZ'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Filial *</label>
                <input
                  required
                  value={form.nome}
                  onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Matriz SP"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* CNPJ + UF */}
              <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">CNPJ</label>
                    <div className="relative">
                      <input
                        value={form.cnpj}
                        onChange={e => setForm(p => ({ ...p, cnpj: formatCnpj(e.target.value) }))}
                        placeholder="00.000.000/0000-00"
                        className={`w-full px-3 py-2 border rounded-lg text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 pr-8 ${
                          cnpjError
                            ? 'border-red-400 focus:ring-red-200 bg-red-50'
                            : cnpjComplete && cnpjValid
                              ? 'border-emerald-400 focus:ring-emerald-200 bg-emerald-50'
                              : 'border-slate-200 focus:ring-indigo-300'
                        }`}
                      />
                      {/* Ícone de status */}
                      {cnpjComplete && (
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs">
                          {cnpjValid ? '✅' : '❌'}
                        </span>
                      )}
                    </div>
                    {cnpjError && cnpjDigits.length < 14 && (
                      <p className="text-xs text-red-500 mt-1">
                        CNPJ incompleto ({cnpjDigits.length}/14 dígitos)
                      </p>
                    )}
                    {cnpjError && cnpjDigits.length === 14 && (
                      <p className="text-xs text-red-500 mt-1">
                        CNPJ inválido — verifique os dígitos verificadores
                      </p>
                    )}
                    {cnpjComplete && cnpjValid && (
                      <p className="text-xs text-emerald-600 mt-1">CNPJ válido ✓</p>
                    )}
                  </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> UF *</span>
                  </label>
                  <select
                    required
                    value={form.uf}
                    onChange={e => setForm(p => ({ ...p, uf: e.target.value }))}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-[72px]"
                  >
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>

              {/* Ambiente */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ambiente *</label>
                <div className="flex gap-3">
                  {(['HOMOLOGACAO', 'PRODUCAO'] as const).map(env => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, sefaz_environment: env }))}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${
                        form.sefaz_environment === env
                          ? env === 'PRODUCAO'
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        form.sefaz_environment === env
                          ? env === 'PRODUCAO' ? 'bg-indigo-500' : 'bg-amber-400'
                          : 'bg-slate-300'
                      }`} />
                      {env === 'PRODUCAO' ? 'Produção' : 'Homologação'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Empresa + Filial */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código Empresa (ERP) *</label>
                  <input
                    required
                    value={form.cod_empresa}
                    onChange={e => setForm(p => ({ ...p, cod_empresa: e.target.value }))}
                    placeholder="Ex: 1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código Filial (ERP) *</label>
                  <input
                    required
                    value={form.cod_filial}
                    onChange={e => setForm(p => ({ ...p, cod_filial: e.target.value }))}
                    placeholder="Ex: 1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              {/* Locais de estoque */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Códigos de Local de Estoque</label>
                <div className="flex gap-2">
                  <input
                    value={localInput}
                    onChange={e => setLocalInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLocalEstoque(); } }}
                    placeholder="Ex: 001 — Enter para adicionar"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button
                    type="button"
                    onClick={addLocalEstoque}
                    className="px-3 py-2 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {form.cod_local_estoque.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.cod_local_estoque.map(c => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md"
                      >
                        {c}
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, cod_local_estoque: p.cod_local_estoque.filter(x => x !== c) }))}
                          className="text-indigo-400 hover:text-indigo-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Toggle ativo */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.active}
                  onClick={() => setForm(p => ({ ...p, active: !p.active }))}
                  className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none ${form.active ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.active ? 'left-5' : 'left-1'}`} />
                </button>
                <span className="text-sm text-slate-700">Filial ativa</span>
              </label>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || cnpjError}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary-base)] text-white font-medium rounded-lg hover:brightness-110 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? 'Salvando...' : 'Salvar Filial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          Modal Upload Certificado .pfx
      ══════════════════════════════════════════ */}
      {showCertModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCertModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Certificado Digital .pfx</h3>
              </div>
              <button
                onClick={() => setShowCertModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCertUpload} className="px-6 py-5 space-y-4">
              {/* Info */}
              <div className="flex gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-800">
                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>O certificado é armazenado com segurança no banco de dados. Nenhum arquivo físico fica salvo no servidor.</span>
              </div>

              {/* Drop area */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo .pfx *</label>
                <div
                  onClick={() => document.getElementById('pfx-file-input')?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    certFile
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                  }`}
                >
                  <Upload className={`w-6 h-6 mx-auto mb-2 ${certFile ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <p className={`text-sm font-medium ${certFile ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {certFile ? certFile.name : 'Clique para selecionar o arquivo .pfx'}
                  </p>
                </div>
                <input
                  id="pfx-file-input"
                  type="file"
                  accept=".pfx"
                  className="hidden"
                  onChange={e => setCertFile(e.target.files?.[0] || null)}
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Senha do Certificado *</label>
                <input
                  type="password"
                  required
                  value={certPassword}
                  onChange={e => setCertPassword(e.target.value)}
                  placeholder="Senha do arquivo .pfx"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCertModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingCert || !certFile}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors text-sm disabled:opacity-60"
                >
                  {uploadingCert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploadingCert ? 'Enviando...' : 'Enviar Certificado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
