import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/schibsted-grotesk";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Both fonts ship inside npm packages (Schibsted Grotesk from @fontsource,
// Geist Mono from `geist`), so ApplyStack never needs to reach Google Fonts,
// even offline. globals.css maps --font-sans / --font-mono to them.
const mono = GeistMono;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#12141a" },
  ],
};

export const metadata: Metadata = {
  title: { default: "ApplyStack", template: "%s · ApplyStack" },
  description: "Internship discovery and truthful AI resume tailoring.",
};

const themeScript = `
(function () {
  try {
    var pref = localStorage.getItem("applystack-theme");
    var dark = pref ? pref === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
