"use client";

import dynamic from "next/dynamic";

/** The game needs WebGL and the browser, so it loads only on the client. */
const OceanGame = dynamic(() => import("./OceanGame"), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#031820" }} />,
});

export default function OceanGameLoader() {
  return <OceanGame />;
}
