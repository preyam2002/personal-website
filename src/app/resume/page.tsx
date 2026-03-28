import Link from "next/link";

const resumeSections = [
  {
    title: "Summary",
    content: [
      "Software Engineer with experience building distributed systems, backend platforms, and operational tooling for production-scale software.",
    ],
  },
  {
    title: "Experience",
    content: [
      "Backend Engineer, Lumora Social (2024 - Present): Built real-time backend services and improved API performance for social platform workloads.",
      "Software Engineer, Oracle (2023 - 2024): Developed Exadata integration workflows with a focus on release reliability and developer productivity.",
    ],
  },
  {
    title: "Education",
    content: ["B.Tech in Computer Science, IIT Kharagpur (2019 - 2023)"],
  },
  {
    title: "Highlights",
    content: [
      "Patent filed",
      "$140K grant recipient",
      "Background in distributed systems and scalable service design",
    ],
  },
];

export default function ResumePage() {
  return (
    <main className="bg-white min-h-screen">
      <div className="container py-20 sm:py-24">
        <Link
          href="/"
          className="text-[13px] font-mono text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
        >
          &larr; Back
        </Link>

        <header className="pt-10 pb-12 border-b border-neutral-100">
          <h1 className="text-[clamp(2.25rem,8vw,5.5rem)] font-serif leading-[0.95] tracking-tight text-neutral-900">
            Preyam Rao
          </h1>
          <p className="text-neutral-500 mt-4 max-w-2xl">
            Software Engineer focused on backend systems, distributed architecture, and reliability.
          </p>
          <div className="flex flex-wrap gap-6 mt-6">
            <a
              href="mailto:preyam2002@gmail.com"
              className="text-[13px] font-mono text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
            >
              preyam2002@gmail.com
            </a>
            <a
              href="https://github.com/preyam2002"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-mono text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
            >
              GitHub
            </a>
            <a
              href="https://linkedin.com/in/preyam"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-mono text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
            >
              LinkedIn
            </a>
          </div>
        </header>

        <section className="pt-12 space-y-12">
          {resumeSections.map((section) => (
            <article key={section.title}>
              <h2 className="text-[11px] font-mono text-neutral-300 uppercase tracking-[0.2em] mb-6">
                {"//"} {section.title}
              </h2>
              <ul className="space-y-3">
                {section.content.map((line) => (
                  <li key={line} className="text-neutral-700 leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
