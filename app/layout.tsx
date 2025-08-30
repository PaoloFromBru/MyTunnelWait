// app/layout.tsx
import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css"; // <-- scommenta se hai il file globale

export const metadata: Metadata = {
  title: {
    default: "My Tunnel Wait",
    template: "%s | My Tunnel Wait",
  },
  description: "Tempo di attesa ai tunnel, semplice e immediato.",
  manifest: "/manifest.json", // servito da app/manifest.ts
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/apple-touch-icon-120.png", sizes: "120x120" },
      { url: "/apple-touch-icon-152.png", sizes: "152x152" },
      { url: "/apple-touch-icon-167.png", sizes: "167x167" },
      { url: "/apple-touch-icon-180.png", sizes: "180x180" },
    ],
  },
  themeColor: "#111111",
  applicationName: "My Tunnel Wait",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900">
        <header className="flex items-center p-3 shadow-sm sticky top-0 bg-white/90 backdrop-blur z-50">
          <Link href="/" className="flex items-center">
            <Image
              src="/icons/icon-192.png" // nuova icona senza testo
              alt="My Tunnel Wait"
              width={40}
              height={40}
              priority
            />
          </Link>
        </header>

        <main className="mx-auto max-w-5xl p-4">{children}</main>
      </body>
    </html>
  );
}
