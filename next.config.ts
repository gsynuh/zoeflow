import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize dev server startup
  experimental: {
    optimizePackageImports: [
      "@xyflow/react",
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-select",
    ],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.md$/,
      use: "raw-loader",
    });

    return config;
  },
};

export default nextConfig;
