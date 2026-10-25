import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { LOCALE_BOOT_SCRIPT } from "@/lib/i18n-boot";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gaze",
  description:
    "Point. Discover. Keep. Point your phone out the train window and hear the stories of the places you pass.",
  applicationName: "Gaze",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Gaze",
  },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eaedf3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The boot script sets lang/dir from the saved language before first paint.
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
