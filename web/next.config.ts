import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Browser-side calls to /api/* (e.g. field autofill lookups) go to the Express API, same origin.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://api:4000'}/api/:path*` }];
  },
};

export default nextConfig;
