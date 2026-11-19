import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { Analytics } from "@vercel/analytics/next";
import { VaultProvider } from "@/components/vault/vault-provider";
import { WebsiteAnalytics } from "@/components/analytics/website-analytics";
import "./globals.css";

export const instant = false;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jefftech Password Vault",
  description: "Zero-knowledge password management with premium security and encryption-first architecture.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <VaultProvider>{children}</VaultProvider>
        <WebsiteAnalytics />
        <Analytics />
      </body>
    </html>
  );
}
