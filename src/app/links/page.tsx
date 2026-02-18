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
    <div className="bg-white text-neutral-900 min-h-screen">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md">
        <div className="container py-6 flex items-center justify-between">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-[13px] font-mono text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
          >
            <span className="transition-transform duration-300 group-hover:-translate-x-1">
              &larr;
            </span>
            Back
          </Link>
        </div>
      </header>

      <main className="container pt-32 md:pt-48 pb-20">
        <div className="max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-24 md:mb-32"
          >
            <span className="text-[11px] font-mono text-neutral-300 uppercase tracking-[0.2em] block mb-8">
              {"//"}Links
            </span>
            <h1 className="text-[clamp(2.5rem,7vw,5rem)] font-serif leading-[0.95] tracking-tight text-neutral-900 mb-6">
              Curated
              <br />
              <span className="text-neutral-300">Resources</span>
            </h1>
            <p className="text-lg text-neutral-400 font-light max-w-md leading-relaxed">
              A collection of tools, readings, and inspiration that I frequently
              revisit.
            </p>
          </motion.div>

          <div className="space-y-20 md:space-y-28">
            {linkCategories.map((category, i) => (
              <motion.section
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.05, duration: 0.6 }}
              >
                <h2 className="text-[11px] font-mono text-neutral-300 uppercase tracking-[0.2em] mb-8 pb-4 border-b border-neutral-100">
                  {category.name}
                </h2>
                <div className="grid md:grid-cols-2 gap-x-16 gap-y-6">
                  {category.links.map((link, j) => (
                    <a
                      key={j}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block py-2"
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <h3 className="text-xl font-serif text-neutral-900 group-hover:text-neutral-400 transition-colors duration-300">
                          {link.title}
                        </h3>
                        <span className="text-neutral-200 group-hover:text-neutral-900 transition-all duration-300 group-hover:translate-x-1 ml-3">
                          &rarr;
                        </span>
                      </div>
                      <p className="text-[13px] font-mono text-neutral-300 group-hover:text-neutral-500 transition-colors duration-300">
                        {link.desc}
                      </p>
                    </a>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>
        </div>

        <footer className="mt-32 pt-8 border-t border-neutral-100">
          <div className="flex justify-between items-center max-w-4xl">
            <p className="text-[12px] font-mono text-neutral-300">
              &copy; {new Date().getFullYear()} Preyam Rao
            </p>
            <Link
              href="/"
              className="text-[12px] font-mono text-neutral-300 hover:text-neutral-900 transition-colors duration-300"
            >
              Home
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
