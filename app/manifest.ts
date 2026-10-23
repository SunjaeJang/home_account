import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return {
    name: "두리 가계부",
    short_name: "두리 가계부",
    description: "우리 둘의 살림 기록",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#315e50",
    lang: "ko",
    icons: [{ src: `${basePath}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}

