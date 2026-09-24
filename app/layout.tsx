import type { Metadata, Viewport } from "next";
import PwaRegistration from "@/components/pwa-registration";
import PwaInstallPrompt from "@/components/pwa-install-prompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Robotik Atölyeleri | Öğrenci Takip",
  description: "Robotik Atölyeleri ders, yoklama, ödev ve duyuru takibi",
  appleWebApp: { capable: true, title: "Robotik Atölyeleri", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#243dc0" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body><PwaRegistration />{children}<PwaInstallPrompt /></body></html>;
}
