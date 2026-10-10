'use client';

import { useEffect } from 'react';

export function TenantThemeSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hostname = window.location.hostname.toLowerCase();
    const isHorus = hostname.includes('horus') || hostname.includes('fmz');
    if (isHorus) {
      document.body.classList.add('theme-horus');
    } else if (hostname.includes('cronuz')) {
      document.body.classList.remove('theme-horus');
    }
  }, []);

  return null;
}
