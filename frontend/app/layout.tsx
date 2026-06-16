import type { Metadata } from "next";
import "./tokens.css";
import "./globals.css";
import "./app.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: {
    default: "Soundcheck — a workforce that audits, fixes, and proves it",
    template: "%s · Soundcheck",
  },
  description:
    "A governed, replayable autonomous workforce for security & compliance remediation — built on Band. Agents audit a repo, map findings to controls, propose fixes, and review across models — you approve every change.",
  applicationName: "Soundcheck",
  openGraph: {
    title: "Soundcheck — a workforce that audits, fixes, and proves it",
    description:
      "A governed, replayable autonomous workforce for security & compliance remediation. Built on Band — every step provenance-tracked and replayable.",
    siteName: "Soundcheck",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Soundcheck" },
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
