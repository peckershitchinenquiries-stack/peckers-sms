/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are stable in 14.x; keep body limit generous for CSV work.
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

export default nextConfig
