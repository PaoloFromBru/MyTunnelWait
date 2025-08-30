import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Tunnel Wait",
    short_name: "TunnelWait",
    description: "Tempo di attesa ai tunnel, semplice e immediato.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      // Standard Android/Web App icons
      { src: "/icons/icon-48.png", sizes: "48x48", type: "image/png", purpose: "any" },
      { src: "/icons/icon-72.png", sizes: "72x72", type: "image/png", purpose: "any" },
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icons/icon-144.png", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },

      // Maskable (safe area per Android Home screen)
      { src: "/icons/maskable/icon-48-maskable.png", sizes: "48x48", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/icon-72-maskable.png", sizes: "72x72", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/icon-96-maskable.png", sizes: "96x96", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/icon-144-maskable.png", sizes: "144x144", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/icon-256-maskable.png", sizes: "256x256", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/icon-384-maskable.png", sizes: "384x384", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },

      // iOS (Apple Touch Icons)
      { src: "/apple-touch-icon-120.png", sizes: "120x120", type: "image/png" },
      { src: "/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { src: "/apple-touch-icon-167.png", sizes: "167x167", type: "image/png" },
      { src: "/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }
    ]
  };
}
