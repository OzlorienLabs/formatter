/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // static-first, no custom server, Vercel-ready
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
