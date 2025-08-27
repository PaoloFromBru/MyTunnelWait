import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Tunnel Wait",
    short_name: "TunnelWait",
    description: "Stato e storico della coda al San Gottardo",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      // assicurati che questi file esistano in /public/icons
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // per iOS maskable/monochrome (facoltativi)
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-monochrome.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
  };
}
