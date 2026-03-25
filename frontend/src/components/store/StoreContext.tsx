'use client';

import React, { createContext, useContext } from 'react';

interface StoreContextType {
  coverImageBaseUrl: string | null;
  companyId: number;
  usesHorus: boolean;
  logo: string | null;
  name: string | null;
}

const StoreContext = createContext<StoreContextType>({
  coverImageBaseUrl: null,
  companyId: 1,
  usesHorus: false,
  logo: null,
  name: null
});

export const useStoreConfig = () => useContext(StoreContext);

export function StoreProvider({ 
  children, 
  coverImageBaseUrl,
  companyId,
  usesHorus,
  logo,
  name
}: { 
  children: React.ReactNode, 
  coverImageBaseUrl: string | null,
  companyId: number,
  usesHorus: boolean,
  logo: string | null,
  name: string | null
}) {
  return (
    <StoreContext.Provider value={{ coverImageBaseUrl, companyId, usesHorus, logo, name }}>
      {children}
    </StoreContext.Provider>
  );
}
