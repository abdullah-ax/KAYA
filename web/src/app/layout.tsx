import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Boardroom",
  description: "Your AI co-founder team. You make every decision.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={publicSans.variable}>{children}</body>
    </html>
  );
}
