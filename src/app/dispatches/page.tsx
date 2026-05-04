import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import {
  getAllDispatches,
  formatDispatchDate,
} from "@/lib/dispatches";

export const metadata = {
  title: "Dispatches — The Preyam Broadsheet",
  description:
    "Notes from the desk on systems, markets, and the work itself.",
};

export default function DispatchesPage() {
  const dispatches = getAllDispatches();

  return (
    <main>
      <Navigation />

      <section className="frame page-header">
        <div className="page-ornament">
          <span>Section II</span>
          <span className="dot">●</span>
          <span>Page 01</span>
        </div>
        <p className="kicker kicker-vermillion">— Dispatches —</p>
        <h1 className="page-title">From the desk</h1>
        <p className="page-dek">
          Notes on systems, markets, and the work itself. Filed irregularly,
          edited slowly, kept honest.
        </p>
      </section>

      <section className="frame index" aria-label="Dispatch index">
        <div className="index-head">
          <p className="kicker kicker-strong">Index of dispatches</p>
          <p className="kicker">№ · Date · Title · Tags</p>
        </div>

        {dispatches.length === 0 ? (
          <p className="dim mono" style={{ padding: "2rem 0" }}>
            No dispatches filed yet. The desk is quiet.
          </p>
        ) : (
          <ol className="index-list">
            {dispatches.map((d, i) => (
              <li key={d.slug} className="index-row dispatch-row">
                <Link href={`/dispatches/${d.slug}`}>
                  <span className="num">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="dispatch-date">
                    {formatDispatchDate(d.date)}
                  </span>
                  <div className="desc">
                    <span className="title">{d.title}</span>
                    <span className="sub">{d.dek}</span>
                  </div>
                  <span className="tag">
                    {(d.tags ?? []).slice(0, 3).join(" · ")}
                  </span>
                  <span className="open">Read ↗</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Footer />
    </main>
  );
}
