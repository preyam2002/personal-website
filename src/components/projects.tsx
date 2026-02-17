"use client";

import { motion } from "framer-motion";

const projects = [
  {
    title: "Distributed Vault Replication",
    desc: "Enterprise disaster recovery service with automated failover and sub-minute RTO. Patent-pending consensus algorithm for multi-region replication.",
    tech: ["Java", "Kubernetes", "PostgreSQL", "gRPC"],
    metrics: "99.99% uptime | 50ms latency",
    link: "https://github.com/preyam"
  },
  {
    title: "Real-time Social Platform",
    desc: "Web3 social infrastructure supporting 10K+ concurrent connections. Implemented WebSocket clustering and blockchain event indexing.",
    tech: ["TypeScript", "Node.js", "Redis", "Sui Blockchain"],
    metrics: "10K+ concurrent users | $140K grant",
    link: "https://github.com/preyam"
  },
  {
    title: "Exadata Integration Framework",
    desc: "High-performance database integration layer for Oracle Exadata. Optimized query routing and connection pooling for enterprise workloads.",
    tech: ["Java", "SQL", "Microservices", "OCI"],
    metrics: "40% latency reduction | Production scale",
    link: "https://github.com/preyam"
  }
];

export default function Projects() {
  return (
    <section id="projects" className="py-24 md:py-32 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-12 gap-12">
          <div className="md:col-span-3">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest sticky top-32">03 — Projects</span>
          </div>
          <div className="md:col-span-9 lg:col-span-8">
            <div className="space-y-12">
              {projects.map((project, i) => (
                <motion.a
                  key={i}
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block relative p-8 bg-white dark:bg-black rounded-2xl border border-zinc-100 dark:border-zinc-800 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="flex flex-col gap-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-2xl md:text-3xl font-light text-zinc-900 dark:text-zinc-50 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors mb-2">
                          {project.title}
                        </h3>
                        <p className="text-sm font-mono text-zinc-400">{project.metrics}</p>
                      </div>
                      <span className="p-2 rounded-full bg-zinc-50 dark:bg-zinc-900 group-hover:bg-zinc-100 dark:group-hover:bg-zinc-800 transition-colors">
                        <svg className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </span>
                    </div>
                    
                    <p className="text-lg text-zinc-500 font-light leading-relaxed max-w-2xl">
                      {project.desc}
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mt-auto">
                      {project.tech.map((t) => (
                        <span 
                          key={t} 
                          className="px-3 py-1 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono text-zinc-500 border border-zinc-100 dark:border-zinc-800 rounded-full"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
