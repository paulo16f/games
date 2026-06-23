import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jump Frogs",
  description: "Hatch rare frogs, race them to the top, and earn as an active holder.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
