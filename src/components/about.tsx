"use client";

import { motion } from "framer-motion";

export default function About() {
  const skills = [
    "Java", "TypeScript", "Node.js", "Python", 
    "Kubernetes", "PostgreSQL", "Redis", "AWS", 
    "Docker", "Microservices", "System Design"
  ];

  return (
    <section id="about" className="py-24 md:py-32 border-t border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-12 gap-12">
          <div className="md:col-span-3">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest sticky top-32">01 — About</span>
          </div>
          <div className="md:col-span-9 lg:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <h3 className="text-3xl md:text-5xl font-light leading-tight mb-12 text-zinc-900 dark:text-zinc-50">
                I build <span className="text-zinc-400 dark:text-zinc-600">reliable, high-performance</span> systems that power products at scale.
              </h3>
              
              <div className="grid md:grid-cols-2 gap-12 text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed font-light">
                <div className="space-y-6">
                  <p>
                    Currently building backend infrastructure at <span className="text-zinc-900 dark:text-zinc-100 font-medium">Lumora Social</span>. 
                    Previously at <span className="text-zinc-900 dark:text-zinc-100 font-medium">Oracle</span>, 
                    where I developed disaster recovery services and database integration solutions serving enterprise clients.
                  </p>
                  <p>
                    I hold a B.Tech in Computer Science from <span className="text-zinc-900 dark:text-zinc-100 font-medium">IIT Kharagpur</span> (2023) 
                    and have a pending patent for a distributed systems innovation. I am also a Codeforces Candidate Master, 
                    ranking in the top 1% globally.
                  </p>
                </div>
                <div className="space-y-6">
                  <p>
                    My work spans Java, TypeScript, Kubernetes, and cloud-native architectures. 
                    I have secured over <span className="text-zinc-900 dark:text-zinc-100 font-medium">$140K in grants</span> and led teams to finalist positions in 
                    national hackathons.
                  </p>
                  
                  <div>
                    <h4 className="text-sm font-mono text-zinc-400 uppercase mb-4 mt-2">Technologies</h4>
                    <div className="flex flex-wrap gap-2">
                      {skills.map((skill) => (
                        <span 
                          key={skill} 
                          className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 text-xs font-mono text-zinc-600 dark:text-zinc-400 rounded-md border border-zinc-200 dark:border-zinc-800"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
