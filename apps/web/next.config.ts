import type { NextConfig } from "next";
const config: NextConfig = { reactStrictMode: true, transpilePackages: ["@unwatched/protocol"], output: "standalone" };
export default config;
