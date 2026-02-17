"use client";

import { motion } from "framer-motion";

export default function Contact() {
  return (
    <section id="contact" className="py-32 md:py-48 border-t border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-12 gap-12">
          <div className="md:col-span-3">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest sticky top-32">05 — Contact</span>
          </div>
          <div className="md:col-span-9 lg:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <h3 className="text-4xl md:text-6xl font-serif font-light leading-tight mb-8 text-zinc-900 dark:text-zinc-50">
                Let&apos;s build something <span className="text-zinc-400 dark:text-zinc-600 italic">great together</span>.
              </h3>
              <p className="text-xl text-zinc-600 dark:text-zinc-400 font-light mb-12 max-w-xl leading-relaxed">
                I&apos;m always interested in discussing new opportunities, 
                challenging technical problems, or potential collaborations.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <a 
                  href="mailto:preyamsingh@gmail.com" 
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 font-medium rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95"
                >
                  Send Email
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </a>
                <a 
                  href="https://linkedin.com/in/preyamrao" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all hover:scale-105 active:scale-95"
                >
                  LinkedIn
                </a>
                <a 
                  href="https://github.com/preyam" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all hover:scale-105 active:scale-95"
                >
                  GitHub
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
