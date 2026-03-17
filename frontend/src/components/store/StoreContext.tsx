'use client';

import React, { createContext, useContext } from 'react';

interface StoreContextType {
  coverImageBaseUrl: string | null;
  companyId: number;
  usesHorus: boolean;
}

const StoreContext = createContext<StoreContextType>({
  coverImageBaseUrl: null,
  companyId: 1,
  usesHorus: false
});

export const useStoreConfig = () => useContext(StoreContext);

export function StoreProvider({ 
  children, 
  coverImageBaseUrl,
  companyId,
  usesHorus
}: { 
  children: React.ReactNode, 
  coverImageBaseUrl: string | null,
  companyId: number,
  usesHorus: boolean
}) {
  return (
    <StoreContext.Provider value={{ coverImageBaseUrl, companyId, usesHorus }}>
      {children}
    </StoreContext.Provider>
  );
}
