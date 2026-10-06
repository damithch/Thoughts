import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Today and Agent pages were merged into the Tasks area. Query strings (e.g. ?date=)
  // are passed through, so old links and bookmarks keep working.
  async redirects() {
    return [
      { source: "/dashboard/today", destination: "/dashboard/tasks", permanent: false },
      { source: "/dashboard/agent", destination: "/dashboard/tasks", permanent: false },
    ];
  },
};

export default nextConfig;
