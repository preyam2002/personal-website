import type { Metadata } from "next";
import OceanGameLoader from "@/game/OceanGameLoader";

export const metadata: Metadata = {
  title: "Open Water — an ocean dive",
  description: "Dive into an open ocean, swim with whales and sharks, find a shipwreck, and photograph sea life for your field journal.",
  alternates: { canonical: "/game" },
};

export default function GamePage() {
  return <OceanGameLoader />;
}
