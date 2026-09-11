import type { NextConfig } from "next";
const config: NextConfig = { reactStrictMode: true, transpilePackages: ["@ferrytown/protocol"], output: "standalone" };
export default config;
