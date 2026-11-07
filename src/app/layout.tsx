import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ?? "https://reporter-to-release.pallabdas.me",
  ),
  title: {
    default: "Reporter-to-Release | A better ending for every bug",
    template: "%s | Reporter-to-Release",
  },
  description:
    "A bug desk that connects public reports to proven reproductions, human-reviewed fixes and releases confirmed by the people who reported them. Built by Team Vulcan on Switch.",
  openGraph: {
    title: "Reporter-to-Release",
    description:
      "Every report deserves a resolution. Follow the evidence from first report to confirmed release.",
    type: "website",
  },
  robots: { index: true, follow: true },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
