import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistration } from "@/app/components/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thoughts",
  description: "A private journal and daily operating system for capturing thoughts, tasks, and insights.",
  applicationName: "Thoughts",
  icons: {
    icon: "/pwa-icon-192.png",
    apple: "/pwa-icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Thoughts",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#123524",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
