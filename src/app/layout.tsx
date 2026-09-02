import type { Metadata } from "next";
import { Farro, Balthazar, Cinzel, Quintessential, Grenze_Gotisch, Lexend } from "next/font/google";
import "./globals.css";

const farro = Farro({
  variable: "--font-farro",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const balthazar = Balthazar({
  variable: "--font-balthazar",
  subsets: ["latin"],
  weight: "400",
});

const quintessential = Quintessential({
  variable: "--font-quintessential",
  subsets: ["latin"],
  weight: "400",
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const grenzeGotisch = Grenze_Gotisch({
  variable: "--font-grenze-gotisch",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kingdoms & Crowns — Be the Hero of Homeschool",
  description:
    "A magical companion for homeschool families. Chronicle daily quests, summon weekly scrolls of progress, and chart your path to glory.",
  icons: {
    icon: "/crown.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${farro.variable} ${balthazar.variable} ${quintessential.variable} ${cinzel.variable} ${grenzeGotisch.variable} ${lexend.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
