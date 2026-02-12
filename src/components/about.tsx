"use client";

import { ScrollReveal } from "./scroll-reveal";

const stats = [
  { value: "100K+", label: "Integrations" },
  { value: "32K+", label: "Users" },
  { value: "97%", label: "Latency Cut" },
];

export function About() {
  return (
    <section className="py-32 relative" id="about">
      <ScrollReveal>
        <div className="flex items-center gap-6 mb-16">
          <span className="font-[family-name:var(--font-mono)] text-xs text-purple-500 tracking-wider">
            01
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-neutral-800 to-transparent" />
          <span className="font-[family-name:var(--font-mono)] text-xs text-neutral-500 tracking-widest uppercase">
            About
          </span>
        </div>
      </ScrollReveal>

      <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
        <div className="space-y-8">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light leading-tight text-white">
              I build from{" "}
              <span className="text-gradient font-normal">zero</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <p className="text-neutral-400 leading-relaxed">
              Ex-Oracle. IIT Kharagpur &apos;23. Candidate Master on Codeforces.
            </p>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={200}>
          <div className="lg:sticky lg:top-32 space-y-8">
            <div className="glass-card p-8 space-y-8">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-baseline justify-between border-b border-neutral-800 pb-6 last:border-0 last:pb-0"
                >
                  <span className="text-4xl sm:text-5xl font-light text-white">
                    {stat.value}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-xs text-neutral-500 tracking-wider uppercase text-right">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                "Java",
                "TypeScript",
                "Node.js",
                "Kubernetes",
                "PostgreSQL",
                "Redis",
                "AWS",
                "Docker",
              ].map((skill) => (
                <span key={skill} className="tag">
                  {skill}
                </span>
              ))}
            </div>

            <div className="pt-8 border-t border-neutral-800">
              <h3 className="font-[family-name:var(--font-mono)] text-xs text-neutral-500 tracking-wider uppercase mb-4">
                Achievements
              </h3>
              <div className="space-y-3">
                {[
                  { title: "$140K Sui Foundation Grant", year: "2025" },
                  { title: "Patent Filed - Vault Replication", year: "2024" },
                  { title: "Smart India Hackathon - Top 5", year: "2022" },
                  { title: "Codeforces Candidate Master (1950)", year: "2022" },
                ].map((achievement) => (
                  <div
                    key={achievement.title}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-neutral-400">{achievement.title}</span>
                    <span className="font-[family-name:var(--font-mono)] text-xs text-neutral-600">{achievement.year}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
