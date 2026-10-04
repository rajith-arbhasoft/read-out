import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SQL Tool",
  description: "Internal read-only SQL console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
