import type { Metadata } from "next";
import { DiscoveryApp } from "@/components/discovery-app";
import rail from "../../../public/data/networks/california-zephyr/rail.json";
import type { RailData } from "@/lib/types";

export const metadata: Metadata = {
  title: "Gaze — Your journey",
  description: "Explore the California Zephyr and hear the stories outside your train window.",
};

export default function JourneyPage() {
  return <DiscoveryApp rail={rail as unknown as RailData} />;
}
