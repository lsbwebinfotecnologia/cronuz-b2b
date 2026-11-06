import type { Metadata } from 'next';
import { getImageUrl } from '@/lib/image_helper';

type Props = {
  params: Promise<{ hostname: string; path?: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params;
  const hostname = resolved.hostname;
  const pathStr = Array.isArray(resolved.path) ? resolved.path.join('/') : '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  if (!pathStr) {
    return {};
  }

  try {
    const seoRes = await fetch(
      `${apiUrl}/b2c/public/seo-metadata?hostname=${encodeURIComponent(hostname)}&path=${encodeURIComponent(pathStr)}`,
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
        };
      }
    }
  } catch {
    // Fallback to parent layout metadata
  }

  return {};
}

export default function DomainSubpathLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
