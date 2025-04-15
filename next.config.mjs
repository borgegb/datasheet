/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "source.unsplash.com",
        // port and pathname removed for broader matching
      },
      // You can add other trusted domains here
      // {
      //   protocol: 'https',
      //   hostname: 'your-other-domain.com',
      // },
    ],
  },
};

export default nextConfig;
