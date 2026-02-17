"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface LinkItem {
  title: string;
  url: string;
  desc: string;
}

interface LinkCategory {
  name: string;
  links: LinkItem[];
}

const linkCategories: LinkCategory[] = [
  {
    name: "Development",
    links: [
      { title: "HackerNews", url: "https://news.ycombinator.com", desc: "Tech news" },
      { title: "GitHub Trending", url: "https://github.com/trending", desc: "Trending repos" },
      { title: "DevDocs", url: "https://devdocs.io", desc: "API docs" },
      { title: "MDN", url: "https://developer.mozilla.org", desc: "Web docs" },
    ],
  },
  {
    name: "Design",
    links: [
      { title: "Awwwards", url: "https://www.awwwards.com", desc: "Design awards" },
      { title: "Dribbble", url: "https://dribbble.com", desc: "Inspiration" },
      { title: "Muzli", url: "https://muz.li", desc: "Design feed" },
      { title: "Minimal Gallery", url: "https://minimal.gallery", desc: "Minimalist sites" },
    ],
  },
  {
    name: "Tools",
    links: [
      { title: "Excalidraw", url: "https://excalidraw.com", desc: "Whiteboard" },
      { title: "Regex101", url: "https://regex101.com", desc: "Regex tester" },
      { title: "Coolors", url: "https://coolors.co", desc: "Color palettes" },
      { title: "Carbon", url: "https://carbon.now.sh", desc: "Code screenshots" },
    ],
  },
  {
    name: "Reading",
    links: [
      { title: "Paul Graham", url: "http://paulgraham.com/articles.html", desc: "Essays" },
      { title: "Martin Fowler", url: "https://martinfowler.com", desc: "Software patterns" },
      { title: "Stratechery", url: "https://stratechery.com", desc: "Tech analysis" },
    ],
  },
];

export default function LinksPage() {
  return (
    <div className="bg-white dark:bg-black text-zinc-900 dark:text-zinc-50 min-h-screen selection:bg-zinc-100 dark:selection:bg-zinc-800">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 transition-colors">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link 
            href="/"
            className="group flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-32 md:pt-48 pb-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-24"
          >
            <span className="text-xs font-mono text-zinc-400 block mb-6 uppercase tracking-widest">Links</span>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-light tracking-tight leading-[0.9] mb-8 text-zinc-900 dark:text-zinc-50">
              Curated<br/><span className="text-zinc-400 dark:text-zinc-600">Resources</span>
            </h1>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 font-light max-w-xl leading-relaxed">
              A collection of tools, readings, and inspiration that I frequently revisit.
            </p>
          </motion.div>

          <div className="space-y-24">
            {linkCategories.map((category, i) => (
              <motion.section 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1 }}
              >
                <h2 className="text-sm font-mono text-zinc-400 uppercase mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                  {category.name}
                </h2>
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
                  {category.links.map((link, j) => (
                    <a
                      key={j}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="text-2xl font-light text-zinc-900 dark:text-zinc-50 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                          {link.title}
                        </h3>
                        <span className="opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1 text-zinc-400">
                          →
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 font-mono group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                        {link.desc}
                      </p>
                    </a>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-32 pt-12 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex justify-between items-center max-w-4xl mx-auto">
            <p className="text-xs font-mono text-zinc-400">© {new Date().getFullYear()} Preyam Rao</p>
            <Link href="/" className="text-xs font-mono text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors uppercase">
              Home
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
