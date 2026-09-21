import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oleak - Performance de mídia paga",
  description: "Dashboard de resultados de campanhas (Google Ads e Meta Ads) da Oleak",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
