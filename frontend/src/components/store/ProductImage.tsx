'use client';

import React, { useState, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';
import { useStoreConfig } from './StoreContext';

interface ProductImageProps {
  eanGtin?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  baseUrl?: string | null;
  companyIdProp?: number;
}

export function ProductImage({ eanGtin, alt, className = "", iconClassName = "w-10 h-10", baseUrl, companyIdProp }: ProductImageProps) {
  const storeConfig = useStoreConfig();
  
  const coverImageBaseUrl = baseUrl !== undefined ? baseUrl : storeConfig.coverImageBaseUrl;
  const companyId = companyIdProp !== undefined ? companyIdProp : storeConfig.companyId;
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [fallbackLevel, setFallbackLevel] = useState(0);

  useEffect(() => {
    if (!eanGtin) {
      setHasError(true);
      return;
    }

    // Default Image Strategy 
    // 1. Try external CDN Base URL if exists -> {baseUrl}/{ean}.jpg
    // 2. Try Cronuz Local Server CDN -> /static/covers/{companyId}/{ean}.jpg
    
    if (coverImageBaseUrl) {
      setImgSrc(`${coverImageBaseUrl.replace(/\/$/, '')}/${eanGtin}.jpg`);
      setFallbackLevel(1);
    } else {
      setImgSrc(`http://localhost:8000/static/covers/${companyId}/${eanGtin}.jpg`);
      setFallbackLevel(2);
    }
    
    setHasError(false);
  }, [eanGtin, coverImageBaseUrl, companyId]);

  const handleError = () => {
    if (fallbackLevel === 1) {
      // Fallback from external CDN to local server
      setImgSrc(`http://localhost:8000/static/covers/${companyId}/${eanGtin}.jpg`);
      setFallbackLevel(2);
    } else {
      // Both failed
      setHasError(true);
    }
  };

  if (!imgSrc || hasError) {
    return (
      <div className={`flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 ${className}`}>
        <ImageIcon className={iconClassName} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img 
      src={imgSrc} 
      alt={alt} 
      className={`object-contain ${className}`}
      onError={handleError}
    />
  );
}
