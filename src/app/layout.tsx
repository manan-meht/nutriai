import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tistra Health",
  description: "Nutrition coaching and family support for India.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
