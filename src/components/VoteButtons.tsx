"use client";

import { useState, useTransition } from "react";

type VoteKind = "up" | "down";

type Props = {
  id: string;
  initialUp: number;
  initialDown: number;
  initialVote: VoteKind | null;
};

export default function VoteButtons({
  id,
  initialUp,
  initialDown,
  initialVote,
}: Props) {
  const [up, setUp] = useState(initialUp);
  const [down, setDown] = useState(initialDown);
  const [vote, setVote] = useState<VoteKind | null>(initialVote);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cast = (kind: VoteKind) => {
    setError(null);
    // Optimistic
    const prev = vote;
    let optUp = up;
    let optDown = down;
    let optVote: VoteKind | null = kind;
    if (prev === kind) {
      optVote = null;
      if (kind === "up") optUp -= 1;
      else optDown -= 1;
    } else {
      if (prev === "up") optUp -= 1;
      if (prev === "down") optDown -= 1;
      if (kind === "up") optUp += 1;
      else optDown += 1;
    }
    setUp(Math.max(0, optUp));
    setDown(Math.max(0, optDown));
    setVote(optVote);

    start(async () => {
      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, kind }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          up: number;
          down: number;
          vote: VoteKind | null;
        };
        setUp(json.up);
        setDown(json.down);
        setVote(json.vote);
      } catch (e) {
        // Revert on failure
        setUp(up);
        setDown(down);
        setVote(prev);
        setError(e instanceof Error ? e.message : "vote failed");
      }
    });
  };

  const score = up - down;
  return (
    <div className="vote-cluster" aria-busy={pending}>
      <button
        type="button"
        onClick={() => cast("up")}
        className={`vote-btn vote-up ${vote === "up" ? "active" : ""}`}
        aria-pressed={vote === "up"}
        aria-label="Vote up"
      >
        <span className="arrow">▲</span>
        <span className="count">{up}</span>
      </button>
      <span className={`vote-score ${score >= 0 ? "pos" : "neg"}`}>
        {score >= 0 ? "+" : ""}
        {score}
      </span>
      <button
        type="button"
        onClick={() => cast("down")}
        className={`vote-btn vote-down ${vote === "down" ? "active" : ""}`}
        aria-pressed={vote === "down"}
        aria-label="Vote down"
      >
        <span className="arrow">▼</span>
        <span className="count">{down}</span>
      </button>
      {error && (
        <span className="vote-error" role="status">
          {error}
        </span>
      )}
    </div>
  );
}
