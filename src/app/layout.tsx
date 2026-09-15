import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Flash } from "@/components/Flash";
import { ToastProvider } from "@/components/Toast";
import { themeInitScript } from "@/components/ThemeToggle";
import { readDb } from "@/lib/db";
import { currentLang } from "@/lib/lang";
import { I18nProvider } from "@/components/I18nProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"] });

export async function generateMetadata(): Promise<Metadata> {
  const club = (await readDb()).settings.club;
  return {
    title: { default: club.name, template: `%s · ${club.name}` },
    description: "Local chess club manager: players, Elo, tournaments and pairings",
    manifest: "/manifest.webmanifest",
    icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: club.name, statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1014" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await currentLang();
  return (
    <html lang={lang} className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <I18nProvider lang={lang}>
          <ToastProvider>
            <Suspense>
              <Flash />
            </Suspense>
            {children}
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
