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
  coverUrl?: string | null;
}

export function ProductImage({ coverUrl, eanGtin, alt, className = "", iconClassName = "w-10 h-10", baseUrl, companyIdProp }: ProductImageProps) {
  const storeConfig = useStoreConfig();
  
  const coverImageBaseUrl = baseUrl !== undefined ? baseUrl : storeConfig.coverImageBaseUrl;
  const companyId = companyIdProp !== undefined ? companyIdProp : storeConfig.companyId;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [fallbackLevel, setFallbackLevel] = useState(0);

  useEffect(() => {
    if (coverUrl) {
      setImgSrc(coverUrl.startsWith('http') ? coverUrl : `${apiUrl}${coverUrl}`);
      setFallbackLevel(3); // Custom Image
      return;
    }

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
    } else if (companyId) {
      setImgSrc(`${apiUrl}/static/covers/${companyId}/${eanGtin}.jpg`);
      setFallbackLevel(2);
    } else {
      setHasError(true);
    }
    
  }, [eanGtin, coverImageBaseUrl, companyId, apiUrl]);

  const handleError = () => {
    if (fallbackLevel === 3 && eanGtin) {
      // If custom image fails, try CDN
       if (coverImageBaseUrl) {
         setImgSrc(`${coverImageBaseUrl.replace(/\/$/, '')}/${eanGtin}.jpg`);
         setFallbackLevel(1);
       } else if (companyId) {
         setImgSrc(`${apiUrl}/static/covers/${companyId}/${eanGtin}.jpg`);
         setFallbackLevel(2);
       } else {
         setHasError(true);
       }
    } else if (fallbackLevel === 1 && companyId) {
      // Fallback from external CDN to local server
      setImgSrc(`${apiUrl}/static/covers/${companyId}/${eanGtin}.jpg`);
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
