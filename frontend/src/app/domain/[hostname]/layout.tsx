import type { Metadata, ResolvingMetadata } from 'next';
import { getImageUrl } from '@/lib/image_helper';

type Props = {
  params: Promise<{ hostname: string }>;
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParams = await params;
  const hostname = resolvedParams.hostname;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  try {
    const res = await fetch(`${apiUrl}/storefront/domain/${hostname}`, {
      next: { revalidate: 60 },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.is_b2c_domain || data.b2c_storefront_open || data.business_model === 'B2C_STOREFRONT') {
        const seoRes = await fetch(
          `${apiUrl}/b2c/public/seo-metadata?hostname=${encodeURIComponent(hostname)}&company_id=${data.company_id}`,
          { next: { revalidate: 60 } }
        );
        if (seoRes.ok) {
          const seo = await seoRes.json();
          return {
            title: seo.title || data.name || 'Loja Oficial',
            description: seo.description || `Compre livros na loja oficial ${data.name}.`,
            alternates: seo.canonical_url ? { canonical: seo.canonical_url } : undefined,
            openGraph: {
              title: seo.title || data.name,
              description: seo.description,
              images: seo.og_image ? [getImageUrl(seo.og_image)] : undefined,
            },
            verification: seo.google_site_verification
              ? { google: seo.google_site_verification }
              : undefined,
            icons: data.favicon_url ? { icon: getImageUrl(data.favicon_url) } : undefined,
          };
        }
      }
      return {
        title: data.seo_title || data.name || 'Portal B2B',
        description: data.seo_description || `Acesse o portal exclusivo da ${data.name || 'nossa empresa'}.`,
        icons: data.favicon_url ? { icon: getImageUrl(data.favicon_url) } : undefined,
      };
    }
  } catch (e) {
    console.error('Error generating metadata for storefront', e);
  }

  return {
    title: 'Loja Oficial',
  };
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
