import Link from "next/link";
import SignalField from "@/components/SignalField";
import { formatDispatchDate, getAllDispatches } from "@/lib/dispatches";

type GlyphName = "market" | "latency" | "security" | "network";

type FeaturedProject = {
  code: string;
  title: string;
  category: string;
  description: string;
  proof: string;
  stack: string;
  url: string;
  glyph: GlyphName;
};

const featuredProjects: FeaturedProject[] = [
  {
    code: "MK / 01",
    title: "Aletheia",
    category: "Prediction markets",
    description:
      "A decentralized market protocol on Sui for multi-outcome questions, AI-assisted resolution, and encrypted position intent.",
    proof: "LMSR market mechanics · SEAL-encrypted flows · Sui testnet",
    stack: "Sui Move / Next.js / LMSR / OpenAI",
    url: "https://github.com/preyam2002/Aletheia",
    glyph: "market",
  },
  {
    code: "SY / 02",
    title: "HFT engine",
    category: "Low-latency systems",
    description:
      "A C++ trading engine built around cache-aware market data, lock-free queues, venue adapters, and measured tick-to-trade latency.",
    proof: "1–3μs p50 tick-to-trade · SIMD · io_uring",
    stack: "C++17 / FIX / SPSC / Linux",
    url: "https://github.com/preyam2002/HFT-system",
    glyph: "latency",
  },
  {
    code: "SC / 03",
    title: "VibeShield",
    category: "Offensive security",
    description:
      "A black-box application scanner that turns adversarial checks into reproducible evidence for developers and CI systems.",
    proof: "54 attack modules · OWASP + AI/LLM checks · SARIF exports",
    stack: "Next.js / Redis / Docker / DAST",
    url: "https://github.com/preyam2002/vibeshield",
    glyph: "security",
  },
  {
    code: "NW / 04",
    title: "Lumora Social",
    category: "Protocol + product",
    description:
      "An event-driven social platform on Sui, connecting on-chain identity with feed infrastructure and consumer-grade interaction.",
    proof: "$140K grant recipient · production-scale product work",
    stack: "Sui / TypeScript / Postgres / Event systems",
    url: "https://github.com/preyam2002/Lumora-social",
    glyph: "network",
  },
];

const smallerProjects = [
  {
    title: "Echo Player",
    detail: "Local-first TTS audiobook player with Kokoro-82M WASM.",
    url: "https://github.com/preyam2002/echo-player",
  },
  {
    title: "KeyFlow",
    detail: "Vim-style navigation, marks, and command palette for Chrome.",
    url: "https://github.com/preyam2002/keyflow",
  },
  {
    title: "AI Vim Golf",
    detail: "A controlled arena where models compete on Vim editing tasks.",
    url: "https://github.com/preyam2002/ai-vim-golf-arena",
  },
];

const experience = [
  ["Now", "Engineer", "Lumora Social"],
  ["2023–24", "Software engineer", "Oracle · Exadata"],
  ["2019–23", "B.Tech, Computer Science", "IIT Kharagpur"],
];

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 16 16 4M7 4h9v9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ProjectGlyph({ name }: { name: GlyphName }) {
  if (name === "market") {
    return (
      <svg className="obs-glyph" viewBox="0 0 640 360" aria-hidden="true">
        <path className="obs-glyph-grid" d="M40 60H600M40 120H600M40 180H600M40 240H600M40 300H600M120 30V330M220 30V330M320 30V330M420 30V330M520 30V330" />
        <path className="obs-glyph-line" d="M52 278C116 280 128 238 187 235S272 260 320 190 407 101 468 129 531 100 590 60" />
        <path className="obs-glyph-accent" d="M320 190 468 129" />
        <g className="obs-glyph-points">
          <circle cx="52" cy="278" r="5" /><circle cx="187" cy="235" r="5" />
          <circle cx="320" cy="190" r="8" /><circle cx="468" cy="129" r="8" />
          <circle cx="590" cy="60" r="5" />
        </g>
        <text x="48" y="320">MARKET PROBABILITY SURFACE</text>
        <text x="462" y="115">0.73</text>
      </svg>
    );
  }

  if (name === "latency") {
    return (
      <svg className="obs-glyph" viewBox="0 0 640 360" aria-hidden="true">
        <path className="obs-glyph-grid" d="M40 70H600M40 140H600M40 210H600M40 280H600M110 30V330M210 30V330M310 30V330M410 30V330M510 30V330" />
        <path className="obs-glyph-line" d="M42 190h90l12-54 22 118 21-70 27 6 16-34 16 34h71l13-18 16 18h58l12-78 24 148 18-70h122" />
        <path className="obs-glyph-accent" d="M416 112 440 260 458 190" />
        <path className="obs-glyph-marker" d="M440 42V318" />
        <text x="42" y="325">TICK → DECISION → ORDER</text>
        <text x="452" y="75">1.2 μs</text>
      </svg>
    );
  }

  if (name === "security") {
    return (
      <svg className="obs-glyph" viewBox="0 0 640 360" aria-hidden="true">
        <path className="obs-glyph-grid" d="M40 60H600M40 120H600M40 180H600M40 240H600M40 300H600M100 30V330M200 30V330M300 30V330M400 30V330M500 30V330" />
        <circle className="obs-glyph-line" cx="320" cy="180" r="116" />
        <circle className="obs-glyph-line" cx="320" cy="180" r="68" />
        <path className="obs-glyph-line" d="m320 64 78 198-192-71 192-65-78 116-34-62Z" />
        <path className="obs-glyph-accent" d="M320 180 398 126" />
        <circle className="obs-glyph-target" cx="398" cy="126" r="11" />
        <text x="42" y="325">ADVERSARIAL COVERAGE MAP</text>
        <text x="420" y="120">VECTOR 37</text>
      </svg>
    );
  }

  return (
    <svg className="obs-glyph" viewBox="0 0 640 360" aria-hidden="true">
      <path className="obs-glyph-grid" d="M40 60H600M40 120H600M40 180H600M40 240H600M40 300H600M110 30V330M210 30V330M310 30V330M410 30V330M510 30V330" />
      <g className="obs-glyph-line">
        <path d="M108 202 210 102 320 178 421 78 534 186M108 202l84 74 128-98 97 92 117-84M210 102l-18 174M421 78l-4 192" />
      </g>
      <g className="obs-glyph-points">
        <circle cx="108" cy="202" r="6" /><circle cx="210" cy="102" r="7" />
        <circle cx="192" cy="276" r="5" /><circle cx="320" cy="178" r="10" />
        <circle cx="421" cy="78" r="6" /><circle cx="417" cy="270" r="5" />
        <circle cx="534" cy="186" r="7" />
      </g>
      <circle className="obs-glyph-target" cx="320" cy="178" r="24" />
      <text x="42" y="325">EVENT PROPAGATION GRAPH</text>
      <text x="342" y="166">ROOT</text>
    </svg>
  );
}

export default function Home() {
  const dispatches = getAllDispatches().slice(0, 2);

  return (
    <main className="observatory">
      <section className="obs-hero" id="top">
        <div className="obs-coordinate-grid" aria-hidden="true" />
        <SignalField />

        <header className="obs-nav obs-shell">
          <Link href="#top" className="obs-mark" aria-label="Preyam Rao, home">
            PR<span>/</span>
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="#work">Work</Link>
            <Link href="#practice">Method</Link>
            <Link href="/dispatches">Writing</Link>
            <a href="mailto:preyam2002@gmail.com">Contact</a>
          </nav>
          <p className="obs-location"><span /> Bengaluru · IST</p>
        </header>

        <div className="obs-hero-copy obs-shell">
          <p className="obs-eyebrow">Engineer for markets, protocols &amp; intelligent systems</p>
          <h1>
            <span>Preyam <i>/</i></span>
            <span>Rao</span>
          </h1>
          <p className="obs-intro">
            I build systems that have to stay clear under pressure—market mechanisms,
            on-chain protocols, security tools, and low-latency infrastructure.
          </p>
        </div>

        <div className="obs-disciplines obs-shell">
          <div>
            <span>Field 01</span>
            <strong>Markets</strong>
            <p>Mechanism design, pricing, execution.</p>
          </div>
          <div>
            <span>Field 02</span>
            <strong>Protocols</strong>
            <p>Sui Move, audits, adversarial research.</p>
          </div>
          <div>
            <span>Field 03</span>
            <strong>Systems</strong>
            <p>Rust/C++, agents, real-time data.</p>
          </div>
        </div>
      </section>

      <section className="obs-proof" aria-label="Selected evidence">
        <div className="obs-shell obs-proof-grid">
          <div><strong>1–3μs</strong><span>Measured HFT p50</span></div>
          <div><strong>54</strong><span>Security attack modules</span></div>
          <div><strong>$140K</strong><span>Grant-backed product</span></div>
          <div><strong>IIT KGP</strong><span>Computer Science ’23</span></div>
        </div>
      </section>

      <section className="obs-work obs-shell" id="work">
        <div className="obs-section-head">
          <p className="obs-kicker">Selected systems</p>
          <h2>Ideas are cheap.<br />Evidence is the work.</h2>
          <p>
            A few projects where mechanism, implementation, and verification all matter.
          </p>
        </div>

        <div className="obs-projects">
          {featuredProjects.map((project, index) => (
            <article className={`obs-project obs-project-${index + 1}`} key={project.title}>
              <div className="obs-project-copy">
                <div className="obs-project-meta">
                  <span>{project.code}</span>
                  <span>{project.category}</span>
                </div>
                <h3>{project.title}</h3>
                <p className="obs-project-description">{project.description}</p>
                <p className="obs-project-proof">{project.proof}</p>
                <p className="obs-project-stack">{project.stack}</p>
                <a href={project.url} target="_blank" rel="noopener noreferrer" className="obs-project-link">
                  Inspect project <Arrow />
                </a>
              </div>
              <div className="obs-project-visual">
                <span className="obs-visual-label">Live model / {project.code}</span>
                <ProjectGlyph name={project.glyph} />
              </div>
            </article>
          ))}
        </div>

        <div className="obs-more-work">
          <p className="obs-kicker">More in the workshop</p>
          <div>
            {smallerProjects.map((project) => (
              <a href={project.url} target="_blank" rel="noopener noreferrer" key={project.title}>
                <strong>{project.title}</strong>
                <span>{project.detail}</span>
                <Arrow />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="obs-practice" id="practice">
        <div className="obs-shell">
          <div className="obs-practice-intro">
            <p className="obs-kicker">Operating model</p>
            <h2>Research deeply.<br />Build the real thing.<br /><em>Prove what works.</em></h2>
          </div>
          <div className="obs-methods">
            <article>
              <span>01 / Research</span>
              <h3>Map the system</h3>
              <p>Read sources, trace call paths, and define the evidence boundary before choosing a solution.</p>
            </article>
            <article>
              <span>02 / Build</span>
              <h3>Collapse the distance</h3>
              <p>Move from hypothesis to a working system quickly, while preserving the invariants that matter.</p>
            </article>
            <article>
              <span>03 / Verify</span>
              <h3>Make claims earn trust</h3>
              <p>Measure latency, exercise real flows, test adversarially, and separate proof from optimism.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="obs-notes obs-shell" id="writing">
        <div className="obs-section-head obs-section-head-compact">
          <p className="obs-kicker">Field notes</p>
          <h2>Thinking in public.</h2>
          <Link href="/dispatches" className="obs-text-link">All dispatches <Arrow /></Link>
        </div>
        <div className="obs-note-grid">
          {dispatches.map((dispatch, index) => (
            <Link href={`/dispatches/${dispatch.slug}`} className="obs-note" key={dispatch.slug}>
              <span className="obs-note-index">D/{String(index + 1).padStart(2, "0")}</span>
              <p>{formatDispatchDate(dispatch.date)}{dispatch.reading ? ` · ${dispatch.reading}` : ""}</p>
              <h3>{dispatch.title}</h3>
              <span className="obs-note-dek">{dispatch.dek}</span>
              <span className="obs-note-cta">Open dispatch <Arrow /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="obs-trajectory obs-shell" aria-labelledby="trajectory-title">
        <div>
          <p className="obs-kicker">Trajectory</p>
          <h2 id="trajectory-title">Built from first principles,<br />across the stack.</h2>
        </div>
        <ol>
          {experience.map(([period, role, place]) => (
            <li key={place}>
              <time>{period}</time>
              <strong>{role}</strong>
              <span>{place}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="obs-contact" id="contact">
        <div className="obs-shell">
          <p className="obs-kicker">Open channel</p>
          <h2>Have a hard system<br />worth building?</h2>
          <a href="mailto:preyam2002@gmail.com" className="obs-contact-link">
            preyam2002@gmail.com <Arrow />
          </a>
          <div className="obs-socials">
            <a href="https://github.com/preyam2002" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://linkedin.com/in/preyam" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <a href="https://codeforces.com/profile/preyam" target="_blank" rel="noopener noreferrer">Codeforces</a>
            <a href="https://www.chess.com/member/preyam2002" target="_blank" rel="noopener noreferrer">Chess</a>
          </div>
        </div>
      </section>

      <footer className="obs-footer obs-shell">
        <span>Preyam Rao · Bengaluru</span>
        <span>Built as a live instrument, not a template.</span>
        <a href="#top">Back to signal ↑</a>
      </footer>
    </main>
  );
}
