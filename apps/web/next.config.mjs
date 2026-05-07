/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vogue/db', '@vogue/shared'],
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
