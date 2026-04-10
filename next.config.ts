import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@fullcalendar/react',
    '@fullcalendar/core',
    '@fullcalendar/daygrid',
    '@fullcalendar/interaction',
    'otplib',
  ],
};

export default nextConfig;
