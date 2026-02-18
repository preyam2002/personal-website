"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const socials = [
  { label: "GitHub", url: "https://github.com/preyam2002" },
  { label: "LinkedIn", url: "https://linkedin.com/in/preyam" },
  { label: "Email", url: "mailto:preyam2002@gmail.com" },
];

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
  }, [menuOpen]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 py-5 sm:py-6">
        <div className="container flex items-center justify-between">
          <a
            href="#"
            className="text-[13px] font-mono tracking-wider text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
          >
            Preyam Rao
          </a>

          <button
            className="relative z-50 w-10 h-10 flex items-center justify-center"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-6 flex flex-col items-end gap-[5px]">
              <span
                className={`block h-px bg-neutral-900 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] origin-center ${
                  menuOpen ? "w-6 rotate-45 translate-y-[3px]" : "w-6"
                }`}
              />
              <span
                className={`block h-px bg-neutral-900 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] origin-center ${
                  menuOpen ? "w-6 -rotate-45 -translate-y-[3px]" : "w-3"
                }`}
              />
            </div>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-40 bg-white flex flex-col justify-center"
          >
            <div className="container">
              <nav className="flex flex-col gap-2">
                {[
                  { href: "#work", label: "Work" },
                  { href: "#contact", label: "Contact" },
                ].map((item, i) => (
                  <motion.a
                    key={item.href}
                    href={item.href}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{
                      delay: 0.1 + i * 0.08,
                      duration: 0.6,
                      ease: [0.76, 0, 0.24, 1],
                    }}
                    onClick={() => setMenuOpen(false)}
                    className="text-[clamp(2.5rem,8vw,6rem)] font-serif leading-[1.1] text-neutral-900 hover:text-neutral-400 transition-colors duration-300 py-2"
                  >
                    {item.label}
                  </motion.a>
                ))}
              </nav>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="mt-16 flex gap-8"
              >
                {socials.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target={link.url.startsWith("mailto") ? undefined : "_blank"}
                    rel={link.url.startsWith("mailto") ? undefined : "noopener noreferrer"}
                    className="text-[13px] font-mono text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
                  >
                    {link.label}
                  </a>
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
