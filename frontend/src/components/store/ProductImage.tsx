'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ImageIcon } from 'lucide-react';
import { useStoreConfig } from './StoreContext';

interface ProductImageProps {
  eanGtin?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  baseUrl?: string | null;
  secondaryBaseUrl?: string | null;
  companyIdProp?: number | null;
  coverUrl?: string | null;
}

interface CachedCoverConfig {
  primary: string | null;
  secondary: string | null;
}

const companyCoverConfigCache = new Map<number, Promise<CachedCoverConfig>>();

function fetchCompanyCoverConfig(apiUrl: string, companyId: number): Promise<CachedCoverConfig> {
  const existing = companyCoverConfigCache.get(companyId);
  if (existing) return existing;

  const promise = fetch(`${apiUrl}/storefront/config?company_id=${companyId}`)
    .then(async (res) => {
      if (!res.ok) return { primary: null, secondary: null };
      const data = await res.json();
      return {
        primary: data.cover_image_base_url || null,
        secondary: data.cover_image_secondary_base_url || null,
      };
    })
    .catch(() => ({ primary: null, secondary: null }));

  companyCoverConfigCache.set(companyId, promise);
  return promise;
}

export function ProductImage({
  coverUrl,
  eanGtin,
  alt,
  className = "",
  iconClassName = "w-10 h-10",
  baseUrl,
  secondaryBaseUrl,
  companyIdProp,
}: ProductImageProps) {
  const storeConfig = useStoreConfig();
  const companyId = companyIdProp !== undefined ? companyIdProp : storeConfig.companyId;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [fetchedConfig, setFetchedConfig] = useState<CachedCoverConfig | null>(null);

  const rawPrimary = baseUrl !== undefined ? baseUrl : storeConfig.coverImageBaseUrl;
  const rawSecondary = secondaryBaseUrl !== undefined ? secondaryBaseUrl : storeConfig.coverImageSecondaryBaseUrl;

  useEffect(() => {
    if (companyId && (rawPrimary === null || rawSecondary === null)) {
      let active = true;
      fetchCompanyCoverConfig(apiUrl, companyId).then((cfg) => {
        if (active) setFetchedConfig(cfg);
      });
      return () => {
        active = false;
      };
    }
  }, [apiUrl, companyId, rawPrimary, rawSecondary]);

  const effectivePrimaryBaseUrl = rawPrimary || fetchedConfig?.primary || null;
  const effectiveSecondaryBaseUrl = rawSecondary || fetchedConfig?.secondary || null;

  // Monta a fila ordenada de tentativas:
  // 1. Capa explícita/upload local (se houver em coverUrl)
  // 2. Link Primário de Capas (cover_image_base_url/<isbn>.jpg)
  // 3. Link Secundário de Capas (cover_image_secondary_base_url/<isbn>.jpg)
  // 4. Diretório local do Cronuz (/uploads/covers/<companyId>/<isbn>.jpg)
  // Se todos falharem -> exibe "Sem Capa"
  const candidates = useMemo(() => {
    const list: string[] = [];
    const addUnique = (url: string | null | undefined) => {
      if (!url) return;
      const trimmed = url.trim();
      if (trimmed && !list.includes(trimmed)) {
        list.push(trimmed);
      }
    };

    if (coverUrl) {
      addUnique(coverUrl.startsWith('http') ? coverUrl : `${apiUrl}${coverUrl}`);
    }

    const cleanEan = eanGtin ? String(eanGtin).trim() : '';
    if (cleanEan) {
      if (effectivePrimaryBaseUrl) {
        addUnique(`${effectivePrimaryBaseUrl.replace(/\/$/, '')}/${cleanEan}.jpg`);
      }
      if (effectiveSecondaryBaseUrl) {
        addUnique(`${effectiveSecondaryBaseUrl.replace(/\/$/, '')}/${cleanEan}.jpg`);
      }
      if (companyId) {
        addUnique(`${apiUrl}/uploads/covers/${companyId}/${cleanEan}.jpg`);
      }
    }

    return list;
  }, [coverUrl, eanGtin, effectivePrimaryBaseUrl, effectiveSecondaryBaseUrl, companyId, apiUrl]);

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const currentSrc = candidates[candidateIndex] || null;

  if (!currentSrc) {
    return (
      <div className={`flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 ${className}`}>
        <ImageIcon className={iconClassName} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      className={`object-contain ${className}`}
      onError={() => setCandidateIndex((prev) => prev + 1)}
    />
  );
}
