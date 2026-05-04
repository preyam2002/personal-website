import { cookies } from "next/headers";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import VoteButtons from "@/components/VoteButtons";
import { getAllVotes, votingEnvironment, type VoteKind } from "@/lib/store";
import { projects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rankings — The Preyam Broadsheet",
  description:
    "Projects, ordered by how much you all liked them. Vote to reshuffle.",
};

export default async function RankingsPage() {
  const cookieStore = await cookies();
  const ids = projects.map((p) => p.id);
  const counts = await getAllVotes(ids);

  const ranked = projects
    .map((p) => {
      const c = counts[p.id] ?? { up: 0, down: 0 };
      const cookieVal = cookieStore.get(`vote_${p.id}`)?.value;
      const myVote: VoteKind | null =
        cookieVal === "up" || cookieVal === "down" ? cookieVal : null;
      return { ...p, up: c.up, down: c.down, score: c.up - c.down, myVote };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.up - a.up;
    });

  return (
    <main>
      <Navigation />

      <section className="frame page-header">
        <div className="page-ornament">
          <span>Section III</span>
          <span className="dot">●</span>
          <span>Page 01</span>
        </div>
        <p className="kicker kicker-vermillion">— Public listings —</p>
        <h1 className="page-title">Rankings</h1>
        <p className="page-dek">
          A working list of projects, ordered by reader vote. Tap{" "}
          <span className="vermillion">▲</span> if you like one, tap{" "}
          <span className="vermillion">▼</span> if you don’t. The order
          reshuffles. Tap your own vote again to take it back.
        </p>
        {votingEnvironment === "memory" && (
          <p className="kicker dim" style={{ marginTop: "0.75rem" }}>
            * dev mode: votes are stored in memory and reset on restart
          </p>
        )}
      </section>

      <section className="frame rankings">
        <div className="index-head">
          <p className="kicker kicker-strong">Listings</p>
          <p className="kicker">Rank · Symbol · Project · Era · Vote</p>
        </div>

        <ol className="rank-list">
          {ranked.map((p, i) => (
            <li key={p.id} className="rank-row">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rank-link"
              >
                <span className="rank-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="rank-sym">{p.symbol}</span>
                <span className="rank-body">
                  <span className="rank-title">{p.name}</span>
                  <span className="rank-sub">{p.dek}</span>
                  <span className="rank-meta">
                    <span className="rank-era">{p.era}</span>
                    <span className="sep">·</span>
                    <span className="rank-tag">{p.tag}</span>
                  </span>
                </span>
              </a>
              <div className="rank-vote">
                <VoteButtons
                  id={p.id}
                  initialUp={p.up}
                  initialDown={p.down}
                  initialVote={p.myVote}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Footer />
    </main>
  );
}
