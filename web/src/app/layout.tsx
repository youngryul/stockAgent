import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";

import "./globals.css";

const sans = IBM_Plex_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Stock Agent",
  description: "한국·미국 주식 분석과 보유종목 관리",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactElement {
  return (
    <html lang="ko">
      <body className={`${sans.variable} ${mono.variable} font-sans text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
