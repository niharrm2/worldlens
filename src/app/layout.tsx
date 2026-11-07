import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";

import { siteConfig } from "@/config/site";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
};

export const viewport: Viewport = {
  themeColor: siteConfig.themeColor,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {/* Cesium's widget stylesheet ships with its static assets in /public/vendor. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/vendor/cesium/Widgets/widgets.css" />
      </head>
      <body className="globe-first">
        {children}
        {/* Vercel Web Analytics: page views and visitors; a no-op outside Vercel deployments. */}
        <Analytics />
      </body>
    </html>
  );
}
