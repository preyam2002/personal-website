import Link from "next/link";
import IstClock from "./IstClock";
import { getEditionLabel, getInitialIst, getDateline } from "@/lib/edition";

const navItems = [
  { label: "Work", href: "/#work" },
  { label: "Dispatches", href: "/dispatches" },
  { label: "Rankings", href: "/rankings" },
  { label: "Resume", href: "/resume" },
];

export default function Navigation() {
  const edition = getEditionLabel();
  const ist = getInitialIst();
  const dateline = getDateline();
  return (
    <header className="frame">
      <div className="masthead">
        <div className="masthead-left">
          ED. {edition} · {dateline} · <IstClock initial={ist} />
        </div>
        <Link href="/" className="masthead-mark">
          The Preyam Broadsheet
        </Link>
        <nav className="masthead-right">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="rule-double" aria-hidden="true" />
    </header>
  );
}
