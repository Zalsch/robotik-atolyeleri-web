import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Robotik Atölyeleri Öğrenci Takip",
    short_name: "Robotik Atölyeleri",
    description: "Ders, yoklama, ödev ve duyurular",
    start_url: "/panel",
    display: "standalone",
    background_color: "#f7f9fd",
    theme_color: "#243dc0",
    lang: "tr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
