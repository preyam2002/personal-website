"use client";

import { motion } from "framer-motion";

const work = [
  { title: "Distributed Vault Replication", url: "https://github.com/preyam2002" },
  { title: "Real-time Social Platform", url: "https://github.com/preyam2002" },
  { title: "Exadata Integration Framework", url: "https://github.com/preyam2002" },
];

const experience = [
  { name: "Lumora Social", role: "Backend Engineer" },
  { name: "Oracle", role: "Software Engineer" },
  { name: "IIT Kharagpur", role: "B.Tech CS" },
];

export default function Projects() {
  return (
    <section id="work" className="pb-20 sm:pb-32">
      <div className="container">
        <div className="border-t border-neutral-100 pt-16 sm:pt-20">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-[11px] font-mono text-neutral-300 uppercase tracking-[0.2em] mb-10 sm:mb-14"
          >
            {"//"}Selected Work
          </motion.p>

          <div className="space-y-0">
            {work.map((item, i) => (
              <motion.a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                className="group flex items-center justify-between py-5 sm:py-6 border-b border-neutral-100 first:border-t"
              >
                <span className="text-xl sm:text-2xl md:text-3xl font-serif text-neutral-900 group-hover:text-neutral-400 transition-colors duration-300">
                  {item.title}
                </span>
                <span className="text-neutral-300 group-hover:text-neutral-900 transition-all duration-300 group-hover:translate-x-1 ml-4 shrink-0">
                  &rarr;
                </span>
              </motion.a>
            ))}
          </div>
        </div>

        <div className="pt-16 sm:pt-24">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-[11px] font-mono text-neutral-300 uppercase tracking-[0.2em] mb-10 sm:mb-14"
          >
            {"//"}Experience
          </motion.p>

          <div className="flex flex-col sm:flex-row sm:gap-16 gap-6">
            {experience.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
              >
                <p className="text-lg sm:text-xl font-serif text-neutral-900">
                  {item.name}
                </p>
                <p className="text-[13px] font-mono text-neutral-300 mt-1">
                  {item.role}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
