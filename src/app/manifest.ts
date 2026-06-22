import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thoughts",
    short_name: "Thoughts",
    description: "A private journal and daily operating system for capturing thoughts, tasks, and insights.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef8ee",
    theme_color: "#123524",
    orientation: "portrait",
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/landing-page.png",
        sizes: "1559x924",
        type: "image/png",
        form_factor: "wide",
        label: "Landing page",
      },
      {
        src: "/screenshots/dashboard-calendar.png",
        sizes: "1554x926",
        type: "image/png",
        form_factor: "wide",
        label: "Dashboard calendar view",
      },
    ],
  };
}
