import type { NextConfig } from "next";
const config: NextConfig = { reactStrictMode: true, transpilePackages: ["@smallhours/protocol"], output: "standalone" };
export default config;
