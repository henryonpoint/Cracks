import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "./register-sw";

export const metadata: Metadata = {
  title: "Interest Dump",
  description: "Save anything. It reads it, summarizes it, and helps you find the thread.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Interest Dump" },
};

export const viewport: Viewport = {
  themeColor: "#5b6cff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">{children}</div>
        <RegisterSW />
      </body>
    </html>
  );
}
