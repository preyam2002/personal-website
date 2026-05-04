// Temporarily disabled. Resume + rankings will return reworked from a single
// source of truth. For now we redirect everything back to the home page.
import { redirect } from "next/navigation";

export default function ResumePage() {
  redirect("/");
}
