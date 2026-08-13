import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zoom - Video Conferencing Platform",
  description: "Modern web video conferencing platform inspired by Zoom",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="https://zoom.us/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
