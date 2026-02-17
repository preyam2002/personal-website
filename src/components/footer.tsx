"use client";

import { motion } from "framer-motion";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 border-t border-zinc-100 dark:border-zinc-900 bg-white dark:bg-black">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-sm font-mono text-zinc-400">
            &copy; {currentYear} Preyam Rao — Backend Engineer
          </p>
          
          <div className="flex gap-8">
            <a 
              href="mailto:preyamsingh@gmail.com" 
              className="text-xs font-mono text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors uppercase tracking-widest"
            >
              Email
            </a>
            <a 
              href="https://linkedin.com/in/preyamrao" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs font-mono text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors uppercase tracking-widest"
            >
              LinkedIn
            </a>
            <a 
              href="https://github.com/preyam" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs font-mono text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors uppercase tracking-widest"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
