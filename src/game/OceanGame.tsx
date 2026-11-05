"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GameHud, OceanGame as Engine } from "./engine";
import { compassPoint, inputFromKeys, inputFromStick, isMoveKey } from "./input";
import { journalProgress, type JournalEntry } from "./gameState";
import type { GameQuality } from "./types";
import styles from "./game.module.css";

type Phase = "intro" | "loading" | "playing" | "paused" | "error";

const LOOK_SPEED = 0.0022;
const TOUCH_LOOK_SPEED = 0.005;
const STICK_RADIUS = 56;
const HUD_INTERVAL = 100;

function defaultQuality(): GameQuality {
  if (typeof window === "undefined") return "medium";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) return "low";
  const cores = navigator.hardwareConcurrency ?? 4;
  return cores >= 8 ? "high" : "medium";
}

function webglAvailable() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

export default function OceanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const heldKeys = useRef(new Set<string>());
  const touchMode = useRef(false);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const hudTime = useRef(0);
  const [phase, setPhase] = useState<Phase>("intro");
  // The component renders only in the browser (see OceanGameLoader), so the media queries are safe here.
  const [quality, setQuality] = useState<GameQuality>(defaultQuality);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hud, setHud] = useState<GameHud | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [stickView, setStickView] = useState<{ left: number; top: number; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    touchMode.current = window.matchMedia("(pointer: coarse)").matches;
  }, []);

  // Throttle HUD updates to React, but show new messages and journal entries at once.
  const lastHud = useRef<GameHud | null>(null);
  const onHud = useCallback((next: GameHud) => {
    const now = performance.now();
    const previous = lastHud.current;
    const urgent = !previous || previous.message !== next.message || previous.journal !== next.journal
      || previous.loading !== next.loading;
    if (!urgent && now - hudTime.current < HUD_INTERVAL) return;
    hudTime.current = now;
    lastHud.current = next;
    setHud(next);
  }, []);

  const requestLock = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || touchMode.current || document.pointerLockElement === canvas) return;
    try {
      const result = canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Pointer lock is not available; drag to look instead.
    }
  }, []);

  const start = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webglAvailable()) {
      setError("This browser cannot run WebGL 2, so the dive cannot start.");
      setPhase("error");
      return;
    }
    if (engineRef.current) {
      engineRef.current.resume();
      setPhase("playing");
      requestLock();
      return;
    }
    setPhase("loading");
    try {
      const { createOceanGame } = await import("./engine");
      const engine = await createOceanGame(canvas, { quality, reducedMotion, onHud });
      engineRef.current = engine;
      // Browser tests drive the game through this handle. It exists only in development.
      if (process.env.NODE_ENV !== "production") (window as unknown as { __oceanGame?: Engine }).__oceanGame = engine;
      engine.start();
      setPhase("playing");
      requestLock();
    } catch (cause) {
      console.error(cause);
      setError("The dive did not load. Try the low quality setting or another browser.");
      setPhase("error");
    }
  }, [onHud, quality, reducedMotion, requestLock]);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    heldKeys.current.clear();
    engineRef.current?.setInput(inputFromKeys(heldKeys.current));
    setPhase(current => (current === "playing" ? "paused" : current));
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const photo = useCallback(() => {
    engineRef.current?.takePhoto();
  }, []);

  const toggleJournal = useCallback(() => {
    setJournalOpen(open => {
      const next = !open;
      if (next) {
        engineRef.current?.pause();
        if (document.pointerLockElement) document.exitPointerLock();
      } else if (phaseRef.current === "playing") {
        engineRef.current?.resume();
        requestLock();
      }
      return next;
    });
  }, [requestLock]);

  // Keyboard controls.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phaseRef.current !== "playing") {
        if (event.code === "KeyJ" && engineRef.current) toggleJournal();
        return;
      }
      if (event.code === "KeyJ") {
        event.preventDefault();
        toggleJournal();
        return;
      }
      if (event.code === "KeyF" && !event.repeat) {
        event.preventDefault();
        photo();
        return;
      }
      if (event.code === "Escape" || event.code === "KeyP") {
        pause();
        return;
      }
      if (isMoveKey(event.code)) {
        event.preventDefault();
        heldKeys.current.add(event.code);
        engineRef.current?.setInput(inputFromKeys(heldKeys.current));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!heldKeys.current.delete(event.code)) return;
      engineRef.current?.setInput(inputFromKeys(heldKeys.current));
    };
    const onBlur = () => pause();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [pause, photo, toggleJournal]);

  // Mouse look with pointer lock. When the lock ends, the game pauses.
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvasRef.current || phaseRef.current !== "playing") return;
      engineRef.current?.look(event.movementX * LOOK_SPEED, event.movementY * LOOK_SPEED);
    };
    const onLockChange = () => {
      if (!document.pointerLockElement && phaseRef.current === "playing" && !touchMode.current) {
        setJournalOpen(open => {
          if (!open) pause();
          return open;
        });
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [pause]);

  // Resize and clean up.
  useEffect(() => {
    const onResize = () => engineRef.current?.resize();
    window.addEventListener("resize", onResize);
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pause]);

  useEffect(() => () => {
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  // Touch: the left half of the screen is a stick, the right half turns the view.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== "playing") return;
    if (event.pointerType === "mouse") {
      requestLock();
      return;
    }
    touchMode.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const leftSide = event.clientX < window.innerWidth * 0.45;
    if (leftSide && !stick.current) {
      stick.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      setStickView({ left: event.clientX, top: event.clientY, x: 0, y: 0 });
    } else if (!lookTouch.current) {
      lookTouch.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === event.pointerId) {
      const dx = event.clientX - stick.current.x;
      const dy = event.clientY - stick.current.y;
      const length = Math.hypot(dx, dy);
      const clamp = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
      setStickView({ left: stick.current.x, top: stick.current.y, x: dx * clamp, y: dy * clamp });
      engineRef.current?.setInput(inputFromStick(dx, dy, STICK_RADIUS));
    } else if (lookTouch.current?.id === event.pointerId) {
      const dx = event.clientX - lookTouch.current.x;
      const dy = event.clientY - lookTouch.current.y;
      lookTouch.current.x = event.clientX;
      lookTouch.current.y = event.clientY;
      engineRef.current?.look(dx * TOUCH_LOOK_SPEED, dy * TOUCH_LOOK_SPEED);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === event.pointerId) {
      stick.current = null;
      setStickView(null);
      engineRef.current?.setInput({ forward: 0, strafe: 0 });
    }
    if (lookTouch.current?.id === event.pointerId) lookTouch.current = null;
  };

  const onRiseDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    engineRef.current?.setInput({ rise: Number(event.currentTarget.dataset.rise) });
  };
  const onRiseUp = () => engineRef.current?.setInput({ rise: 0 });

  const journal: JournalEntry[] = hud?.journal ?? [];
  const progress = journalProgress(journal);
  const selectedEntry = journal.find(entry => entry.id === selected) ?? journal.find(entry => entry.found) ?? null;
  const showHud = hud && (phase === "playing" || phase === "paused");
  const depth = hud ? Math.max(0, hud.depth) : 0;

  return (
    <main className={styles.game} id="ocean-game">
      <canvas ref={canvasRef} className={styles.canvas} aria-label="The ocean world of the game" />
      <div
        className={styles.input}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-active={phase === "playing" ? "true" : "false"}
      />

      {showHud && (
        <div className={styles.hud} aria-live="polite">
          <div className={styles.topBar}>
            <div className={styles.gauge}>
              <span className={styles.label}>Depth</span>
              <span className={styles.value}>{depth.toFixed(1)} m</span>
            </div>
            <div className={styles.compass} aria-label={`Heading ${Math.round(hud.heading)} degrees`}>
              <span className={styles.value}>{compassPoint(hud.heading)}</span>
              <span className={styles.label}>{Math.round(hud.heading)}°</span>
            </div>
            <div className={styles.gauge}>
              <span className={styles.label}>Journal</span>
              <span className={styles.value}>{progress.found}/{progress.total}</span>
            </div>
          </div>
          <div className={styles.oxygen} data-low={hud.oxygen < 0.25 ? "true" : "false"}>
            <span className={styles.label}>Air</span>
            <div className={styles.oxygenTrack}>
              <div className={styles.oxygenFill} style={{ transform: `scaleX(${hud.oxygen})` }} />
            </div>
          </div>
          {hud.zone && <div className={styles.zone}>{hud.zone}</div>}
          {hud.message && <div className={styles.message}>{hud.message}</div>}
          <div className={styles.reticle} aria-hidden="true" />
        </div>
      )}

      {phase === "playing" && (
        <div className={styles.touchControls}>
          {stickView && (
            <div className={styles.stick} style={{ left: stickView.left, top: stickView.top }}>
              <div className={styles.stickKnob} style={{ transform: `translate(${stickView.x}px, ${stickView.y}px)` }} />
            </div>
          )}
          <div className={styles.buttons}>
            <button type="button" className={styles.roundButton} aria-label="Rise" data-rise="1" onPointerDown={onRiseDown} onPointerUp={onRiseUp} onPointerCancel={onRiseUp} onPointerLeave={onRiseUp}>▲</button>
            <button type="button" className={styles.roundButton} aria-label="Sink" data-rise="-1" onPointerDown={onRiseDown} onPointerUp={onRiseUp} onPointerCancel={onRiseUp} onPointerLeave={onRiseUp}>▼</button>
            <button type="button" className={`${styles.roundButton} ${styles.photoButton}`} aria-label="Take a photo" onClick={photo}>◉</button>
          </div>
          <div className={styles.cornerButtons}>
            <button type="button" className={styles.smallButton} onClick={toggleJournal}>Journal</button>
            <button type="button" className={styles.smallButton} onClick={pause}>Pause</button>
          </div>
        </div>
      )}

      {(phase === "intro" || phase === "paused" || phase === "loading" || phase === "error") && !journalOpen && (
        <div className={styles.overlay}>
          <div className={styles.panel}>
            <p className={styles.kicker}>A free dive</p>
            <h1 className={styles.title}>Open Water</h1>
            {phase === "intro" && (
              <p className={styles.lead}>
                Swim from a shallow reef past a kelp forest to an old wreck and the deep blue beyond.
                Photograph each animal and place to fill your field journal. Watch your air.
              </p>
            )}
            {phase === "paused" && <p className={styles.lead}>Paused. {progress.found} of {progress.total} journal entries found.</p>}
            {phase === "loading" && (
              <p className={styles.lead}>Building the sea… {Math.round((hud?.loading ?? 0) * 100)}%</p>
            )}
            {phase === "error" && <p className={styles.lead}>{error}</p>}

            {(phase === "intro" || phase === "paused") && (
              <>
                <button type="button" className={styles.primary} onClick={start}>
                  {phase === "intro" ? "Start the dive" : "Resume"}
                </button>
                {phase === "intro" && (
                  <fieldset className={styles.quality}>
                    <legend>Quality</legend>
                    {(["low", "medium", "high"] as const).map(level => (
                      <label key={level}>
                        <input type="radio" name="quality" value={level} checked={quality === level} onChange={() => setQuality(level)} />
                        {level}
                      </label>
                    ))}
                  </fieldset>
                )}
                {phase === "paused" && (
                  <button type="button" className={styles.secondary} onClick={toggleJournal}>Open the journal</button>
                )}
                <dl className={styles.controls}>
                  <dt>Mouse</dt><dd>Look (click to capture)</dd>
                  <dt>W A S D</dt><dd>Swim</dd>
                  <dt>Space / C</dt><dd>Rise / sink</dd>
                  <dt>Shift</dt><dd>Sprint (uses more air)</dd>
                  <dt>F</dt><dd>Take a photo</dd>
                  <dt>J</dt><dd>Journal</dd>
                  <dt>Esc</dt><dd>Pause</dd>
                  <dt>Touch</dt><dd>Left thumb swims, right thumb looks</dd>
                </dl>
              </>
            )}
            {phase === "error" && (
              <button type="button" className={styles.secondary} onClick={() => { setPhase("intro"); setQuality("low"); }}>
                Back
              </button>
            )}
            <p className={styles.footer}>
              <Link href="/">Back to the site</Link> · <a href="/game/CREDITS.md">Model credits</a>
            </p>
          </div>
        </div>
      )}

      {journalOpen && (
        <div className={styles.overlay}>
          <div className={`${styles.panel} ${styles.journal}`}>
            <div className={styles.journalHeader}>
              <h2 className={styles.title}>Field journal</h2>
              <span className={styles.label}>{progress.found} of {progress.total}</span>
            </div>
            <div className={styles.journalBody}>
              <ul className={styles.entries}>
                {journal.map(entry => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={styles.entry}
                      data-found={entry.found ? "true" : "false"}
                      data-selected={selectedEntry?.id === entry.id ? "true" : "false"}
                      onClick={() => setSelected(entry.id)}
                      disabled={!entry.found}
                    >
                      {entry.found ? entry.name : "???"}
                    </button>
                  </li>
                ))}
              </ul>
              <div className={styles.entryDetail}>
                {selectedEntry ? (
                  <>
                    <h3>{selectedEntry.name}</h3>
                    <p className={styles.subtitle}>{selectedEntry.subtitle}</p>
                    <p>{selectedEntry.description}</p>
                  </>
                ) : (
                  <p>No entries yet. Get close to an animal, frame it in the centre, and press F.</p>
                )}
              </div>
            </div>
            <button type="button" className={styles.primary} onClick={toggleJournal}>Close (J)</button>
          </div>
        </div>
      )}

      {hud && hud.flash > 0.01 && <div className={styles.flash} style={{ opacity: hud.flash * 0.6 }} />}
    </main>
  );
}
