import { useState, useEffect } from 'react';
import { BASE_URL } from '../services/api';

export interface BrandConfig {
  tenant_id: string;
  app_name: string;
  app_subtitle: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  logo_asset: 'horus' | 'cronuz';
  icon_asset: 'horus' | 'cronuz';
}

// Assets locais por brand
export const BRAND_LOGOS: Record<string, any> = {
  horus: require('../assets/brands/horus/logo.png'),
  cronuz: require('../assets/brands/cronuz/logo.png'),
};

export const BRAND_LOGOS_HORIZONTAL: Record<string, any> = {
  horus: require('../assets/brands/horus/logo-horizontal.png'),
  cronuz: require('../assets/brands/cronuz/logo.png'),
};

// Brand padrão enquanto carrega
const DEFAULT_BRAND: BrandConfig = {
  tenant_id: 'horus',
  app_name: 'Horus B2B',
  app_subtitle: 'Acesse sua conta',
  primary_color: '#a4a1ff',    // Roxo/lavanda Horus
  secondary_color: '#908df7',
  logo_url: null,
  logo_asset: 'horus',
  icon_asset: 'horus',
};

// Tenant configurado na build
const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? 'horus';

export function useBrand() {
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBrand() {
      try {
        const res = await fetch(`${BASE_URL}/app/brand?tenant_id=${TENANT_ID}`);
        if (res.ok) {
          const data = await res.json();
          setBrand(data);
        }
      } catch {
        // Usa default silenciosamente
      } finally {
        setLoading(false);
      }
    }
    fetchBrand();
  }, []);

  return { brand, loading };
}
