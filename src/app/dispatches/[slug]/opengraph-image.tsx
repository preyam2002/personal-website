import { ImageResponse } from "next/og";
import { getAllDispatches, getDispatch } from "@/lib/dispatches";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "The Preyam Broadsheet — Dispatch";

export function generateStaticParams() {
  return getAllDispatches().map((d) => ({ slug: d.slug }));
}

async function loadDisplayFont(): Promise<ArrayBuffer | null> {
  const candidates = [
    "https://github.com/google/fonts/raw/main/ofl/ebgaramond/static/EBGaramond-Regular.ttf",
    "https://github.com/google/fonts/raw/main/ofl/ebgaramond/static/EBGaramond-Medium.ttf",
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 1000) return buf;
    } catch {
      // try next
    }
  }
  return null;
}

const PAPER = "#f3ecdd";
const INK = "#0d0d0a";
const VERMILLION = "#c22e1c";
const MUTE = "#5e5746";
const RULE = "#b8ad95";

type Params = Promise<{ slug: string }>;

export default async function OG({ params }: { params: Params }) {
  const { slug } = await params;
  const dispatch = getDispatch(slug);
  const title = dispatch?.title ?? "Dispatch";
  const dek = dispatch?.dek ?? "";
  const dateStr = dispatch
    ? new Date(dispatch.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  const kicker = dispatch?.kicker ?? "Dispatch";

  const displayFont = await loadDisplayFont();
  const displayFamily = displayFont ? "EditorialSerif" : "Georgia";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PAPER,
          padding: "60px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          color: INK,
          fontFamily: displayFamily,
        }}
      >
        {/* MASTHEAD */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 18,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: MUTE,
            }}
          >
            <div style={{ display: "flex", color: VERMILLION }}>
              The Preyam Broadsheet
            </div>
            <div style={{ display: "flex" }}>{kicker}</div>
          </div>
          <div
            style={{
              display: "flex",
              borderTop: `3px solid ${INK}`,
              borderBottom: `1px solid ${INK}`,
              height: 6,
              marginTop: 12,
            }}
          />
        </div>

        {/* HEADLINE BLOCK */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            paddingRight: 80,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: VERMILLION,
              marginBottom: 16,
            }}
          >
            {dateStr}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 60 ? 64 : 84,
              lineHeight: 0.97,
              letterSpacing: -1,
              color: INK,
            }}
          >
            {title}
          </div>
          {dek && (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                color: MUTE,
                fontStyle: "italic",
                lineHeight: 1.25,
                marginTop: 18,
              }}
            >
              {dek}
            </div>
          )}
        </div>

        {/* COLOPHON */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 18,
            color: MUTE,
            letterSpacing: 3,
            textTransform: "uppercase",
            borderTop: `1px solid ${RULE}`,
            paddingTop: 18,
          }}
        >
          <div style={{ display: "flex" }}>preyam2002@gmail.com</div>
          <div style={{ display: "flex" }}>
            preyam-rao.vercel.app/dispatches/{slug}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      ...(displayFont
        ? {
            fonts: [
              {
                name: "EditorialSerif",
                data: displayFont,
                style: "normal",
                weight: 400,
              },
            ],
          }
        : {}),
    },
  );
}
