import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SealMark from "@/components/SealMark";
import { getAllDispatches, formatDispatchDate } from "@/lib/dispatches";
import { getEditionNumber, getDateline } from "@/lib/edition";

const tickerItems = [
  "DISPATCH 04.29.2026",
  "MARKETS / OPEN",
  "ALETHEIA — TESTNET LIVE",
  "LUMORA — SUI MAINNET ✓",
  "HFT/LO — 1.2μs P50 TICK-TO-TRADE",
  "VIBESHIELD — 54 MODULES SHIPPED",
  "KEYFLOW — V1.2 RELEASED",
  "PATENT — FILED",
  "GRANT — $140K AWARDED",
  "IIT KGP CS '23",
  "ORACLE ALUMNUS",
  "OPEN TO COLLAB",
];

const works = [
  {
    sym: "ALETHEIA · 001",
    title: "Aletheia",
    sub: "Decentralized prediction markets on Sui — multi-outcome, AI-resolved, SEAL-encrypted.",
    tag: "SUI · MOVE · LMSR",
    url: "https://github.com/preyam2002/Aletheia",
  },
  {
    sym: "HFT/LO · 002",
    title: "HFT Trading System",
    sub: "Sub-microsecond C++17 engine. 1–3μs p50 tick-to-trade across Binance, Hyperliquid, Polymarket.",
    tag: "C++17 · SIMD · IO_URING",
    url: "https://github.com/preyam2002/HFT-system",
  },
  {
    sym: "VIBESHIELD · 003",
    title: "VibeShield",
    sub: "Black-box DAST scanner. 54 attack modules, OWASP Top 10 + AI/LLM-specific checks, CI exports.",
    tag: "NEXT · REDIS · DOCKER",
    url: "https://github.com/preyam2002/vibeshield",
  },
  {
    sym: "LUMORA · 004",
    title: "Lumora Social",
    sub: "Web3 social platform on Sui. Event-driven feed infra, $140K grant recipient.",
    tag: "SUI · TS · POSTGRES",
    url: "https://github.com/preyam2002",
  },
  {
    sym: "KEYFLOW · 005",
    title: "KeyFlow",
    sub: "Vim-style keyboard shortcuts for the browser. Hint mode, marks, command palette, record mode.",
    tag: "MV3 · TS · CHROME",
    url: "https://github.com/preyam2002/keyflow",
  },
  {
    sym: "ECHO · 006",
    title: "Echo Player",
    sub: "Local TTS audiobook reader. Kokoro-82M WASM, Audible-grade controls, fully on-device.",
    tag: "WASM · TS · LOCAL",
    url: "https://github.com/preyam2002/echo-player",
  },
];

const apparatus = [
  { period: "2024 —", role: "Engineer", place: "Lumora Social" },
  { period: "2023 — 24", role: "Software Engineer", place: "Oracle · Exadata" },
  { period: "2019 — 23", role: "B.Tech, Computer Science", place: "Indian Institute of Technology, Kharagpur" },
];

const elsewhere = [
  { label: "GitHub", url: "https://github.com/preyam2002" },
  { label: "LinkedIn", url: "https://linkedin.com/in/preyam" },
  { label: "Chess.com", url: "https://www.chess.com/member/preyam2002" },
  { label: "Lichess", url: "https://lichess.org/@/preyam2002" },
  { label: "Letterboxd", url: "https://letterboxd.com/preyam2002/" },
  { label: "Goodreads", url: "https://www.goodreads.com/user/show/preyam2002" },
  { label: "Codeforces", url: "https://codeforces.com/profile/preyam2002" },
  { label: "LeetCode", url: "https://leetcode.com/u/preyam2002/" },
];

export default function Home() {
  const edition = getEditionNumber();
  const dateline = getDateline();
  const dispatches = getAllDispatches().slice(0, 2);
  return (
    <main>
      <div className="ticker-bar" aria-hidden="true">
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((t, i) => (
            <span key={i} className="ticker-item">
              {t} <span className="v">◆</span>
            </span>
          ))}
        </div>
      </div>

      <Navigation />

      <section className="frame hero">
        <div className="hero-seal" aria-hidden="true">
          <SealMark issue={edition} />
        </div>
        <div className="dateline">
          <span className="pill">Issue Nº {String(edition).padStart(3, "0")}</span>
          <span className="meta">Vol. I — {dateline} — Bengaluru, IN</span>
        </div>
        <h1 className="hero-name">
          <span className="line">
            <span>Preyam</span>
          </span>
          <span className="line italic">
            <span>Rao</span>
          </span>
        </h1>
        <p className="hero-sub">
          A software engineer working at the seams of <em>prediction markets</em>,{" "}
          <em>AI tools</em>, and <em>low-latency systems</em> — from Sui Move
          contracts to sub-microsecond C++ trading engines.
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
          <span className="sep">/</span>
          <Link href="/resume">resume</Link>
          <span className="sep">/</span>
          <span className="footnote">* open to senior eng &amp; founding roles</span>
        </div>
      </section>

      <section className="frame dispatch" id="dispatch">
        <div className="dispatch-header">
          <p className="kicker kicker-strong">— Dispatch from the desk —</p>
          <p className="kicker">Filed 04.29.2026 · 04:21 IST</p>
        </div>
        <div className="dispatch-grid">
          <aside className="dispatch-meta">
            <div className="tag">NOW</div>
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
            <hr />
            <div>
              <span className="label">PATENT /</span>{" "}
              <span className="value">filed</span>
            </div>
            <div>
              <span className="label">GRANT /</span>{" "}
              <span className="value">$140K, awarded</span>
            </div>
            <hr />
            <div className="tag">FOR HIRE</div>
            <div>
              <span className="value">preyam2002@gmail.com</span>
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
              prediction market with AI-resolved outcomes, SEAL-encrypted state,
              and an LMSR market maker. And a sub-microsecond C++ trading
              engine — io_uring, lock-free SPSC ring buffers, cache-line-aligned
              market data, integrations across Binance, Hyperliquid, Polymarket.
            </p>
            <p>
              Previously at <em>Oracle</em> on Exadata, then full-time on the
              applied side of crypto. Computer Science at <em>IIT Kharagpur</em>.
              One US patent filed; one $140K grant in the bank. Open to senior
              engineering and founding roles at companies that take their
              primitives seriously.
            </p>
          </article>
        </div>
      </section>

      <section className="frame index" id="work">
        <div className="index-head">
          <p className="kicker kicker-strong">Index of Works</p>
          <p className="kicker">№ · Symbol · Brief · Tag · Open</p>
        </div>
        <ol className="index-list">
          {works.map((w, i) => (
            <li key={w.sym} className="index-row">
              <a href={w.url} target="_blank" rel="noopener noreferrer">
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <span className="sym">{w.sym}</span>
                <div className="desc">
                  <span className="title">{w.title}</span>
                  <span className="sub">{w.sub}</span>
                </div>
                <span className="tag">{w.tag}</span>
                <span className="open">Open ↗</span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section className="frame dispatches-preview" id="from-the-desk">
        <div className="index-head">
          <p className="kicker kicker-strong">From the Dispatches</p>
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
                Nº {String(i + 1).padStart(2, "0")}
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
          <p className="kicker">Period · Role · Place</p>
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
          <p className="kicker">Profiles &amp; correspondence</p>
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
