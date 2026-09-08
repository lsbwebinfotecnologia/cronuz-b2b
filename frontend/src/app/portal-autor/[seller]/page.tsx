'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AuthorPortalIndex() {
  const params = useParams();
  const router = useRouter();
  const seller = params?.seller as string;

  useEffect(() => {
    // Verifica se já possui sessão de autor ativa
    const token = localStorage.getItem(`author_token_${seller}`) || localStorage.getItem('author_token');
    if (token) {
      router.replace(`/portal-autor/${seller}/dashboard`);
    } else {
      router.replace(`/portal-autor/${seller}/login`);
    }
  }, [seller, router]);

  return null;
}
