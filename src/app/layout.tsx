import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { Flash } from "@/components/Flash";
import { ToastProvider } from "@/components/Toast";
import { themeInitScript } from "@/components/ThemeToggle";
import { readDb } from "@/lib/db";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"] });

export async function generateMetadata(): Promise<Metadata> {
  const club = (await readDb()).settings.club;
  return {
    title: { default: club.name, template: `%s · ${club.name}` },
    description: club.motto || "Local chess club manager: players, Elo, tournaments and pairings",
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <Suspense>
            <Flash />
          </Suspense>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
