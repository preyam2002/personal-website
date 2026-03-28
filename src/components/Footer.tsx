"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function Footer() {
  return (
    <footer id="contact" className="pb-8">
      <div className="container">
        <div className="glass-panel rounded-3xl p-8 sm:p-12">
          <p className="section-label mb-6">{"//"} Let&apos;s Build</p>
          <div className="flex flex-wrap gap-4 mb-8">
            <Link
              href="/resume"
              className="inline-flex items-center gap-2 text-[13px] font-mono text-white bg-[var(--ink)] px-4 py-2 hover:bg-[var(--accent)] transition-colors duration-300"
            >
              View Resume
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <a
              href="mailto:preyam2002@gmail.com?subject=Resume%20Request"
              className="inline-flex items-center gap-2 text-[13px] font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-300"
            >
              Request PDF Resume
            </a>
          </div>

          <motion.a
            href="mailto:preyam2002@gmail.com"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="group inline-flex items-center gap-3 text-[var(--ink)] hover:text-[var(--accent)] transition-colors duration-300"
          >
            <span className="text-xl sm:text-2xl font-serif">preyam2002@gmail.com</span>
            <span className="transition-transform duration-300 group-hover:translate-x-1">&rarr;</span>
          </motion.a>

          <div className="flex flex-wrap gap-6 mt-6">
            {[
              { label: "GitHub", url: "https://github.com/preyam2002" },
              { label: "LinkedIn", url: "https://linkedin.com/in/preyam" },
              { label: "Chess", url: "https://www.chess.com/" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-300"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="container pt-5">
        <p className="text-[11px] font-mono text-[var(--muted)]">
          {new Date().getFullYear()} Preyam Rao
        </p>
      </div>
    </footer>
  );
}
