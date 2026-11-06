import type { Metadata } from 'next';
import { getImageUrl } from '@/lib/image_helper';

type Props = {
  params: Promise<{ slug: string; route?: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  const slug = resolved.slug;
  const pathStr = Array.isArray(resolved.route) ? resolved.route.join('/') : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  try {
    const seoRes = await fetch(
      `${apiUrl}/b2c/public/seo-metadata?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(pathStr)}`,
      { next: { revalidate: 60 } }
    );
    if (seoRes.ok) {
      const seo = await seoRes.json();
      if (seo && seo.title) {
        return {
          title: seo.title,
          description: seo.description,
          alternates: seo.canonical_url ? { canonical: seo.canonical_url } : undefined,
          openGraph: {
            title: seo.title,
            description: seo.description,
            images: seo.og_image ? [getImageUrl(seo.og_image)] : undefined,
          },
          verification: seo.google_site_verification
            ? { google: seo.google_site_verification }
            : undefined,
        };
      }
    }
  } catch {
    // Fallback
  }

  return {
    title: 'Loja Oficial',
  };
}

export default function FriendlyStoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
