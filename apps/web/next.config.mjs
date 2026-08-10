/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // وكيل إلى الخلفية لتجنب CORS في التطوير (§82)
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
