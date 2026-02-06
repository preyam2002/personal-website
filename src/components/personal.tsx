"use client";

import { ScrollReveal } from "@/components/scroll-reveal";
import { Tabs } from "@/components/ui/tabs";
import { Camera, BookOpen, Coffee, Wrench, Music } from "lucide-react";

const hobbies = [
  { icon: Camera, title: "Photography", desc: "Film & digital" },
  { icon: BookOpen, title: "Reading", desc: "Sci-fi & tech" },
  { icon: Coffee, title: "Coffee", desc: "Pour-over" },
];

const interests = [
  "AI", "System Design", "Retro Computing", "Open Source",
];

const currentlyReading = [
  { title: "The Mythical Man-Month", author: "Fred Brooks", progress: 75 },
  { title: "Clean Architecture", author: "Robert C. Martin", progress: 40 },
];

const tools = [
  { category: "Editor", items: ["VS Code", "Neovim"] },
  { category: "Terminal", items: ["iTerm2", "Zsh"] },
  { category: "Productivity", items: ["Notion", "Raycast"] },
];

export function Personal() {
  const tabs = [
    {
      id: "hobbies",
      label: "hobbies",
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hobbies.map((hobby) => (
            <div
              key={hobby.title}
              className="group p-6 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 transition-all duration-300 hover:bg-neutral-900"
            >
              <hobby.icon className="w-5 h-5 text-neutral-500 mb-4 group-hover:text-purple-400 transition-colors" />
              <h3 className="text-white font-medium mb-1">{hobby.title}</h3>
              <p className="text-sm text-neutral-500">{hobby.desc}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "interests",
      label: "interests",
      content: (
        <div className="flex flex-wrap gap-3">
          {interests.map((interest) => (
            <span
              key={interest}
              className="px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm text-neutral-400 hover:border-purple-500/30 hover:text-purple-300 transition-all duration-300 cursor-default"
            >
              {interest}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "currently",
      label: "currently",
      content: (
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-[family-name:var(--font-mono)] text-neutral-500 tracking-wider uppercase mb-4">
              Reading
            </h3>
            <div className="space-y-4">
              {currentlyReading.map((book) => (
                <div
                  key={book.title}
                  className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-white font-medium">{book.title}</p>
                      <p className="text-sm text-neutral-500">{book.author}</p>
                    </div>
                    <span className="text-xs font-[family-name:var(--font-mono)] text-neutral-600">
                      {book.progress}%
                    </span>
                  </div>
                  <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000"
                      style={{ width: `${book.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-[family-name:var(--font-mono)] text-neutral-500 tracking-wider uppercase mb-4">
              Listening
            </h3>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800">
              <Music className="w-5 h-5 text-neutral-500" />
              <div>
                <p className="text-neutral-300">Tycho</p>
                <p className="text-sm text-neutral-500">Ambient</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "tools",
      label: "tools",
      content: (
        <div className="space-y-6">
          {tools.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-[family-name:var(--font-mono)] text-neutral-500 tracking-wider uppercase mb-3">
                {group.category}
              </h3>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <span
                    key={item}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-neutral-400"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <section className="py-32" id="personal">
      <ScrollReveal>
        <div className="flex items-center gap-6 mb-16">
          <span className="font-[family-name:var(--font-mono)] text-xs text-purple-500 tracking-wider">
            03
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-neutral-800 to-transparent" />
          <span className="font-[family-name:var(--font-mono)] text-xs text-neutral-500 tracking-widest uppercase">
            Personal
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={100}>
        <p className="text-xl text-neutral-400 font-light mb-12 max-w-xl">
          Beyond code.
        </p>
      </ScrollReveal>

      <ScrollReveal delay={200}>
        <Tabs tabs={tabs} />
      </ScrollReveal>
    </section>
  );
}
