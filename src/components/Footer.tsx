"use client";

import { motion } from "framer-motion";

export default function Footer() {
  return (
    <footer id="contact" className="border-t border-neutral-100">
      <div className="container py-16 sm:py-20">
        <motion.a
          href="mailto:preyam2002@gmail.com"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="group inline-flex items-center gap-3 text-neutral-900 hover:text-neutral-400 transition-colors duration-300"
        >
          <span className="text-lg sm:text-xl font-light">
            preyam2002@gmail.com
          </span>
          <span className="transition-transform duration-300 group-hover:translate-x-1">
            &rarr;
          </span>
        </motion.a>

        <div className="flex gap-6 mt-6">
          {[
            { label: "GitHub", url: "https://github.com/preyam2002" },
            { label: "LinkedIn", url: "https://linkedin.com/in/preyam" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-mono text-neutral-300 hover:text-neutral-900 transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <div className="container pb-6">
        <p className="text-[11px] font-mono text-neutral-300">
          {new Date().getFullYear()} Preyam Rao
        </p>
      </div>
    </footer>
  );
}
