import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HorizOn | Guild Party Manager",
  description: "Organize Guild League parties with confidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
