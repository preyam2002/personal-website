"use client";

import { motion } from "framer-motion";

const achievements = [
  { label: "Competitive Programming", val: "Codeforces Candidate Master", sub: "1950 rating | Top 1% globally" },
  { label: "Innovation", val: "Patent Filed", sub: "Distributed systems consensus algorithm" },
  { label: "Education", val: "IIT Kharagpur", sub: "B.Tech Computer Science | 2023" },
  { label: "Competition", val: "Smart India Hackathon", sub: "National Finalist | Top 5 team" }
];

export default function Achievements() {
  return (
    <section className="py-24 md:py-32 border-t border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-12 gap-12">
          <div className="md:col-span-3">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest sticky top-32">04 — Achievements</span>
          </div>
          <div className="md:col-span-9 lg:col-span-8">
            <div className="grid md:grid-cols-2 gap-8">
              {achievements.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: i * 0.1 }}
                  className="p-8 border border-zinc-100 dark:border-zinc-800 rounded-2xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors bg-zinc-50/50 dark:bg-zinc-900/50"
                >
                  <h5 className="text-xs font-mono text-zinc-400 mb-4 uppercase tracking-widest">{item.label}</h5>
                  <p className="text-xl md:text-2xl font-light text-zinc-900 dark:text-zinc-50 mb-2 leading-tight">
                    {item.val}
                  </p>
                  <p className="text-sm text-zinc-500 font-normal">{item.sub}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
