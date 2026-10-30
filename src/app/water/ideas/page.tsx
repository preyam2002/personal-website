import type { Metadata } from "next";
import WaterIdeas from "./WaterIdeas";
export const metadata: Metadata = {
  title: "Water studies | Preyam Rao",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <WaterIdeas />;
}
