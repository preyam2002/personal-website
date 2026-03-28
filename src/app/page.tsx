import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

const links = [
  { label: "GitHub", url: "https://github.com/preyam2002" },
  { label: "LinkedIn", url: "https://linkedin.com/in/preyam" },
  { label: "Email", url: "mailto:preyam2002@gmail.com" },
];

const proof = [
  "Ex-Oracle",
  "IIT Kharagpur CS '23",
  "Patent filed",
  "$140K grant recipient",
];

const tools = [
  "TypeScript",
  "Go",
  "Java",
  "PostgreSQL",
  "Redis",
  "Kafka",
  "Kubernetes",
  "Terraform",
  "Next.js",
];

const experience = [
  {
    period: "2024 - Present",
    role: "Backend Engineer",
    company: "Lumora Social",
    points: [
      "Built event-driven social graph and feed infrastructure.",
      "Improved latency by tightening query strategy and indexing.",
      "Wrote on-call playbooks and release safety checks.",
    ],
  },
  {
    period: "2023 - 2024",
    role: "Software Engineer",
    company: "Oracle",
    points: [
      "Worked on Exadata integrations for enterprise workloads.",
      "Improved deployment reliability with validation gates.",
      "Reduced operational incidents through better internal tooling.",
    ],
  },
];

const projects = [
  {
    title: "Distributed Vault Replication",
    challenge: "Securely sync secrets across isolated environments.",
    stack: "Go · Kafka · PostgreSQL · Kubernetes",
    outcomes: [
      "99.95% reliability in staging load tests",
      "Sub-2s p95 secret synchronization",
      "60% faster recovery via failover runbooks",
    ],
    url: "https://github.com/preyam2002",
  },
  {
    title: "Real-time Social Platform",
    challenge: "Keep feed interactions fast under high event volume.",
    stack: "TypeScript · Node.js · Redis · WebSockets",
    outcomes: [
      "10K+ concurrent websocket benchmark",
      "Feed API p95 cut from 420ms to 180ms",
      "28% infra cost reduction from cache redesign",
    ],
    url: "https://github.com/preyam2002",
  },
  {
    title: "Exadata Integration Framework",
    challenge: "Make onboarding + releases safer and faster.",
    stack: "Java · Spring Boot · Oracle DB · Terraform",
    outcomes: [
      "Onboarding reduced from 2 weeks to 3 days",
      "Guardrails for repeated config incidents",
      "Higher release confidence via automation",
    ],
    url: "https://github.com/preyam2002",
  },
];

const personalLinks = [
  { label: "Chess.com", url: "https://www.chess.com/member/preyam2002", note: "verify handle" },
  { label: "Lichess", url: "https://lichess.org/@/preyam2002", note: "verify handle" },
  { label: "Letterboxd", url: "https://letterboxd.com/preyam2002/", note: "verify handle" },
  { label: "Goodreads", url: "https://www.goodreads.com/user/show/preyam2002", note: "verify handle" },
  { label: "Codeforces", url: "https://codeforces.com/profile/preyam2002", note: "verify handle" },
  { label: "LeetCode", url: "https://leetcode.com/u/preyam2002/", note: "verify handle" },
];

const recentNotes = [
  {
    title: "Designing APIs for latency budgets",
    excerpt: "A short write-up on practical choices that keep p95 healthy without overengineering.",
    meta: "Draft · 4 min read",
    tags: ["backend", "performance", "api"],
    href: "/",
  },
  {
    title: "What reliability reviews should actually include",
    excerpt: "A checklist from incident postmortems that helps teams prevent the same class of outages.",
    meta: "Draft · 3 min read",
    tags: ["reliability", "ops"],
    href: "/",
  },
  {
    title: "How I structure backend project readmes",
    excerpt: "A template for making architecture and operational context obvious to future contributors.",
    meta: "Draft · 2 min read",
    tags: ["documentation", "engineering"],
    href: "/",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen pb-8">
      <Navigation />

      <section id="top" className="container pt-30 sm:pt-34 pb-20 sm:pb-24">
        <div className="glass-panel rounded-[2rem] p-7 sm:p-11 relative overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-[32%] dot-grid opacity-45" />
          <p className="section-label relative mb-6">$ whoami</p>
            <h1 className="relative text-[clamp(2.6rem,9vw,8rem)] font-serif leading-[0.86] tracking-tight text-[var(--ink)] max-w-5xl">
              Preyam Rao
              <span className="block text-[var(--muted)]">
                Software Engineer
              </span>
            </h1>
          <p className="relative mt-7 max-w-3xl text-base sm:text-lg text-[var(--muted)]">
            I build backend systems that stay clear for teams and resilient in production.
          </p>
          <p className="relative mt-3 text-sm text-[var(--muted)]">
            Open to full-time roles, selective freelance, and high-context product collaborations.
          </p>

          <div className="relative mt-8 flex flex-wrap gap-2">
            {proof.map((item) => (
              <span
                key={item}
                className="text-[11px] font-mono px-2.5 py-1 border border-[var(--line)] bg-[var(--accent-soft)] text-[var(--accent)]"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="relative mt-9 flex flex-wrap gap-4">
            <Link
              href="/resume"
              className="inline-flex items-center gap-2 text-[13px] font-mono px-5 py-2.5 bg-[var(--ink)] text-white hover:bg-[var(--accent)] transition-colors duration-300"
            >
              View Resume <span aria-hidden="true">&rarr;</span>
            </Link>
            <a
              href="mailto:preyam2002@gmail.com?subject=Let's%20build%20something"
              className="inline-flex items-center gap-2 text-[13px] font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-300"
            >
              Let&apos;s build together
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-5 sm:gap-8">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target={link.url.startsWith("http") ? "_blank" : undefined}
              rel={link.url.startsWith("http") ? "noopener noreferrer" : undefined}
              className="text-[12px] font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </div>
      </section>

      <section className="container pb-20 sm:pb-24">
        <p className="section-label mb-7">{"//"} Tools I Use</p>
        <div className="soft-card rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap gap-2.5">
            {tools.map((tool) => (
              <span
                key={tool}
                className="text-[12px] font-mono text-[var(--muted)] border border-[var(--line)] px-3 py-1.5 rounded-full hover:border-[var(--accent)] hover:text-[var(--ink)] transition-colors duration-300"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="experience" className="container pb-20 sm:pb-24">
        <p className="section-label mb-7">{"//"} Experience</p>
        <div className="grid gap-4">
          {experience.map((item) => (
            <article key={item.company} className="soft-card rounded-3xl p-6 sm:p-8">
              <div className="grid lg:grid-cols-[180px_1fr] gap-6">
                <div>
                  <p className="text-[11px] font-mono text-[var(--accent)] uppercase tracking-[0.2em]">{item.period}</p>
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-serif text-[var(--ink)] leading-tight">
                    {item.role} <span className="text-[var(--muted)]">@ {item.company}</span>
                  </h2>
                  <ul className="mt-4 space-y-2.5">
                    {item.points.map((point) => (
                      <li key={point} className="text-sm text-[var(--muted)] leading-relaxed">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="work" className="container pb-20 sm:pb-24">
        <div className="flex justify-between items-end mb-7">
          <p className="section-label">{"//"} Selected Work</p>
          <p className="hidden sm:block text-[11px] font-mono text-[var(--muted)]">Challenge · Stack · Outcomes</p>
        </div>
        <div className="grid gap-4">
          {projects.map((project, index) => (
            <article key={project.title} className="soft-card rounded-[2rem] p-6 sm:p-8">
              <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8">
                <div>
                  <p className="text-5xl sm:text-6xl font-serif text-[#d2d8cb] leading-none mb-4">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="text-3xl sm:text-4xl font-serif text-[var(--ink)] leading-tight">{project.title}</h3>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--accent)]">Challenge </span>
                    {project.challenge}
                  </p>
                  <p className="mt-3 text-[12px] font-mono text-[var(--muted)]">{project.stack}</p>
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex mt-6 items-center gap-2 text-[13px] font-mono text-[var(--ink)] hover:text-[var(--accent)] transition-colors duration-300"
                  >
                    Open project <span aria-hidden="true">&rarr;</span>
                  </a>
                </div>
                <ul className="space-y-3">
                  {project.outcomes.map((outcome) => (
                    <li key={outcome} className="text-sm text-[var(--muted)] leading-relaxed border-b border-[var(--line)] pb-3">
                      {outcome}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="notes" className="container pb-20 sm:pb-24">
        <div className="flex justify-between items-end mb-7">
          <p className="section-label">{"//"} Most Recent Notes</p>
          <p className="hidden sm:block text-[11px] font-mono text-[var(--muted)]">Writing in progress</p>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          {recentNotes.map((note) => (
            <article key={note.title} className="soft-card rounded-3xl p-5 sm:p-6">
              <p className="text-[11px] font-mono text-[var(--accent)]">{note.meta}</p>
              <h3 className="mt-3 text-2xl font-serif leading-tight text-[var(--ink)]">{note.title}</h3>
              <p className="mt-3 text-sm text-[var(--muted)]">{note.excerpt}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {note.tags.map((tag) => (
                  <span key={tag} className="text-[10px] font-mono border border-[var(--line)] px-2 py-1 text-[var(--muted)]">
                    #{tag}
                  </span>
                ))}
              </div>
              <Link
                href={note.href}
                className="inline-flex mt-5 items-center gap-2 text-[12px] font-mono text-[var(--ink)] hover:text-[var(--accent)] transition-colors duration-300"
              >
                Read note <span aria-hidden="true">&rarr;</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section id="personal" className="container pb-20 sm:pb-24">
        <p className="section-label mb-7">{"//"} Personal Internet</p>
        <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-5">
          <article className="soft-card rounded-3xl p-6">
            <h3 className="text-2xl font-serif text-[var(--ink)] mb-4">Profiles</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {personalLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-[var(--line)] px-3 py-2.5 text-[12px] font-mono text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--accent)] transition-colors duration-300"
                >
                  {item.label} &rarr; <span className="text-[10px]">({item.note})</span>
                </a>
              ))}
            </div>
          </article>

          <div className="grid gap-3">
            {[
              {
                title: "Photo Diary",
                body: "Add images in /public/photos and this block becomes a visual journal.",
              },
              {
                title: "Now",
                body: "Currently interested in distributed systems, AI-assisted products, and developer UX.",
              },
              {
                title: "Outside work",
                body: "Chess, books, films, and walks that reset my brain between shipping cycles.",
              },
            ].map((card) => (
              <article key={card.title} className="soft-card rounded-3xl p-5">
                <p className="section-label mb-3">{card.title}</p>
                <p className="text-sm text-[var(--muted)]">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
