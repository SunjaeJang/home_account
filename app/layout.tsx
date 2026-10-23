import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "두리 가계부 | 우리 둘의 살림 기록",
  description: "두 사람이 함께 기록하고 뱅크샐러드 내역도 모아보는 가계부",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "두리 가계부" },
};
export const viewport: Viewport = { themeColor: "#315e50", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
