import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

/* Self-hosted fonts — no Google Fonts request at runtime, no FOUT from a
   third-party origin, works on locked-down networks. */
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/opendyslexic/latin-400.css";
import "@fontsource/opendyslexic/latin-700.css";

import "./globals.css";

import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_SUBTITLE,
  APP_TAGLINE,
  FONT_OPTIONS,
  PREFERENCES_COOKIE,
  THEMES,
} from "@/lib/constants";
import { resolvePreferences } from "@/lib/prefs";
import { ThemeProvider } from "@/providers/ThemeProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://transtudio.local"),
  title: {
    default: `${APP_NAME} — ${APP_SUBTITLE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "youtube transcript",
    "transcript extractor",
    "read youtube",
    "subtitle export",
    "srt",
    "vtt",
    "transcript downloader",
  ],
  authors: [{ name: APP_NAME }],
  manifest: "/manifest.webmanifest",
  // Opt-in marker for the TranStudio Connector add-on (see /extension): its
  // page bridge only answers on pages that carry this tag.
  other: { "transtudio-connector": "1" },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
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

/**
 * The layout is server-rendered *with the saved preferences*.
 *
 * Reading the preferences cookie here means `data-theme`, `data-scheme` and the
 * Typography Studio variables are baked into the very first HTML response — so
 * a returning visitor with Zen Paper saved never sees a flash of another theme,
 * and no inline boot script is required.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const prefs = resolvePreferences(cookieStore.get(PREFERENCES_COOKIE)?.value);

  const scheme =
    THEMES.find((theme) => theme.id === prefs.theme)?.scheme ?? "light";
  const fontStack =
    FONT_OPTIONS.find((font) => font.id === prefs.typography.fontFamily)?.stack ??
    FONT_OPTIONS[0].stack;

  return (
    <html
      lang="en"
      data-theme={prefs.theme}
      data-scheme={scheme}
      data-motion={prefs.reduceMotion ? "reduced" : "full"}
      style={
        {
          "--transcript-font": fontStack,
          "--transcript-size": `${prefs.typography.fontSize}rem`,
          "--transcript-leading": String(prefs.typography.lineHeight),
          "--transcript-tracking": `${prefs.typography.letterSpacing}em`,
          "--transcript-measure": `${prefs.typography.measure}ch`,
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
