import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SealMark from "@/components/SealMark";

export const metadata = {
  title: "Errata — The Preyam Broadsheet",
  description: "This page has been pulled from the edition.",
};

export default function NotFound() {
  return (
    <main>
      <Navigation />

      <section className="frame errata">
        <div className="errata-seal" aria-hidden="true">
          <SealMark issue="404" />
        </div>
        <div className="page-ornament">
          <span>Errata</span>
          <span className="dot">●</span>
          <span>Edition Nº —</span>
        </div>
        <p className="kicker kicker-vermillion">
          — pulled from this edition —
        </p>
        <h1 className="errata-title">
          The page you sought has been withdrawn.
        </h1>
        <p className="errata-dek">
          It has been retitled, never filed, or was clipped from the printer’s
          plate at the last minute. Either way, the desk apologises.
        </p>
        <div className="errata-links">
          <Link href="/">← Return to the front page</Link>
          <Link href="/dispatches">→ Browse all dispatches</Link>
          <Link href="/rankings">→ See the rankings</Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
