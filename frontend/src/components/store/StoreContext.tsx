'use client';

import React, { createContext, useContext } from 'react';

interface StoreContextType {
  coverImageBaseUrl: string | null;
  coverImageSecondaryBaseUrl: string | null;
  companyId: number;
  usesHorus: boolean;
  b2bShowStockQuantity: boolean;
  logo: string | null;
  name: string | null;
}

const StoreContext = createContext<StoreContextType>({
  coverImageBaseUrl: null,
  coverImageSecondaryBaseUrl: null,
  companyId: 1,
  usesHorus: false,
  b2bShowStockQuantity: true,
  logo: null,
  name: null
});

export const useStoreConfig = () => useContext(StoreContext);

export function StoreProvider({ 
  children, 
  coverImageBaseUrl,
  coverImageSecondaryBaseUrl = null,
  companyId,
  usesHorus,
  b2bShowStockQuantity,
  logo,
  name
}: { 
  children: React.ReactNode, 
  coverImageBaseUrl: string | null,
  coverImageSecondaryBaseUrl?: string | null,
  companyId: number,
  usesHorus: boolean,
  b2bShowStockQuantity: boolean,
  logo: string | null,
  name: string | null
}) {
  return (
    <StoreContext.Provider value={{ coverImageBaseUrl, coverImageSecondaryBaseUrl, companyId, usesHorus, b2bShowStockQuantity, logo, name }}>
      {children}
    </StoreContext.Provider>
  );
}
