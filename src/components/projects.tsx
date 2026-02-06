"use client";

import Link from "next/link";
import { ScrollReveal } from "./scroll-reveal";
import { ArrowUpRight } from "lucide-react";
import { useRef } from "react";

interface Project {
  name: string;
  description: string;
  href: string;
  tech: string[];
  year: string;
}

const projects: Project[] = [
  {
    name: "Lumora Social",
    description: "Decentralized social platform on Sui blockchain.",
    href: "https://github.com/preyamrao",
    tech: ["Sui", "React", "Rust"],
    year: "2024",
  },
  {
    name: "Aletheia",
    description: "AI-powered research tool for fact verification.",
    href: "https://github.com/preyamrao",
    tech: ["Python", "FastAPI", "OpenAI"],
    year: "2024",
  },
  {
    name: "Competitive Programming",
    description: "Candidate Master. 2000+ problems solved.",
    href: "https://codeforces.com/profile/preyamrao",
    tech: ["C++", "Algorithms"],
    year: "2020-Present",
  },
];

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty("--mouse-x", `${x}px`);
    cardRef.current.style.setProperty("--mouse-y", `${y}px`);
  };

  return (
    <ScrollReveal delay={index * 100}>
      <Link
        ref={cardRef}
        href={project.href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseMove={handleMouseMove}
        className="group project-card block p-8 sm:p-10"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-start justify-between mb-6">
            <div className="space-y-1">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-neutral-600 tracking-wider">
                {project.year}
              </span>
              <h3 className="text-2xl sm:text-3xl font-light text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-pink-400 transition-all duration-500">
                {project.name}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-full border border-neutral-700 flex items-center justify-center group-hover:border-purple-500/50 group-hover:bg-purple-500/10 transition-all duration-300">
              <ArrowUpRight className="w-4 h-4 text-neutral-500 group-hover:text-purple-400 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>

          <p className="text-neutral-400 leading-relaxed mb-8 flex-grow">
            {project.description}
          </p>

          <div className="flex flex-wrap gap-2">
            {project.tech.map((tech) => (
              <span
                key={tech}
                className="font-[family-name:var(--font-mono)] text-[10px] px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-500 group-hover:border-neutral-700 group-hover:text-neutral-400 transition-all duration-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </Link>
    </ScrollReveal>
  );
}

export function Projects() {
  return (
    <section className="py-32" id="work">
      <ScrollReveal>
        <div className="flex items-center gap-6 mb-16">
          <span className="font-[family-name:var(--font-mono)] text-xs text-purple-500 tracking-wider">
            02
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-neutral-800 to-transparent" />
          <span className="font-[family-name:var(--font-mono)] text-xs text-neutral-500 tracking-widest uppercase">
            Work
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <p className="text-xl text-neutral-400 font-light mb-16 max-w-xl">
          Selected projects.
        </p>
      </ScrollReveal>

      <div className="space-y-6">
        {projects.map((project, index) => (
          <ProjectCard key={project.name} project={project} index={index} />
        ))}
      </div>

      <ScrollReveal delay={400}>
        <div className="mt-16 text-center">
          <Link
            href="https://github.com/preyamrao"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-3 text-neutral-500 hover:text-neutral-300 transition-colors font-[family-name:var(--font-mono)] text-sm"
          >
            <span className="relative">
              GitHub
              <span className="absolute bottom-0 left-0 w-full h-px bg-neutral-700 group-hover:bg-neutral-500 transition-colors" />
            </span>
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </ScrollReveal>
    </section>
  );
}
