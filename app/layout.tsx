import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display serif, reserved for a collection's big title — the rest
// of the app stays on Geist Sans.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["italic", "normal"],
});

export const metadata: Metadata = {
  title: "Onyx",
  description: "Private space to connect with your fans",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Dark premium/editorial is this app's one visual identity, not a
      // togglable preference — always applying `dark` here (rather than
      // following prefers-color-scheme) keeps the amber-on-near-black theme
      // consistent regardless of the visitor's OS setting.
      className={`dark ${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
