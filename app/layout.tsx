// app/layout.tsx
import type { Metadata } from "next";
import Header from "@/components/Header";
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
  applicationName: "My Tunnel Wait",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900">
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
