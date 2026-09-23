import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Noto_Sans_Devanagari, Noto_Sans_Kannada } from "next/font/google";

import { AppProviders } from "@/components/shell/AppProviders";

import "./globals.css";

/**
 * Fonts are self-hosted by next/font at build time, so the typography is part
 * of the offline bundle - no Google Fonts request, no FOUT, no network.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
  weight: ["400", "500", "600"],
});

// Kannada terminology is part of the app's kinship engine, so its script is
// bundled the same way Devanagari is - no network request at runtime.
const kannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  variable: "--font-kannada",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Vamsha-Vriksha · family & kinship mapping",
    template: "%s · Vamsha-Vriksha",
  },
  description:
    "An offline-first canvas for documenting your family: people, biodata and culturally specific kinship across generations. Works with no internet and no account.",
  applicationName: "Vamsha-Vriksha",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Vamsha-Vriksha",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#191622" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${fraunces.variable} ${devanagari.variable} ${kannada.variable} font-sans antialiased`}
      >
        {/* Applies the stored (or system) theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var d=t;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`,
          }}
        />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
