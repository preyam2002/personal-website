import Link from "next/link";

const links = [
  { title: "GitHub", url: "https://github.com" },
  { title: "LinkedIn", url: "https://linkedin.com" },
  { title: "Twitter", url: "https://twitter.com" },
  { title: "Email", url: "mailto:hey@prey.am" },
];

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold text-center mb-12">Preyam Rao</h1>
        <nav className="space-y-3">
          {links.map((link) => (
            <a
              key={link.title}
              href={link.url}
              className="block py-4 px-6 bg-white border border-neutral-200 rounded-lg text-center hover:border-neutral-400 transition-colors"
            >
              {link.title}
            </a>
          ))}
        </nav>
      </div>
    </main>
  );
}
