import { DiscoveryApp } from "@/components/discovery-app";
import rail from "../../public/data/lirr.json";
import type { RailData } from "@/lib/types";

export default function Home() {
  return <DiscoveryApp rail={rail as RailData} />;
}
