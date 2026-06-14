import type { Metadata } from "next";
import "./tokens.css";
import "./globals.css";
import "./app.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Soundcheck",
  description:
    "A governed, replayable autonomous workforce for security & compliance remediation — built on Band.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
