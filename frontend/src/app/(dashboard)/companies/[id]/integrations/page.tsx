'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Plug, Loader2, Database, BookOpen, PackageCheck, ShoppingBag,
  CreditCard, ArrowRight, CheckCircle2, AlertCircle
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { useCompany } from '../context';
import Link from 'next/link';

export default function CompanyIntegrationsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>({});
  const [dropshipCfg, setDropshipCfg] = useState<any>(null);
  const [bookinfoInteg, setBookinfoInteg] = useState<any>(null);

  useEffect(() => {
    async function loadAll() {
      if (!companyId) return;
      setLoading(true);
      try {
        const token = getToken();
        if (!token) return;
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        const [sRes, dRes, iRes] = await Promise.all([
          fetch(`${apiBase}/companies/${companyId}/settings`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiBase}/dropship/config/${companyId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiBase}/integrators/${companyId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (sRes.ok) setSettings(await sRes.json());
        if (dRes.ok) setDropshipCfg(await dRes.json());
        if (iRes.ok) {
          const list = await iRes.json();
          if (Array.isArray(list)) {
            setBookinfoInteg(list.find((i: any) => i.platform === 'BOOKINFO') || null);
          }
        }
      } catch (e) {
        console.error('Erro ao carregar mapa de integrações:', e);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [companyId]);

  if (loading || !company) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  const connectors = [
    {
      id: 'horus-api',
      title: 'Hórus ERP (API REST TServerB2B)',
      desc: 'Sincronização de produtos, saldo disponível (SD_*), clientes, pedidos de venda e notas fiscais.',
      icon: Database,
      active: Boolean(settings.horus_enabled && settings.horus_url),
      badge: settings.horus_enabled
        ? `Ativo (${settings.horus_company || 'Emp'}/${settings.horus_branch || 'Fil'})`
        : 'Inativo',
      detail: settings.horus_url
        ? `${settings.horus_url}:${settings.horus_port || '8060'} · ${settings.horus_legacy_pagination ? 'Com OFFSET/LIMIT' : 'Sem paginação'}`
        : 'URL ainda não configurada',
      href: `/companies/${companyId}/horus`,
      sellerInfo: 'Espelhado em /settings?tab=horus',
    },
    {
      id: 'horus-sql',
      title: 'Hórus SQL Direct (SQL Server)',
      desc: 'Conexão direta ao banco SQL Server para Editorial/DBM, Autores, Financeiro e consultas analíticas.',
      icon: Database,
      active: Boolean(company.module_horus_sql && settings.horus_sql_host),
      badge: company.module_horus_sql && settings.horus_sql_host ? 'Conectado' : 'Opcional / Inativo',
      detail: settings.horus_sql_host
        ? `${settings.horus_sql_host}:${settings.horus_sql_port || 1433} (${settings.horus_sql_database || 'DB'})`
        : 'Servidor SQL não configurado',
      href: `/companies/${companyId}/horus-sql`,
      sellerInfo: 'Espelhado em /settings?tab=horus_sql',
    },
    {
      id: 'b2c',
      title: 'B2C — Loja Virtual Aberta',
      desc: 'Vitrine B2C por característica Hórus (COD_TPO_CARACT / COD_CARACT), subdomínio automático e domínio próprio.',
      icon: ShoppingBag,
      active: Boolean(company.module_b2c_storefront),
      badge: company.module_b2c_storefront
        ? settings.b2c_storefront_open !== false
          ? 'Loja Aberta'
          : 'Módulo Ativo'
        : 'Módulo Desativado',
      detail: company.b2c_custom_domain
        ? `Domínio: ${company.b2c_custom_domain}`
        : `Subdomínio: b2c.${(company.domain || `seller${company.id}`).split('.')[0]}.horusb2b.com.br`,
      href: `/companies/${companyId}/tray`,
      sellerInfo: 'Gerenciado pelo Seller no menu B2C & Produtos',
    },
    {
      id: 'bookinfo',
      title: 'Bookinfo Hub B2B',
      desc: 'Recebimento automatizado de pedidos de venda, avaliação de estoque/consignação e transmissão de compras.',
      icon: BookOpen,
      active: Boolean(bookinfoInteg?.active || settings.bookinfo_api_key),
      badge: bookinfoInteg?.active || settings.bookinfo_api_key ? 'Token Configurado' : 'Sem Token',
      detail: settings.bookinfo_sync_enabled
        ? 'Sincronização automática em segundo plano ativa'
        : 'Modo manual / aguardando ativação',
      href: `/companies/${companyId}/bookinfo`,
      sellerInfo: 'Espelhado em /settings?tab=bookinfo',
    },
    {
      id: 'dropship',
      title: 'Dropshipping (Hub-Erdos)',
      desc: 'Credenciais Multi-Token por CNPJ, parâmetros fiscais de Remessa (6.923) e Venda (6.118) no Hórus.',
      icon: PackageCheck,
      active: Boolean(dropshipCfg?.enabled),
      badge: dropshipCfg?.enabled ? 'Integração Ativa' : 'Desativado',
      detail: dropshipCfg?.stock_sync_enabled
        ? `Sync de estoque ativo (${dropshipCfg.stock_sync_interval_min || 30} min)`
        : 'Configurado por credencial no Seller',
      href: `/companies/${companyId}/dropship`,
      sellerInfo: 'Espelhado em /settings?tab=dropship',
    },
    {
      id: 'payments',
      title: 'Pagamentos, Gateways & Bancos',
      desc: 'Habilitação de provedores (Vindi, Efí, Inter, Cielo/Rede, Cora) e matriz de canais × formas de pagamento.',
      icon: CreditCard,
      active: Boolean(
        settings.vindi_enabled ||
          settings.efi_enabled ||
          settings.inter_enabled ||
          settings.cielo_enabled ||
          settings.cora_enabled
      ),
      badge: 'Configurado por Canal',
      detail: 'Chaves de API gerenciadas diretamente pelo Seller em /settings?tab=pagamentos',
      href: `/companies/${companyId}/payments`,
      sellerInfo: 'Credenciais no Seller (/settings?tab=pagamentos)',
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/50 dark:bg-slate-950/50">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plug className="w-5 h-5 text-[var(--color-primary-base)]" />
            Mapa de Conectores & Integrações da Empresa
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Visão consolidada em tempo real de todos os conectores técnicos desta empresa e seu espelhamento com o painel do Seller.
          </p>
        </div>
      </div>

      <div className="p-6 flex-1 bg-slate-50/30 dark:bg-slate-950/20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectors.map(conn => {
            const Icon = conn.icon;
            return (
              <div
                key={conn.id}
                className={`rounded-2xl border p-5 transition-all flex flex-col justify-between bg-white dark:bg-slate-900 shadow-sm ${
                  conn.active
                    ? 'border-emerald-200 dark:border-emerald-800/50'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-xl ${
                          conn.active
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{conn.title}</h3>
                        <span className="text-[11px] text-slate-400 font-medium">{conn.sellerInfo}</span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${
                        conn.active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}
                    >
                      {conn.active ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {conn.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">{conn.desc}</p>

                  <div className="mt-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate">
                    {conn.detail}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-end">
                  <Link
                    href={conn.href}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition-colors"
                  >
                    Abrir Configuração <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
