"use client";

import { motion } from "framer-motion";

const jobs = [
  {
    role: "Backend Engineer",
    company: "Lumora Social",
    period: "2024 — Present",
    desc: "Building Web3 social platform infrastructure. Architecting real-time systems handling 10K+ concurrent users.",
    highlights: ["$140K Grant Recipient", "WebSockets", "Blockchain Integration"]
  },
  {
    role: "Software Engineer",
    company: "Oracle",
    period: "2023 — 2024",
    desc: "Developed disaster recovery and database integration services for Oracle Cloud Infrastructure.",
    highlights: ["Patent Filed", "Java / Kubernetes", "OCI Services"]
  }
];

export default function Experience() {
  return (
    <section id="experience" className="py-24 md:py-32 border-t border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-12 gap-12">
          <div className="md:col-span-3">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest sticky top-32">02 — Experience</span>
          </div>
          <div className="md:col-span-9 lg:col-span-8">
            <div className="space-y-16">
              {jobs.map((job, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="group"
                >
                  <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4 mb-4">
                    <div>
                      <h4 className="text-2xl font-light text-zinc-900 dark:text-zinc-50">{job.role}</h4>
                      <p className="text-zinc-500 font-normal">{job.company}</p>
                    </div>
                    <span className="text-sm font-mono text-zinc-400">{job.period}</span>
                  </div>
                  <p className="text-lg text-zinc-600 dark:text-zinc-400 font-light mb-6 max-w-2xl leading-relaxed">
                    {job.desc}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.highlights.map((highlight) => (
                      <span 
                        key={highlight} 
                        className="px-2 py-1 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono text-zinc-500 border border-zinc-100 dark:border-zinc-800 rounded-sm"
                      >
                        {highlight}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
