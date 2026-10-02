import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "DevOps Safeguard — Monitor. Detect. Prevent.",
    template: "%s | DevOps Safeguard",
  },
  description:
    "DevOps Safeguard connects your code, infrastructure, services, deployments, and runtime signals into one intelligent view — helping teams detect failures early and understand what went wrong.",
  openGraph: {
    title: "DevOps Safeguard — Monitor. Detect. Prevent.",
    description:
      "Keep your applications healthy with correlated observability across apps, Kubernetes, infrastructure, logs, metrics, and AI-assisted diagnosis.",
    url: "/",
    siteName: "DevOps Safeguard",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-canvas font-sans text-ink antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
