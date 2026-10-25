import type { Metadata } from "next";
import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "Gaze — stories along the way",
  description: "A train ride, a window seat, and a world of stories. Explore the California Zephyr with your personal audio companion.",
};

export default function Home() {
  return (
    <>
      <link rel="preload" href="/fonts/landing-libre-caslon-regular.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/landing-libre-caslon-italic.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      <LandingPage />
    </>
  );
}
