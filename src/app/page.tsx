import Navigation from "@/components/Navigation";

const links = [
  { label: "GitHub", url: "https://github.com/preyam2002" },
  { label: "LinkedIn", url: "https://linkedin.com/in/preyam" },
  { label: "Email", url: "mailto:preyam2002@gmail.com" },
];

export default function Home() {
  return (
    <main className="bg-white min-h-screen flex flex-col">
      <Navigation />
      
      <div className="flex-1 flex flex-col justify-center container py-20">
        <h1 className="text-[clamp(2.5rem,9vw,8rem)] font-serif leading-[0.95] tracking-tight text-neutral-900 max-w-5xl mb-16">
          In a world of
          <br />
          complex systems,
          <br />
          <span className="text-neutral-300">I build clarity.</span>
        </h1>
        
        <nav className="flex flex-wrap gap-8">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target={link.url.startsWith("http") ? "_blank" : undefined}
              rel={link.url.startsWith("http") ? "noopener noreferrer" : undefined}
              className="text-[13px] font-mono text-neutral-400 hover:text-neutral-900 transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </main>
  );
}
