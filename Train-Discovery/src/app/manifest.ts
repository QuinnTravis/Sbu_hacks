import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Train Discovery",
    short_name: "Discovery",
    description: "Discover the world along your LIRR ride.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eaedf3",
    theme_color: "#eaedf3",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
