"use client";

import { ScrollReveal } from "./scroll-reveal";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

export function Hero() {
  return (
    <section className="min-h-screen flex flex-col justify-center relative overflow-hidden" id="home">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-10 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/3 right-10 w-96 h-96 bg-pink-500/8 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
      </div>

      <div className="relative z-10">
        <ScrollReveal>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <span className="inline-flex items-center gap-3">
              <span className="w-8 h-[1px] bg-gradient-to-r from-purple-500 to-pink-500" />
              <span className="font-[family-name:var(--font-mono)] text-xs text-neutral-500 tracking-[0.2em] uppercase">
                Software Engineer
              </span>
            </span>
          </motion.div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-light tracking-tight leading-[0.9] mb-8">
            <span className="block text-white">preyam</span>
            <span className="block">
              <span className="text-gradient font-medium">rao</span>
            </span>
          </h1>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="max-w-lg space-y-6">
            <p className="text-lg text-neutral-400 leading-relaxed font-light">
              Ex-Oracle. Patent filed. $140K grant recipient. Codeforces Candidate Master (1950). Building at the intersection of distributed systems and product.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={300}>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <a
              href="#work"
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-[family-name:var(--font-mono)] text-sm tracking-wide overflow-hidden transition-all hover:pr-10"
            >
              <span className="relative z-10">View Work</span>
              <svg 
                className="w-4 h-4 relative z-10 transition-transform group-hover:translate-x-1" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="absolute inset-0 bg-white group-hover:opacity-0 transition-opacity" />
            </a>
            <a
              href="#contact"
              className="group inline-flex items-center gap-2 px-8 py-4 text-neutral-500 hover:text-white transition-colors font-[family-name:var(--font-mono)] text-sm tracking-wide"
            >
              <span className="relative">
                Contact
                <span className="absolute bottom-0 left-0 w-0 h-px bg-gradient-to-r from-purple-500 to-pink-500 group-hover:w-full transition-all duration-300" />
              </span>
            </a>
          </div>
        </ScrollReveal>
      </div>

      {/* Scroll indicator */}
      <motion.div 
        className="absolute bottom-12 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2 text-neutral-600"
        >
          <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">Scroll</span>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.div>
    </section>
  );
}
