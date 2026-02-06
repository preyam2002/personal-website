"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Tab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

interface TabsProps {
  tabs: Tab[];
  className?: string;
  defaultTab?: string;
}

export function Tabs({ tabs, className, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0].id);

  return (
    <div className={cn("w-full", className)}>
      {/* Tab buttons */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative px-5 py-2.5 font-[family-name:var(--font-mono)] text-xs tracking-wider transition-all duration-300 rounded-full whitespace-nowrap",
              activeTab === tab.id
                ? "text-white"
                : "text-neutral-500 hover:text-neutral-300"
            )}
          >
            {activeTab === tab.id && (
              <motion.span
                layoutId="activeTabBg"
                className="absolute inset-0 bg-neutral-800/50 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {tabs.map((tab) => (
          <motion.div
            key={tab.id}
            initial={false}
            animate={{
              opacity: activeTab === tab.id ? 1 : 0,
              y: activeTab === tab.id ? 0 : 10,
              display: activeTab === tab.id ? "block" : "none",
            }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab.content}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
