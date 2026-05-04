"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Combo = {
  keys: string[];
  description: string;
  exec: (router: ReturnType<typeof useRouter>) => void;
};

const COMBOS: Record<string, Combo> = {
  "g h": {
    keys: ["g", "h"],
    description: "Home",
    exec: (r) => r.push("/"),
  },
  "g d": {
    keys: ["g", "d"],
    description: "Dispatches",
    exec: (r) => r.push("/dispatches"),
  },
  "g w": {
    keys: ["g", "w"],
    description: "Work",
    exec: (r) => {
      r.push("/#work");
    },
  },
};

const HELP_KEY = "?";
const ESC_KEY = "Escape";

function isEditableTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
}

export default function Keybindings() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let leader: string | null = null;
    let leaderTimer: number | null = null;

    const clearLeader = () => {
      leader = null;
      if (leaderTimer) {
        window.clearTimeout(leaderTimer);
        leaderTimer = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Close help with Escape
      if (e.key === ESC_KEY) {
        if (helpOpen) {
          e.preventDefault();
          setHelpOpen(false);
        }
        clearLeader();
        return;
      }

      // Toggle help with ?
      if (e.key === HELP_KEY) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        clearLeader();
        return;
      }

      // Leader-key sequence (g x)
      if (leader === null && e.key === "g") {
        leader = "g";
        leaderTimer = window.setTimeout(clearLeader, 1500);
        return;
      }

      if (leader === "g") {
        const combo = COMBOS[`g ${e.key}`];
        if (combo) {
          e.preventDefault();
          clearLeader();
          combo.exec(router);
        } else {
          clearLeader();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (leaderTimer) window.clearTimeout(leaderTimer);
    };
  }, [router, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      className="kbd-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbd-card-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setHelpOpen(false);
      }}
    >
      <div className="kbd-card">
        <p className="kbd-card-sub">— shortcuts —</p>
        <h2 id="kbd-card-title" className="kbd-card-title">
          Keys to the broadsheet
        </h2>
        <ul className="kbd-list">
          {Object.values(COMBOS).map((c) => (
            <li key={c.description}>
              <span className="kbd-keys">
                {c.keys.map((k) => (
                  <kbd key={k} className="kbd-key">
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="kbd-desc">{c.description}</span>
            </li>
          ))}
          <li>
            <span className="kbd-keys">
              <kbd className="kbd-key">?</kbd>
            </span>
            <span className="kbd-desc">Toggle this help</span>
          </li>
          <li>
            <span className="kbd-keys">
              <kbd className="kbd-key">Esc</kbd>
            </span>
            <span className="kbd-desc">Close</span>
          </li>
        </ul>
        <p className="kbd-foot">
          <span className="v">●</span> press <kbd className="kbd-key">g</kbd>
          {" "}then a letter
        </p>
      </div>
    </div>
  );
}
