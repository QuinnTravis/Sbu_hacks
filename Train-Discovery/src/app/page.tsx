import { DiscoveryApp } from "@/components/discovery-app";
import rail from "../../public/data/networks/california-zephyr/rail.json";
import type { RailData } from "@/lib/types";

/** The default network's routes ship with the page; others load on request. */
export default function Home() {
  return <DiscoveryApp rail={rail as unknown as RailData} />;
}
