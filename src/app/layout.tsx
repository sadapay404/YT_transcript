import type { Metadata, Viewport } from "next";

/* Self-hosted fonts — no Google Fonts request at runtime, no FOUT from a
   third-party origin, works on locked-down networks. */
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/opendyslexic/latin-400.css";
import "@fontsource/opendyslexic/latin-700.css";

import "./globals.css";

import { APP_DESCRIPTION, APP_NAME, APP_SUBTITLE, APP_TAGLINE } from "@/lib/constants";
import { THEME_BOOT_SCRIPT } from "@/lib/bootScript";
import { ThemeProvider } from "@/providers/ThemeProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://cadence.local"),
  title: {
    default: `${APP_NAME} — ${APP_SUBTITLE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "youtube transcript",
    "transcript extractor",
    "viral clip finder",
    "gemini ai",
    "subtitle export",
    "srt",
    "vtt",
  ],
  authors: [{ name: `${APP_NAME} Studio` }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    title: `${APP_NAME} — ${APP_SUBTITLE}`,
    description: `${APP_TAGLINE} ${APP_DESCRIPTION}`,
    siteName: APP_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — ${APP_SUBTITLE}`,
    description: APP_TAGLINE,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f6f0e4" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies saved theme + typography before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
