'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { SettingsCompanyContext, SettingsCompany } from './context';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<SettingsCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const user = getUser();
  const companyId = user?.company_id;

  const fetchCompany = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setCompany(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
       fetchCompany();
    } else {
       setLoading(false);
    }
  }, [companyId]);

  if (loading) {
     return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
     );
  }

  return (
    <SettingsCompanyContext.Provider value={{ company, loading, refreshCompany: fetchCompany }}>
       {children}
    </SettingsCompanyContext.Provider>
  );
}
