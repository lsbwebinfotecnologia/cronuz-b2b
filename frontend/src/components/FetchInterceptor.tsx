"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { removeToken } from "@/lib/auth";

export function FetchInterceptor() {
  useEffect(() => {
    const { fetch: originalFetch } = window;

    window.fetch = async (...args) => {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      
      // Endpoints tratados localmente — não interceptar 401/erros
      const isSilentEndpoint = url.includes('/seller/mobile/');

      try {
        const response = await originalFetch(...args);
        
        // If the backend returns 401, the JWT token is likely expired or invalid
        if (response.status === 401 && !isSilentEndpoint) {
          // Prevent redirect loops if we are already on the login page
          if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/h/')) {
            removeToken();
            toast.error("Sessão expirada. Redirecionando para o login...");
            
            // Use setTimeout to allow the toast to appear before the hard navigation
            setTimeout(() => {
              window.location.href = "/login";
            }, 1000);
          }
        }
        
        return response;
      } catch (error: any) {
        if (!isSilentEndpoint) {
          console.error("FetchInterceptor caught network error:", error);
          toast.error(`Erro de Rede: ${error.message} (URL: ${url})`);
        }
        throw error;
      }
    };

    // Cleanup function strictly to avoid multiple overrides in dev
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
