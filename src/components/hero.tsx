"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function Hero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <section className="min-h-[90vh] flex flex-col justify-center relative pt-32 pb-20 container mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Content */}
        <div className="lg:col-span-8 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-serif font-light tracking-tighter leading-[0.9] text-zinc-900 dark:text-zinc-50">
              Preyam
              <br />
              <span className="text-zinc-400 dark:text-zinc-600">Rao</span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl"
          >
            <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 font-light leading-relaxed">
              Backend Engineer specialized in building{" "}
              <span className="text-zinc-900 dark:text-zinc-200 font-normal">
                scalable distributed systems
              </span>{" "}
              and high-performance cloud infrastructure.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap gap-4 pt-4"
          >
            <a
              href="#projects"
              className="px-8 py-3 bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 rounded-full font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              View Work
            </a>
            <a
              href="mailto:preyamsingh@gmail.com"
              className="px-8 py-3 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              Contact Me
            </a>
          </motion.div>
        </div>

        {/* Right Content / Decorative */}
        <div className="lg:col-span-4 flex flex-col justify-end items-start lg:items-end space-y-8 lg:space-y-12">
           <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="text-right hidden lg:block"
          >
            <p className="text-sm font-mono text-zinc-500 mb-2">CURRENTLY AT</p>
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Lumora Social</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="text-right hidden lg:block"
          >
             <p className="text-sm font-mono text-zinc-500 mb-2">PREVIOUSLY</p>
             <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Oracle</p>
          </motion.div>
          
           <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="flex flex-col lg:items-end gap-3"
          >
            <p className="text-sm font-mono text-zinc-500 mb-1">CONNECT</p>
            {[
              { name: "GitHub", url: "https://github.com/preyam" },
              { name: "LinkedIn", url: "https://linkedin.com/in/preyamrao" },
              { name: "Email", url: "mailto:preyamsingh@gmail.com" }
            ].map((social) => (
              <a
                key={social.name}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-2 group"
              >
                {social.name}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1">→</span>
              </a>
            ))}
          </motion.div>
        </div>
      </div>
      
      {/* Scroll Indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2"
      >
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Scroll</span>
        <div className="w-px h-12 bg-linear-to-b from-zinc-400 to-transparent opacity-50" />
      </motion.div>
    </section>
  );
}
