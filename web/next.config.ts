import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type errors still FAIL the build (typescript.ignoreBuildErrors stays false).
  // ESLint is skipped during `next build` only: eslint-config-next@15 loads
  // @rushstack/eslint-patch, which crashes on ESLint 9.39 ("Failed to patch ESLint").
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  // Aumentar limite de payload para uploads de vídeo (até 4GB)
  experimental: {
    serverActions: {
      bodySizeLimit: '4gb',
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
