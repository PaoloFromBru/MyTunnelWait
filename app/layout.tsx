// app/layout.tsx
import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css"; // <-- scommenta se hai il file

export const metadata: Metadata = {
  title: {
    default: "My Tunnel Wait",
    template: "%s | My Tunnel Wait",
  },
  description: "Tempo di attesa ai tunnel, semplice e immediato.",
  manifest: "/manifest.webmanifest",
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
  // themeColor: "#111111",
  applicationName: "My Tunnel Wait",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // themeColor: "#111111",
  // colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900">
        <header className="flex items-center gap-3 p-3 shadow-sm sticky top-0 bg-white/90 backdrop-blur z-50">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="My Tunnel Wait"
              width={40}
              height={40}
              priority
            />
            <span className="font-semibold text-lg">My Tunnel Wait</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4">
            {/* Aggiungi qui eventuali link di navigazione */}
          </nav>
        </header>

        <main className="mx-auto max-w-5xl p-4">{children}</main>
      </body>
    </html>
  );
}
