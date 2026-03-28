import Link from "next/link";

const resumeSections = [
  {
    title: "Summary",
    content: [
      "Full-stack engineer building prediction markets, AI-powered tools, and low-latency systems. TypeScript, C++, Python, Sui Move. From decentralized finance to real-time audio processing.",
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
    title: "Selected Projects",
    content: [
      "Aletheia — Decentralized prediction market on Sui blockchain with LMSR AMM and AI oracle resolution",
      "HFT System — Ultra-low latency C++17 trading engine with sub-microsecond SPSC queues and SIMD orderbook",
      "Kindred — Social taste-matching platform with 97 API endpoints and 16 viral features",
      "VibeShield — Black-box security scanner with 54 attack modules and CI/CD integration",
      "PianoScore — Real-time piano practice app with MIDI input and AI sight-reading",
    ],
  },
  {
    title: "Highlights",
    content: [
      "Patent filed",
      "$140K grant recipient",
      "IIT Kharagpur CS graduate",
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
            Full-stack engineer. Prediction markets, AI tools, low-latency systems, and blockchain.
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
