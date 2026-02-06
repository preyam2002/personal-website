"use client";

import Link from "next/link";
import { ScrollReveal } from "./scroll-reveal";
import { Mail, Github, Linkedin, Twitter, ArrowUpRight } from "lucide-react";

const socials = [
  { name: "GitHub", href: "https://github.com/preyamrao", icon: Github },
  { name: "LinkedIn", href: "https://linkedin.com/in/preyamrao", icon: Linkedin },
  { name: "Twitter", href: "https://twitter.com/preyamrao", icon: Twitter },
];

export function Contact() {
  return (
    <section className="py-32 relative" id="contact">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-t from-purple-500/5 to-transparent blur-3xl" />
      </div>

      <ScrollReveal>
        <div className="flex items-center gap-6 mb-16">
          <span className="font-[family-name:var(--font-mono)] text-xs text-purple-500 tracking-wider">
            04
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-neutral-800 to-transparent" />
          <span className="font-[family-name:var(--font-mono)] text-xs text-neutral-500 tracking-widest uppercase">
            Contact
          </span>
        </div>
      </ScrollReveal>

      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <ScrollReveal>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-light leading-tight mb-8">
              Let&apos;s build
              <br />
              <span className="text-gradient font-normal">something</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <p className="text-neutral-400 mb-10">
              Got a project? Let&apos;s talk.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <a
              href="mailto:hello@preyam.dev"
              className="group inline-flex items-center gap-4 px-8 py-4 bg-white text-black rounded-full font-[family-name:var(--font-mono)] text-sm tracking-wide relative overflow-hidden transition-all hover:pr-10"
            >
              <Mail className="w-4 h-4 relative z-10" />
              <span className="relative z-10">hello@preyam.dev</span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="absolute inset-0 bg-white group-hover:opacity-0 transition-opacity" />
            </a>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={300}>
          <div className="space-y-1">
            {socials.map((social) => (
              <Link
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between py-6 border-b border-neutral-800 first:border-t hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <social.icon className="w-5 h-5 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                  <span className="text-lg text-neutral-400 group-hover:text-white transition-colors">
                    {social.name}
                  </span>
                </div>
                <ArrowUpRight className="w-5 h-5 text-neutral-600 group-hover:text-purple-400 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
