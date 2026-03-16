'use client';

import React, { createContext, useContext } from 'react';

interface StoreContextType {
  coverImageBaseUrl: string | null;
  companyId: number;
}

const StoreContext = createContext<StoreContextType>({
  coverImageBaseUrl: null,
  companyId: 1
});

export const useStoreConfig = () => useContext(StoreContext);

export function StoreProvider({ 
  children, 
  coverImageBaseUrl,
  companyId 
}: { 
  children: React.ReactNode, 
  coverImageBaseUrl: string | null,
  companyId: number 
}) {
  return (
    <StoreContext.Provider value={{ coverImageBaseUrl, companyId }}>
      {children}
    </StoreContext.Provider>
  );
}
