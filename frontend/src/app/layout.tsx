import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VeriCore AI",
    template: "%s | VeriCore AI",
  },
  description:
    "Enterprise knowledge and SOP platform with evidence-backed AI answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
