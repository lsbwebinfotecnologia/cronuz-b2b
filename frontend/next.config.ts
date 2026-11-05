import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: false,
  experimental: {
    turbopackFileSystemCacheForDev: true,
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "framer-motion",
      "xlsx",
      "swiper",
      "react-quill-new",
      "sonner"
    ],
  },
};

export default nextConfig;
