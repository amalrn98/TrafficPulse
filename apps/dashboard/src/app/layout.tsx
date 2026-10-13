import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrafficPulse: Agentic Era Web Traffic Analytics',
  description: 'Production-grade analytics platform to detect, classify, and visualize AI agents, LLM scrapers, bot crawlers, and organic human visitors.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090d16] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
