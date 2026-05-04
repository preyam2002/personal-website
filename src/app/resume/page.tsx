import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import PrintButton from "@/components/PrintButton";

export const metadata = {
  title: "Vita — The Preyam Broadsheet",
  description: "Curriculum vitae of Preyam Rao.",
};

const profile = [
  "Software engineer working at the seams of prediction markets, AI tools, and low-latency systems. Equally at home writing Sui Move contracts, sub-microsecond C++ on a hot path, and TypeScript across a senior product surface.",
  "Currently shipping at Lumora Social ($140K grant) and building Aletheia, a decentralized prediction market on Sui. Open to senior engineering and founding roles at companies that take their primitives seriously.",
];

const experience = [
  {
    period: "2024 — Present",
    role: "Engineer",
    company: "Lumora Social",
    place: "Web3 social, Sui",
    points: [
      "Built event-driven feed and social-graph infrastructure for a $140K-grant-funded social platform on Sui.",
      "Tightened query strategy and indexing to reduce p95 latency on the busiest endpoints.",
      "Authored on-call playbooks and pre-release safety gates that lowered incident frequency.",
    ],
  },
  {
    period: "2023 — 24",
    role: "Software Engineer",
    company: "Oracle",
    place: "Exadata, Bengaluru",
    points: [
      "Owned Exadata integration workflows for enterprise-scale database workloads.",
      "Improved deployment reliability through validation gates and pre-flight checks.",
      "Reduced operational incidents by tightening internal tooling and observability.",
    ],
  },
];

const education = [
  {
    period: "2019 — 23",
    role: "B.Tech, Computer Science",
    company: "Indian Institute of Technology, Kharagpur",
    place: "Kharagpur, West Bengal",
  },
];

const selectedWorks = [
  {
    name: "Aletheia",
    blurb: "Multi-outcome prediction markets on Sui. LMSR AMM, AI-resolved oracle, SEAL-encrypted appeal evidence. 15+ E2E tests against live testnet.",
    stack: "Sui Move · Next.js · MongoDB · OpenAI",
  },
  {
    name: "HFT Trading System",
    blurb: "Sub-microsecond C++17 engine with 1–3μs p50 tick-to-trade. Lock-free SPSC ring buffers, cache-line aligned market data, io_uring polling.",
    stack: "C++17 · SIMD · io_uring · FIX",
  },
  {
    name: "VibeShield",
    blurb: "Black-box DAST scanner. 54 attack modules including OWASP Top 10 and AI/LLM-specific checks. CI/CD integration with SARIF, JUnit, webhook exports.",
    stack: "Next.js · Cheerio · Redis · Docker",
  },
  {
    name: "Lumora Social",
    blurb: "Web3 social platform on Sui. Event-driven feed infra, eleven-package monorepo, $140K grant recipient.",
    stack: "Sui Move · TypeScript · Postgres",
  },
  {
    name: "Kindred",
    blurb: "Social taste-matching platform with 97 API endpoints and 16 viral surface features.",
    stack: "Next.js · Supabase · TS",
  },
  {
    name: "KeyFlow",
    blurb: "Vim-style keyboard shortcuts for the browser. Hint mode, marks, command palette, record mode. Manifest V3.",
    stack: "MV3 · TypeScript · Chrome",
  },
];

const recognition = [
  { what: "Patent", detail: "Filed (United States)" },
  { what: "Grant", detail: "$140K — Lumora Social" },
  { what: "Education", detail: "IIT Kharagpur, Computer Science (’23)" },
];

const stack = [
  "TypeScript", "C++17", "Python", "Sui Move", "Solidity",
  "Next.js", "React 19", "Three.js / R3F", "Tailwind",
  "PostgreSQL", "Redis", "MongoDB", "Supabase",
  "Docker", "io_uring", "SIMD", "FIX",
  "OpenAI", "Anthropic", "Claude Agent SDK",
];

export default function ResumePage() {
  return (
    <main className="resume-root">
      <Navigation />

      <section className="frame page-header resume-head">
        <div className="page-ornament">
          <span>Section IV</span>
          <span className="dot">●</span>
          <span>Page 01</span>
        </div>
        <p className="kicker kicker-vermillion">— Curriculum vitæ —</p>
        <h1 className="page-title">Vita</h1>
        <p className="page-dek">
          A working record of what I’ve shipped, where, and with whom. Updated
          when something changes worth recording.
        </p>
        <div className="resume-actions">
          <PrintButton className="resume-btn">
            Print / Save as PDF
          </PrintButton>
          <a
            href="mailto:preyam2002@gmail.com?subject=Resume%20Request"
            className="resume-btn ghost"
          >
            Request a PDF
          </a>
        </div>
      </section>

      <article className="frame resume-grid">
        <aside className="resume-meta">
          <div>
            <p className="kicker kicker-strong">Contact</p>
            <ul className="resume-meta-list">
              <li>
                <span className="label">Email</span>
                <a href="mailto:preyam2002@gmail.com">preyam2002@gmail.com</a>
              </li>
              <li>
                <span className="label">GitHub</span>
                <a href="https://github.com/preyam2002" target="_blank" rel="noopener noreferrer">
                  preyam2002
                </a>
              </li>
              <li>
                <span className="label">LinkedIn</span>
                <a href="https://linkedin.com/in/preyam" target="_blank" rel="noopener noreferrer">
                  /in/preyam
                </a>
              </li>
              <li>
                <span className="label">Site</span>
                <a href="/">preyam-rao.vercel.app</a>
              </li>
            </ul>
          </div>

          <div>
            <p className="kicker kicker-strong">Location</p>
            <p className="resume-meta-line">Bengaluru, IN</p>
            <p className="resume-meta-line dim">Open to remote / relocation</p>
          </div>

          <div>
            <p className="kicker kicker-strong">Recognition</p>
            <ul className="resume-meta-list">
              {recognition.map((r) => (
                <li key={r.what}>
                  <span className="label">{r.what}</span>
                  <span>{r.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="kicker kicker-strong">Looking for</p>
            <p className="resume-meta-line">
              Senior engineering or founding-engineer roles. Crypto, prediction
              markets, AI agents, infra. Selective freelance.
            </p>
          </div>
        </aside>

        <div className="resume-body">
          <section className="resume-section">
            <p className="kicker kicker-strong">Profile</p>
            {profile.map((p, i) => (
              <p key={i} className="resume-prose">
                {p}
              </p>
            ))}
          </section>

          <section className="resume-section">
            <p className="kicker kicker-strong">Experience</p>
            <div className="resume-list">
              {experience.map((x) => (
                <article key={x.company} className="resume-row">
                  <header className="resume-row-head">
                    <time>{x.period}</time>
                    <h3>
                      <span className="role">{x.role}</span>
                      <span className="dim"> · </span>
                      <span className="place">{x.company}</span>
                    </h3>
                    <p className="dim mono small">{x.place}</p>
                  </header>
                  <ul className="resume-points">
                    {x.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="resume-section">
            <p className="kicker kicker-strong">Education</p>
            <div className="resume-list">
              {education.map((x) => (
                <article key={x.company} className="resume-row">
                  <header className="resume-row-head">
                    <time>{x.period}</time>
                    <h3>
                      <span className="role">{x.role}</span>
                      <span className="dim"> · </span>
                      <span className="place">{x.company}</span>
                    </h3>
                    <p className="dim mono small">{x.place}</p>
                  </header>
                </article>
              ))}
            </div>
          </section>

          <section className="resume-section">
            <p className="kicker kicker-strong">Selected works</p>
            <p className="dim small" style={{ marginBottom: "1rem" }}>
              Full list at{" "}
              <Link href="/rankings" className="resume-link">
                /rankings
              </Link>
              .
            </p>
            <ol className="resume-works">
              {selectedWorks.map((w, i) => (
                <li key={w.name}>
                  <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{w.name}</h4>
                    <p className="resume-prose">{w.blurb}</p>
                    <p className="mono small dim">{w.stack}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="resume-section">
            <p className="kicker kicker-strong">Stack</p>
            <p className="resume-stack">
              {stack.map((s, i) => (
                <span key={s}>
                  {s}
                  {i < stack.length - 1 && <span className="sep">·</span>}
                </span>
              ))}
            </p>
          </section>

          <section className="resume-section">
            <p className="kicker kicker-strong">References</p>
            <p className="resume-prose dim">
              Furnished on request.
            </p>
          </section>
        </div>
      </article>

      <Footer />
    </main>
  );
}
