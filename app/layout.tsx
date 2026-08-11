import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "A calm shared home for money, plans, and goals.";

  return {
    metadataBase: new URL(origin),
    title: "Homebase — Your shared household rhythm",
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Homebase", statusBarStyle: "default" },
    openGraph: {
      title: "Homebase",
      description,
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1792, height: 1024, alt: "Homebase — Money, plans, and goals—together." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Homebase",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f7f7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
