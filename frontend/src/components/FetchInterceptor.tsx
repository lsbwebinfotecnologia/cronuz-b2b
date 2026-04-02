"use client";

import { useEffect } from "react";
import Cookies from "js-cookie";
import { toast } from "sonner";

export function FetchInterceptor() {
  useEffect(() => {
    const { fetch: originalFetch } = window;

    // We override window.fetch to globally catch 401 Unauthorized responses
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // If the backend returns 401, the JWT token is likely expired or invalid
      if (response.status === 401) {
        // Prevent redirect loops if we are already on the login page
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/h/')) {
          Cookies.remove("token");
          toast.error("Sessão expirada. Redirecionando para o login...");
          
          // Use setTimeout to allow the toast to appear before the hard navigation
          setTimeout(() => {
            window.location.href = "/login";
          }, 1000);
        }
      }
      
      return response;
    };

    // Cleanup function strictly to avoid multiple overrides in dev
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
