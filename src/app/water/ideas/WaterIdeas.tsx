"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowUpRight, ArrowLeft, Check, Pause, Play, X } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { getWaterQuality } from "@/lib/waterQuality";
import type { MotionMode, SceneStatus } from "./WaterScene";
import s from "./ideas.module.css";

const WaterScene = dynamic(() => import("./WaterScene"), { ssr: false });

const ideas = [
  {
    name: "Open water",
    subtitle: "A horizon without an end.",
    kind: "Cinematic / expansive",
    detail:
      "An ocean fills the page. Large type introduces your work above the surface.",
    interaction: "Move across the water to disturb its reflections.",
    headline: (
      <>
        Build beyond
        <br />
        the horizon.
      </>
    ),
    layout: "ocean",
  },
  {
    name: "Still pond",
    subtitle: "Small gestures. Lasting ripples.",
    kind: "Minimal / tactile",
    detail:
      "A top-down pond becomes your canvas. Circular ripples surround a restrained, serif portfolio.",
    interaction: "Move or touch the pond to create concentric ripples.",
    headline: (
      <>
        A little depth.
        <br />A lot of possibility.
      </>
    ),
    layout: "pond",
  },
  {
    name: "Below the surface",
    subtitle: "Follow the light down.",
    kind: "Immersive / luminous",
    detail:
      "Underwater light patterns frame your work. Large type and bright turquoise replace the conventional ocean horizon.",
    interaction: "Adjust the current to change the light patterns.",
    headline: (
      <>
        There is more
        <br />
        beneath the surface.
      </>
    ),
    layout: "depth",
  },
  {
    name: "Rain room",
    subtitle: "A quiet place for complex ideas.",
    kind: "Editorial / atmospheric",
    detail:
      "Rain expands into overlapping rings. A narrow editorial column keeps the portfolio calm and readable.",
    interaction:
      "Rain creates rings continuously. Your pointer adds another ripple.",
    headline: (
      <>
        Thoughts,
        <br />
        in their element.
      </>
    ),
    layout: "rain",
  },
  {
    name: "Living light",
    subtitle: "Light follows your touch.",
    kind: "Experimental / nocturnal",
    detail:
      "Bioluminescent water illuminates a dark portfolio. Cyan light follows your pointer across the surface.",
    interaction: "Move your pointer to reveal a luminous patch of water.",
    headline: (
      <>
        Make something
        <br />
        come alive.
      </>
    ),
    layout: "glow",
  },
  {
    name: "Tidal index",
    subtitle: "Between structure and motion.",
    kind: "Coastal / warm",
    detail:
      "A shoreline divides pale green water from warm sand. A compact list presents your experience.",
    interaction: "Change the tide strength to move the foam along the shore.",
    headline: (
      <>
        Always curious.
        <br />
        Never still.
      </>
    ),
    layout: "shore",
  },
  {
    name: "Current field",
    subtitle: "Complexity finds its own form.",
    kind: "Technical / generative",
    detail:
      "Spiral currents form an abstract water field. Monospace labels and large type connect the scene to systems and code.",
    interaction:
      "Adjust the flow strength or freeze the field for a closer look.",
    headline: (
      <>
        Systems.
        <br />
        In motion.
      </>
    ),
    layout: "flow",
  },
  {
    name: "Glacial memory",
    subtitle: "Clear thinking. Deep water.",
    kind: "Sculptural / cool",
    detail:
      "Pale water and fractured light create a glacial landscape. A sparse portfolio gives the scene room.",
    interaction: "Move across the surface to change the reflected wave field.",
    headline: (
      <>
        Clarity comes
        <br />
        from depth.
      </>
    ),
    layout: "ice",
  },
];

const choiceKey = "water-concept-choice";
function readChoice() {
  try {
    const value = localStorage.getItem(choiceKey);
    const index = Number(value);
    return value !== null &&
      value.trim() !== "" &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < ideas.length
      ? index
      : null;
  } catch {
    return null;
  }
}
function subscribeChoice(callback: () => void) {
  window.addEventListener("water-choice", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("water-choice", callback);
    window.removeEventListener("storage", callback);
  };
}
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const readMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches || getWaterQuality() === "static";

export default function WaterIdeas() {
  const [active, setActive] = useState<number | null>(null);
  const [energy, setEnergy] = useState(1);
  const [motion, setMotion] = useState<MotionMode>("system");
  const [galleryMotion, setGalleryMotion] = useState<MotionMode>("paused");
  const [status, setStatus] = useState<SceneStatus>("Live");
  const [saveError, setSaveError] = useState("");
  const picked = useSyncExternalStore(subscribeChoice, readChoice, () => null);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    readMotion,
    () => false,
  );
  const paused = motion === "paused" || (motion === "system" && reduced);
  const galleryPaused =
    galleryMotion === "paused" || (galleryMotion === "system" && reduced);
  const galleryPosition = useRef(0);
  const triggerId = useRef("");
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const previousActive = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (active !== null) {
      window.scrollTo({ top: 0, behavior: "instant" });
      previewHeading.current?.focus({ preventScroll: true });
    } else if (previousActive.current !== null) {
      window.scrollTo({ top: galleryPosition.current, behavior: "instant" });
      document
        .getElementById(triggerId.current)
        ?.focus({ preventScroll: true });
    }
    previousActive.current = active;
  }, [active]);

  useEffect(() => {
    if (active === null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]'))
        setActive(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [active]);

  const choose = (index: number) => {
    try {
      if (picked === index) localStorage.removeItem(choiceKey);
      else localStorage.setItem(choiceKey, String(index));
      window.dispatchEvent(new Event("water-choice"));
      setSaveError("");
    } catch {
      setSaveError(
        "This browser could not save your choice. Allow local storage and try again.",
      );
    }
  };
  const open = (index: number) => {
    if (active === null) {
      galleryPosition.current = window.scrollY;
      triggerId.current = document.activeElement?.id || `concept-${index}`;
    }
    setEnergy(1);
    setMotion("system");
    setSaveError("");
    setActive(index);
  };
  if (active !== null) {
    const idea = ideas[active];
    return (
      <main className={`${s.preview} ${s[idea.layout]}`}>
        <Image
          src={`/water/concept-${active}.webp`}
          alt=""
          fill
          unoptimized
          className={s.fullCanvas}
          style={{ objectFit: "cover", position: "fixed" }}
        />
        <WaterScene
          mode={active}
          energy={energy}
          motion={motion}
          className={s.fullCanvas}
          onStatus={setStatus}
        />
        <div className={s.scrim} />
        <header className={s.previewNav}>
          <button onClick={() => setActive(null)}>
            <ArrowLeft size={16} /> All eight concepts
          </button>
          <span>Preyam Rao</span>
          <a href="mailto:preyam2002@gmail.com">
            Get in touch <ArrowUpRight size={15} />
          </a>
        </header>
        <section className={s.portfolio}>
          <p className={s.eyebrow}>Software engineer / Bangalore</p>
          <h1 ref={previewHeading} tabIndex={-1}>
            {idea.headline}
          </h1>
          <p className={s.intro}>
            I am Preyam. I build backend systems, smart contracts, and
            full-stack products.
          </p>
          <a className={s.workLink} href="#concept-work">
            Explore my work <ArrowUpRight size={17} />
          </a>
        </section>
        <section className={s.work} id="concept-work">
          <span>Selected experience</span>
          <a
            href="https://www.linkedin.com/company/alphafisui"
            target="_blank"
            rel="noreferrer"
          >
            AlphaFi <small>Software Engineer</small>
            <ArrowUpRight size={16} />
          </a>
          <a
            href="https://www.linkedin.com/company/oracle"
            target="_blank"
            rel="noreferrer"
          >
            Oracle <small>Software Developer</small>
            <ArrowUpRight size={16} />
          </a>
        </section>
        <aside className={s.console}>
          <div className={s.consoleHeading}>
            <div>
              <span className={s.eyebrow}>
                Concept {String(active + 1).padStart(2, "0")}
              </span>
              <h2>{idea.name}</h2>
            </div>
            <button aria-label="Close preview" onClick={() => setActive(null)}>
              <X size={18} />
            </button>
          </div>
          <p>{idea.interaction}</p>
          <div className={s.controls}>
            <label>
              Water energy{" "}
              <input
                aria-label="Water energy"
                type="range"
                min="0.3"
                max="2"
                step="0.1"
                value={energy}
                onChange={(e) => setEnergy(Number(e.target.value))}
              />
            </label>
            <button
              aria-label={paused ? "Resume simulation" : "Pause simulation"}
              onClick={() => setMotion(paused ? "playing" : "paused")}
            >
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
          </div>
          <div className={s.consoleBottom}>
            <span role="status">{status}</span>
            <button
              className={s.pick}
              aria-pressed={picked === active}
              onClick={() => choose(active)}
            >
              {picked === active ? (
                <>
                  <Check size={15} /> Clear choice
                </>
              ) : (
                "Pick this direction"
              )}
            </button>
          </div>
          {picked === active && (
            <p className={s.choiceStatus} role="status">
              Your choice: {idea.name}. Saved in this browser.
            </p>
          )}
          {saveError && (
            <p className={s.saveError} role="alert">
              {saveError}
            </p>
          )}
          <div className={s.switcher} aria-label="Switch concept">
            {ideas.map((item, i) => (
              <button
                key={item.name}
                aria-label={`Preview ${item.name}`}
                aria-pressed={i === active}
                onClick={() => open(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </aside>
      </main>
    );
  }
  return (
    <main className={s.gallery}>
      <header className={s.nav}>
        <Link href="/" prefetch={false}>
          PR<span> / Water studies</span>
        </Link>
        <button
          className={s.galleryMotion}
          onClick={() => setGalleryMotion(galleryPaused ? "playing" : "paused")}
        >
          {galleryPaused ? <Play size={14} /> : <Pause size={14} />}{" "}
          {galleryPaused ? "Play previews" : "Pause previews"}
        </button>
        <Link href="/" prefetch={false}>
          Original water page <ArrowUpRight size={15} />
        </Link>
      </header>
      <section className={s.heading}>
        <div>
          <p className={s.eyebrow}>A portfolio, in a different element</p>
          <h1>
            Eight ways
            <br />
            to be <em>water.</em>
          </h1>
        </div>
        <div className={s.headingAside}>
          <p>
            A fresh start for your personal website. Eight environments. Eight
            different moods. All alive.
          </p>
          <p className={s.instructions}>
            Open a concept. Touch the water. Pick your direction.
          </p>
          {picked !== null && (
            <p className={s.selected} role="status">
              <Check size={14} /> Your choice: {ideas[picked].name}
            </p>
          )}
        </div>
      </section>
      <section className={s.grid} aria-label="Water concept gallery">
        {ideas.map((idea, i) => (
          <article key={idea.name} className={`${s.card} ${s[idea.layout]}`}>
            <button
              id={`concept-${i}`}
              className={s.visual}
              onClick={() => open(i)}
              aria-label={`Preview ${idea.name}`}
            >
              {galleryPaused ? (
                <Image
                  src={`/water/concept-${i}.webp`}
                  alt=""
                  fill
                  unoptimized
                  sizes="(max-width: 760px) 100vw, 50vw"
                  className={s.cardCanvas}
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <WaterScene
                  mode={i}
                  motion={galleryMotion}
                  thumbnail
                  className={s.cardCanvas}
                />
              )}
              <span className={s.miniName}>
                Preyam
                <br />
                Rao.
              </span>
              <span className={s.open}>
                Explore concept <ArrowUpRight size={17} />
              </span>
              {picked === i && (
                <span className={s.chosen}>
                  <Check size={15} /> Your choice
                </span>
              )}
            </button>
            <div className={s.caption}>
              <div>
                <span className={s.number}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2>{idea.name}</h2>
                <span className={s.kind}>{idea.kind}</span>
              </div>
              <p className={s.subtitle}>{idea.subtitle}</p>
              <p className={s.detail}>{idea.detail}</p>
              <button
                id={`concept-link-${i}`}
                className={s.textButton}
                aria-label={`Enter ${idea.name}`}
                onClick={() => open(i)}
              >
                Enter the live preview <ArrowUpRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </section>
      <footer className={s.footer}>
        <span>Preyam Rao / Water studies</span>
        <p>
          Live shader studies. Visual approximations, not scientific fluid
          models.
        </p>
        <Link href="/" prefetch={false}>
          Return to the original <ArrowUpRight size={14} />
        </Link>
      </footer>
    </main>
  );
}
