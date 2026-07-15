import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackbox — the flight recorder for AI agents",
  description:
    "Blackbox reads a trace of a failed agent run and generates a regression test so it never crashes the same way twice. It catches silent failures — the ones that return status_code 0.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
