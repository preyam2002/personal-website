export type ProjectListing = {
  id: string;
  symbol: string;
  name: string;
  dek: string;
  tag: string;
  url: string;
  era: string;
};

export const projects: ProjectListing[] = [
  {
    id: "aletheia",
    symbol: "ALETHEIA · 001",
    name: "Aletheia",
    dek: "Decentralized prediction markets on Sui — multi-outcome, AI-resolved, SEAL-encrypted.",
    tag: "SUI · MOVE · LMSR",
    url: "https://github.com/preyam2002/Aletheia",
    era: "2025 — present",
  },
  {
    id: "hft",
    symbol: "HFT/LO · 002",
    name: "HFT Trading System",
    dek: "Sub-microsecond C++17 engine. 1–3μs p50 tick-to-trade across major venues.",
    tag: "C++17 · SIMD · IO_URING",
    url: "https://github.com/preyam2002/HFT-system",
    era: "2024",
  },
  {
    id: "vibeshield",
    symbol: "VIBESHIELD · 003",
    name: "VibeShield",
    dek: "Black-box DAST scanner with 54 attack modules and CI/SARIF exports.",
    tag: "NEXT · REDIS · DOCKER",
    url: "https://github.com/preyam2002/vibeshield",
    era: "2025",
  },
  {
    id: "lumora",
    symbol: "LUMORA · 004",
    name: "Lumora Social",
    dek: "Web3 social platform on Sui. Event-driven feed infra, $140K grant recipient.",
    tag: "SUI · TS · POSTGRES",
    url: "https://github.com/preyam2002",
    era: "2024 — present",
  },
  {
    id: "keyflow",
    symbol: "KEYFLOW · 005",
    name: "KeyFlow",
    dek: "Vim-style keyboard shortcuts for the browser. Hint mode, marks, command palette.",
    tag: "MV3 · TS · CHROME",
    url: "https://github.com/preyam2002/keyflow",
    era: "2025",
  },
  {
    id: "echo-player",
    symbol: "ECHO · 006",
    name: "Echo Player",
    dek: "Local TTS audiobook reader with Kokoro-82M WASM. Audible-grade, fully on-device.",
    tag: "WASM · TS · LOCAL",
    url: "https://github.com/preyam2002/echo-player",
    era: "2025",
  },
  {
    id: "kindred",
    symbol: "KINDRED · 007",
    name: "Kindred",
    dek: "Social taste-matching platform — 97 API endpoints, 16 viral features.",
    tag: "NEXT · SUPABASE · TS",
    url: "https://github.com/preyam2002",
    era: "2024",
  },
  {
    id: "piano-score",
    symbol: "PIANO.S · 008",
    name: "PianoScore",
    dek: "Real-time piano practice app with MIDI input and AI sight-reading.",
    tag: "MIDI · WEB AUDIO · AI",
    url: "https://github.com/preyam2002",
    era: "2025",
  },
  {
    id: "agent-bond",
    symbol: "BOND · 009",
    name: "Agent Bond Protocol",
    dek: "Insurance + reputation layer for autonomous agents. Solana, Colosseum hackathon.",
    tag: "SOLANA · ANCHOR",
    url: "https://github.com/preyam2002",
    era: "2026",
  },
  {
    id: "fig-tree",
    symbol: "FIG · 010",
    name: "Fig Tree",
    dek: "A pretext text-reflow engine paired with a procedural canvas tree.",
    tag: "CANVAS · WASM · TS",
    url: "https://github.com/preyam2002",
    era: "2025",
  },
];
