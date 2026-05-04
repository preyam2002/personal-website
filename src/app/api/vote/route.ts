import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { applyVote, type VoteKind } from "@/lib/store";

export const runtime = "nodejs";

const ALLOWED_IDS = new Set([
  "aletheia",
  "hft",
  "vibeshield",
  "lumora",
  "keyflow",
  "echo-player",
  "kindred",
  "piano-score",
  "agent-bond",
  "fig-tree",
]);

export async function POST(req: NextRequest) {
  // Same-origin guard
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "bad origin" }, { status: 400 });
    }
  }

  let body: { id?: string; kind?: VoteKind } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { id, kind } = body;
  if (
    typeof id !== "string" ||
    !ALLOWED_IDS.has(id) ||
    (kind !== "up" && kind !== "down")
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const prevRaw = cookieStore.get(`vote_${id}`)?.value;
  const prev: VoteKind | null =
    prevRaw === "up" || prevRaw === "down" ? prevRaw : null;

  // Toggle: clicking your existing vote unvotes; otherwise switch.
  const next: VoteKind | null = prev === kind ? null : kind;

  const counts = await applyVote(id, prev, next);

  if (next) {
    cookieStore.set(`vote_${id}`, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  } else {
    cookieStore.delete(`vote_${id}`);
  }

  return NextResponse.json({ ...counts, vote: next });
}
