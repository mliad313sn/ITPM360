import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxy API calls to the Node.js backend during development
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
