import Link from "next/link";

const navItems = [
  { label: "Work", href: "/#work" },
  { label: "Dispatches", href: "/dispatches" },
  { label: "Contact", href: "mailto:preyam2002@gmail.com" },
];

export default function Navigation() {
  return (
    <header className="frame">
      <div className="masthead">
        <Link href="/" className="masthead-mark">
          preyam rao
        </Link>
        <nav className="masthead-right">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="rule-thin" aria-hidden="true" />
    </header>
  );
}
