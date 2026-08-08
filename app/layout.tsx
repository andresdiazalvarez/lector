import type { Metadata } from "next";
import { DM_Sans, Libre_Baskerville } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const libre = Libre_Baskerville({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Lector — Escucha tus documentos",
  description: "Convierte documentos en voz y escúchalos a tu ritmo, directamente en tu dispositivo.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${dmSans.variable} ${libre.variable}`}>{children}</body></html>;
}
