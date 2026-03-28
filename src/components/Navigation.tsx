import Link from "next/link";

const navItems = [
  { label: "Whoami", href: "#top" },
  { label: "Work", href: "#work" },
  { label: "Experience", href: "#experience" },
  { label: "Notes", href: "#notes" },
  { label: "Personal", href: "#personal" },
  { label: "Contact", href: "#contact" },
];

export default function Navigation() {
  return (
    <header className="fixed top-4 left-0 right-0 z-50">
      <div className="container">
        <div className="glass-panel rounded-3xl md:rounded-full px-4 sm:px-7 py-3 md:py-3.5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-[16px] sm:text-[18px] font-mono tracking-wider text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-300"
            >
              $ whoami
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-[12px] font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-300"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <nav className="md:hidden mt-3 pt-3 border-t border-[var(--line)] flex gap-4 overflow-x-auto">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="whitespace-nowrap text-[11px] font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors duration-300"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
