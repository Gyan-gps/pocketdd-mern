import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Dev only: lets the Playwright UI-compare container (which reaches this app as http://web:3000)
  // load client chunks and HMR; Next blocks unknown dev origins otherwise.
  allowedDevOrigins: ['web'],
  // Browser-side calls to /api/* (e.g. field autofill lookups) go to the Express API, same origin.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://api:4000'}/api/:path*` }];
  },
};

export default nextConfig;
