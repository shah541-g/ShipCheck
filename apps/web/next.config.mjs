/** @type {import('next').NextConfig} */
const nextConfig = {
  // Needed by the Docker image in Phase 7 (Document 3 step 6.1).
  output: 'standalone',
  // Kept from the create-next-app template: Tailwind 4 is compiled by this
  // Turbopack loader, so removing it breaks every style.
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
