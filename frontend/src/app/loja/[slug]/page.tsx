'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Store } from 'lucide-react';
import B2COpenStorefront from '@/app/domain/[hostname]/_components/B2COpenStorefront';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function FriendlyB2CStorefrontPage() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string) || '';

  const [storeInfo, setStoreInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API_URL}/b2c/public/resolve-slug?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Loja B2C não encontrada.');
        }
        return res.json();
      })
      .then((data) => {
        setStoreInfo(data);
      })
      .catch((e) => {
        setError(e.message || 'Loja não encontrada.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-xs font-medium text-slate-500">Carregando loja oficial...</p>
      </div>
    );
  }

  if (error || !storeInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-500">
          <Store className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Loja não encontrada</h1>
        <p className="text-xs text-slate-500 max-w-sm">
          {error || 'Verifique se o endereço amigável da loja está correto.'}
        </p>
      </div>
    );
  }

  return <B2COpenStorefront hostname={slug} domainInfo={storeInfo} />;
}
