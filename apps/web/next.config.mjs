/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript-compiled CommonJS from the workspace;
  // Next needs to be told to run it through its own pipeline.
  transpilePackages: ['@data-room/shared'],
};

export default nextConfig;
