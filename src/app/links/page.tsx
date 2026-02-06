import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ScrollProgress } from "@/components/scroll-progress";
import { PageTransition } from "@/components/page-transition";
import { BackToTop } from "@/components/back-to-top";
import Link from "next/link";
import { ArrowUpRight, ArrowLeft } from "lucide-react";

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
    <>
      <PageTransition />
      <ScrollProgress />
      <Nav />
      <main className="flex-1 px-6 md:px-12 lg:px-20 max-w-6xl mx-auto w-full relative pt-32 pb-24">
        {/* Header */}
        <div className="mb-20">
          <Link 
            href="/" 
            className="group inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-300 mb-12 transition-colors font-[family-name:var(--font-mono)]"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back
          </Link>

          <div className="flex items-center gap-6 mb-8">
            <span className="font-[family-name:var(--font-mono)] text-xs text-purple-500 tracking-wider">
              /
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-neutral-800 to-transparent" />
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-light text-white mb-6">
            <span className="text-gradient">Links</span>
          </h1>
          <p className="text-lg text-neutral-400 max-w-md">
            Curated bookmarks and resources.
          </p>
        </div>

        {/* Links grid */}
        <div className="space-y-20">
          {linkCategories.map((category, i) => (
            <section key={i}>
              <h2 className="text-xs font-[family-name:var(--font-mono)] text-neutral-500 tracking-widest uppercase mb-8">
                {category.name}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.links.map((link, j) => (
                  <a
                    key={j}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between p-5 rounded-xl bg-neutral-900/30 border border-neutral-800/50 hover:border-neutral-700 hover:bg-neutral-900/50 transition-all duration-300"
                  >
                    <div>
                      <h3 className="text-neutral-300 font-medium mb-1 group-hover:text-purple-300 transition-colors">
                        {link.title}
                      </h3>
                      <p className="text-sm text-neutral-500">
                        {link.desc}
                      </p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-neutral-600 group-hover:text-purple-400 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-32 pt-8 border-t border-neutral-800/50">
          <div className="flex items-center justify-between text-xs text-neutral-600 font-[family-name:var(--font-mono)]">
            <span>Last updated: {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
            <span>pr</span>
          </div>
        </div>
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
