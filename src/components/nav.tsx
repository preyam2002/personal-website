"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { href: "#about", label: "about" },
  { href: "#work", label: "work" },
  { href: "#personal", label: "personal" },
  { href: "#contact", label: "contact" },
  { href: "/links", label: "links" },
];

export function Nav() {
  const [activeSection, setActiveSection] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 200);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
      
      if (!isHomePage) return;
      
      const sections = ["contact", "personal", "work", "about"];
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 150) {
            setActiveSection(section);
            return;
          }
        }
      }
      setActiveSection("");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timer);
    };
  }, [isHomePage]);

  const isActive = (href: string) => {
    if (href.startsWith("#")) {
      return isHomePage && activeSection === href.slice(1);
    }
    return pathname === href;
  };

  return (
    <AnimatePresence>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ 
          y: isVisible ? 0 : -100, 
          opacity: isVisible ? 1 : 0 
        }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled 
            ? "py-3 bg-black/80 backdrop-blur-xl border-b border-neutral-800/50" 
            : "py-6 bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <Link
            href="/"
            className="group relative font-[family-name:var(--font-mono)] text-sm tracking-wider"
          >
            <span className="text-neutral-500 group-hover:text-neutral-300 transition-colors">
              pr
            </span>
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-gradient-to-r from-purple-500 to-pink-500 group-hover:w-full transition-all duration-300" />
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-2 font-[family-name:var(--font-mono)] text-[11px] sm:text-xs tracking-wider transition-colors rounded-full ${
                  isActive(item.href)
                    ? "text-white"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {isActive(item.href) && (
                  <motion.span
                    layoutId="activeNav"
                    className="absolute inset-0 bg-neutral-800/50 rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </motion.nav>
    </AnimatePresence>
  );
}
