import type { Metadata, ResolvingMetadata } from 'next';

type Props = {
  params: Promise<{ hostname: string }>;
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  // Await the params object (Next.js 15 pattern, safe in 14 too if passed as promise or unwrapped)
  const resolvedParams = await params;
  const hostname = resolvedParams.hostname;
  
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/domain/${hostname}`, {
      next: { revalidate: 60 }
    });
    
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.seo_title || data.name || 'Portal B2B',
        description: data.seo_description || `Acesse o portal B2B exclusivo da ${data.name || 'nossa empresa'}.`,
        icons: data.favicon_url ? { icon: data.favicon_url } : undefined,
      };
    }
  } catch (e) {
    console.error('Error generating metadata for storefront', e);
  }

  return {
    title: 'Portal B2B',
  };
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
