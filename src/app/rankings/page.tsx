// Temporarily disabled. The voting/ranking system will come back wired into
// the resume rebuild. For now we redirect to home.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RankingsPage() {
  redirect("/");
}
