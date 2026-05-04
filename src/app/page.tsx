import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { getAllDispatches, formatDispatchDate } from "@/lib/dispatches";

const tickerItems = [
  "Lumora — Sui mainnet",
  "Aletheia — testnet live",
  "HFT — 1.2μs p50",
  "VibeShield — 54 modules",
  "KeyFlow — v1.2",
  "Echo Player — local TTS",
  "Now reading: more than I should be",
];

type Project = {
  title: string;
  sub: string;
  stack: string;
  repo?: string;
  live?: string;
};

const works: Project[] = [
  {
    title: "Aletheia",
    sub: "Decentralized prediction markets on Sui — multi-outcome, AI-resolved, SEAL-encrypted.",
    stack: "Sui Move · Next.js · LMSR · OpenAI",
    repo: "https://github.com/preyam2002/Aletheia",
  },
  {
    title: "HFT Trading System",
    sub: "Sub-microsecond C++ engine. 1–3μs p50 tick-to-trade across major venues.",
    stack: "C++17 · SIMD · io_uring · FIX",
    repo: "https://github.com/preyam2002/HFT-system",
  },
  {
    title: "VibeShield",
    sub: "Black-box DAST scanner. 54 attack modules, OWASP Top 10 + AI/LLM checks, CI exports.",
    stack: "Next.js · Cheerio · Redis · Docker",
    repo: "https://github.com/preyam2002/vibeshield",
  },
  {
    title: "Lumora Social",
    sub: "Web3 social platform on Sui. Event-driven feed infrastructure.",
    stack: "Sui Move · TypeScript · Postgres",
    repo: "https://github.com/preyam2002",
  },
  {
    title: "KeyFlow",
    sub: "Vim-style keyboard shortcuts for the browser. Hint mode, marks, command palette.",
    stack: "MV3 · TypeScript · Chrome",
    repo: "https://github.com/preyam2002/keyflow",
  },
  {
    title: "Echo Player",
    sub: "Local TTS audiobook reader with Kokoro-82M WASM. Audible-grade, fully on-device.",
    stack: "WASM · TypeScript · local-first",
    repo: "https://github.com/preyam2002/echo-player",
  },
];

const apparatus = [
  { period: "2024 —", role: "Engineer", place: "Lumora Social" },
  { period: "2023 — 24", role: "Software Engineer", place: "Oracle · Exadata" },
  { period: "2019 — 23", role: "B.Tech, Computer Science", place: "IIT Kharagpur" },
];

const elsewhere = [
  { label: "GitHub", url: "https://github.com/preyam2002" },
  { label: "LinkedIn", url: "https://linkedin.com/in/preyam" },
  { label: "Chess.com", url: "https://www.chess.com/member/preyam2002" },
  { label: "Lichess", url: "https://lichess.org/@/preyam" },
  { label: "Letterboxd", url: "https://letterboxd.com/preyam/" },
  { label: "Goodreads", url: "https://www.goodreads.com/user/show/44002045-preyam-rao" },
  { label: "Codeforces", url: "https://codeforces.com/profile/preyam" },
];

export default function Home() {
  const dispatches = getAllDispatches().slice(0, 2);
  return (
    <main>
      <div className="ticker-bar" aria-hidden="true">
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((t, i) => (
            <span key={i} className="ticker-item">
              {t}
            </span>
          ))}
        </div>
      </div>

      <Navigation />

      <section className="frame hero">
        <h1 className="hero-name">
          <span className="line">
            <span>Preyam</span>
          </span>
          <span className="line italic">
            <span>Rao</span>
          </span>
        </h1>
        <p className="hero-sub">
          Software engineer working across the web, AI, and systems.
          Currently at Lumora Social. Previously at Oracle. CS, IIT Kharagpur.
        </p>
        <div className="hero-foot">
          <a href="mailto:preyam2002@gmail.com">preyam2002@gmail.com</a>
          <span className="sep">/</span>
          <a href="https://github.com/preyam2002" target="_blank" rel="noopener noreferrer">
            github
          </a>
          <span className="sep">/</span>
          <a href="https://linkedin.com/in/preyam" target="_blank" rel="noopener noreferrer">
            linkedin
          </a>
        </div>
      </section>

      <section className="frame dispatch" id="dispatch">
        <div className="dispatch-header">
          <p className="kicker kicker-strong">— From the desk —</p>
        </div>
        <div className="dispatch-grid">
          <aside className="dispatch-meta">
            <div>
              <span className="label">SHIPPING /</span>{" "}
              <span className="value">Lumora Social, Sui</span>
            </div>
            <div>
              <span className="label">SIDE /</span>{" "}
              <span className="value">Aletheia, Move primitives</span>
            </div>
            <hr />
            <div>
              <span className="label">PRIOR /</span>{" "}
              <span className="value">Oracle, Exadata reliability</span>
            </div>
            <div>
              <span className="label">EDU /</span>{" "}
              <span className="value">IIT Kharagpur CS, 2023</span>
            </div>
          </aside>
          <article className="dispatch-body">
            <p>
              <span className="dropcap">B</span>uilding <em>Lumora</em> — a Web3
              social platform on Sui — and writing Move contracts for new market
              primitives. The work sits between distributed systems and
              economic design: how the chain settles, how feeds rank, how an
              event becomes a shared belief.
            </p>
            <p>
              Off-hours, two threads. <em>Aletheia</em>, a decentralized
              prediction market with AI-resolved outcomes. And a sub-microsecond
              C++ trading engine — io_uring, lock-free SPSC ring buffers,
              cache-line-aligned market data.
            </p>
          </article>
        </div>
      </section>

      <section className="frame index" id="work">
        <div className="index-head">
          <p className="kicker kicker-strong">Work</p>
        </div>
        <ol className="index-list">
          {works.map((w, i) => (
            <li key={w.title} className="index-row">
              <div className="row-inner">
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <div className="desc">
                  <span className="title">{w.title}</span>
                  <span className="sub">{w.sub}</span>
                  <span className="stack">{w.stack}</span>
                </div>
                <div className="row-links">
                  {w.repo && (
                    <a
                      href={w.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="row-link"
                    >
                      Repo ↗
                    </a>
                  )}
                  {w.live && (
                    <a
                      href={w.live}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="row-link"
                    >
                      Live ↗
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="frame dispatches-preview" id="from-the-desk">
        <div className="index-head">
          <p className="kicker kicker-strong">Dispatches</p>
          <Link href="/dispatches" className="kicker kicker-vermillion">
            All filings ↗
          </Link>
        </div>
        <div className="dispatches-grid">
          {dispatches.map((d, i) => (
            <Link
              key={d.slug}
              href={`/dispatches/${d.slug}`}
              className="dispatch-card"
            >
              <span className="dispatch-card-num">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="dispatch-card-meta">
                {formatDispatchDate(d.date)}
                {d.reading && <> · {d.reading}</>}
              </span>
              <h3 className="dispatch-card-title">{d.title}</h3>
              <p className="dispatch-card-dek">{d.dek}</p>
              <span className="dispatch-card-cta">Read dispatch →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="frame apparatus" id="apparatus">
        <div className="apparatus-head">
          <p className="kicker kicker-strong">Apparatus</p>
        </div>
        <ul className="apparatus-list">
          {apparatus.map((a) => (
            <li key={a.place} className="apparatus-row">
              <time>{a.period}</time>
              <span className="role">{a.role}</span>
              <span className="place">{a.place}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="frame elsewhere" id="elsewhere">
        <div className="elsewhere-head">
          <p className="kicker kicker-strong">Elsewhere</p>
        </div>
        <p className="elsewhere-list">
          {elsewhere.map((e, i) => (
            <span key={e.label}>
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                {e.label}
              </a>
              {i < elsewhere.length - 1 && <span className="sep">·</span>}
            </span>
          ))}
        </p>
      </section>

      <Footer />
    </main>
  );
}
