import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["10.36.67.108", "localhost", "127.0.0.1"],
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
