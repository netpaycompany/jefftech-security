import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { Suspense } from "react";
import { VaultProvider } from "@/components/vault/vault-provider";
import "./globals.css";

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
};

async function RequestTimeApplication({ children }: { children: React.ReactNode }) {
  await connection();
  return <VaultProvider>{children}</VaultProvider>;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <Suspense fallback={<div className="min-h-screen bg-slate-950" aria-busy="true" />}>
          <RequestTimeApplication>{children}</RequestTimeApplication>
        </Suspense>
      </body>
    </html>
  );
}
