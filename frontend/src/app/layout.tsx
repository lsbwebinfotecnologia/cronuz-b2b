import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FetchInterceptor } from "@/components/FetchInterceptor";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const tenant = headersList.get("x-tenant-id") || "cronuz";

  if (tenant === 'horus') {
    return {
      title: "Horus B2B",
      description: "Portal B2B Multi-Empresas Horus",
      icons: {
        icon: "/favicon-horus.png"
      }
    };
  }

  return {
    title: "Cronuz",
    description: "Portal B2B Multi-Empresas Cronuz",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const tenant = headersList.get("x-tenant-id") || "cronuz";

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} bg-white text-slate-900 dark:bg-background dark:text-foreground antialiased max-w-[100vw] overflow-x-hidden transition-colors duration-200 ${tenant === 'horus' ? 'theme-horus' : ''}`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <FetchInterceptor />
        <Toaster 
          position="top-right" 
          theme="dark"
          toastOptions={{
            style: {
              background: '#0f172a',
              border: '1px solid #1e293b',
              color: '#f8fafc',
            },
          }}
        />
        {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
