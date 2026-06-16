import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "World Cup Match Centre",
  description: "Scores, fixtures, standings, projected bracket, and forecast lab for a 2026 World Cup tournament simulator."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
