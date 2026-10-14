import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elo Criativo — Performance de mídia paga",
  description: "Dashboards de resultados de campanhas (Google Ads e Meta Ads) dos clientes da Elo Criativo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
