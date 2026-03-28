"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { InstancedMesh, Group } from "three";
import styles from "./lab3d.module.css";

type CubeConfig = {
  orbitRadius: number;
  speed: number;
  offset: number;
  scale: number;
  verticalAmp: number;
  hue: number;
};

type TabKey = "professional" | "personal";

function createConfigs(count: number): CubeConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    orbitRadius: 1.6 + (index % 9) * 0.48 + Math.random() * 0.32,
    speed: 0.18 + (index % 7) * 0.04 + Math.random() * 0.03,
    offset: Math.random() * Math.PI * 2,
    scale: 0.15 + (index % 6) * 0.06 + Math.random() * 0.02,
    verticalAmp: 0.5 + Math.random() * 1.8,
    hue: 0.48 + Math.random() * 0.35,
  }));
}

function CameraRig({ paused }: { paused: boolean }) {
  useFrame((state) => {
    if (paused) return;
    const { camera, pointer } = state;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 2.4, 0.06);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.y * 1.6 + 0.2, 0.06);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function NeonSwarm({ paused }: { paused: boolean }) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const configs = useMemo(() => createConfigs(220), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    configs.forEach((config, index) => {
      color.setHSL(config.hue, 0.85, 0.62);
      mesh.setColorAt(index, color);
    });

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [configs, color]);

  useFrame((state) => {
    if (paused) return;
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = state.clock.elapsedTime;

    configs.forEach((config, index) => {
      const theta = t * config.speed + config.offset;
      const x = Math.cos(theta) * config.orbitRadius;
      const z = Math.sin(theta * 1.07) * config.orbitRadius;
      const y = Math.sin(theta * 1.6 + config.offset) * config.verticalAmp * 0.42;
      const s = config.scale * (1 + Math.sin(theta * 3.2) * 0.26);

      dummy.position.set(x, y, z);
      dummy.rotation.set(theta * 0.8, theta * 1.3, theta * 0.65);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, configs.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        vertexColors
        roughness={0.2}
        metalness={0.56}
        emissive="#10263a"
        emissiveIntensity={0.9}
      />
    </instancedMesh>
  );
}

function OrbitRings({ paused }: { paused: boolean }) {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (paused) return;
    const group = groupRef.current;
    if (!group) return;

    const t = state.clock.elapsedTime;
    group.rotation.y = t * 0.18;
    group.rotation.x = Math.sin(t * 0.4) * 0.12;
  });

  return (
    <group ref={groupRef}>
      <mesh rotation-x={Math.PI / 2.3} scale={1.35}>
        <torusGeometry args={[3.8, 0.05, 32, 220]} />
        <meshStandardMaterial color="#5cefe0" emissive="#285f71" emissiveIntensity={0.9} />
      </mesh>
      <mesh rotation-x={Math.PI / 2.3} rotation-z={Math.PI / 3} scale={1.95}>
        <torusGeometry args={[3.8, 0.04, 28, 180]} />
        <meshStandardMaterial color="#ff9654" emissive="#82431f" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function Scene3D({ paused }: { paused: boolean }) {
  return (
    <>
      <color attach="background" args={["#050912"]} />
      <fog attach="fog" args={["#050912", 7, 28]} />

      <ambientLight intensity={0.32} />
      <directionalLight position={[6, 6, 5]} intensity={1.35} color="#d2f7ff" />
      <pointLight position={[-6, -1, 4]} intensity={24} color="#ff8c45" distance={20} />
      <pointLight position={[5, 1.5, -2]} intensity={20} color="#63ffe7" distance={18} />

      <Stars radius={95} depth={42} count={1700} factor={4} saturation={0} fade speed={paused ? 0 : 0.8} />
      <Sparkles count={75} scale={[11, 7, 11]} size={2.2} speed={paused ? 0 : 0.38} color="#7cfce9" />

      <Float speed={paused ? 0 : 1.9} rotationIntensity={0.8} floatIntensity={1.4}>
        <mesh>
          <icosahedronGeometry args={[1.02, 3]} />
          <MeshDistortMaterial
            color="#7dffe9"
            emissive="#266876"
            emissiveIntensity={1.1}
            roughness={0.15}
            metalness={0.6}
            distort={0.36}
            speed={paused ? 0 : 2.2}
          />
        </mesh>
      </Float>

      <NeonSwarm paused={paused} />
      <OrbitRings paused={paused} />
      <CameraRig paused={paused} />
    </>
  );
}

const statMatrix = [
  { label: "Coding Track", value: "Candidate Master", sub: "Codeforces title" },
  { label: "Grant", value: "$140K", sub: "Awarded funding" },
  { label: "Patent", value: "1 Filed", sub: "Systems work" },
  { label: "Education", value: "IIT KGP '23", sub: "B.Tech CS" },
  { label: "Experience", value: "Ex-Oracle", sub: "Enterprise systems" },
  { label: "Current Role", value: "Lumora Social", sub: "Backend engineer" },
];

const personalSnapshot = [
  { label: "Chess Focus", value: "Rapid + Blitz", sub: "ratings to be added" },
  { label: "Speedcubing", value: "3x3 Priority", sub: "PB stats coming in" },
  { label: "Origami", value: "Advanced Models", sub: "gallery in progress" },
  { label: "Photo Diary", value: "6 Slots", sub: "images preloaded in /public/photos" },
];

const hobbyBoards = [
  {
    title: "Chess",
    links: [
      { label: "Chess.com", url: "https://www.chess.com/member/preyam2002" },
      { label: "Lichess", url: "https://lichess.org/@/preyam2002" },
    ],
    stats: [
      { metric: "Rapid", value: "TBD" },
      { metric: "Blitz", value: "TBD" },
      { metric: "Puzzles", value: "TBD" },
    ],
  },
  {
    title: "Speedcubing",
    links: [{ label: "WCA Profile", url: "https://www.worldcubeassociation.org/" }],
    stats: [
      { metric: "3x3 Single", value: "TBD" },
      { metric: "3x3 Ao5", value: "TBD" },
      { metric: "Main Event", value: "TBD" },
    ],
  },
  {
    title: "Origami",
    links: [{ label: "Gallery", url: "https://www.instagram.com/" }],
    stats: [
      { metric: "Models Folded", value: "TBD" },
      { metric: "Favorite Style", value: "TBD" },
      { metric: "Complexity", value: "TBD" },
    ],
  },
];

const codingSignals = [
  {
    title: "Competitive Coding",
    lines: ["Codeforces: Candidate Master", "LeetCode: stats pending", "Practice focus: graphs + dp + systems"],
  },
  {
    title: "Production Engineering",
    lines: ["Distributed systems", "API latency optimization", "Release reliability + on-call quality"],
  },
  {
    title: "Stack",
    lines: ["TypeScript, Go, Java", "Kafka, Redis, PostgreSQL", "Kubernetes, Terraform, Next.js"],
  },
];

const professionalHighlights = [
  {
    title: "Distributed Vault Replication",
    role: "Architecture + Reliability",
    stack: "Go · Kafka · PostgreSQL · Kubernetes",
    impact: "99.95% staging reliability and sub-2s p95 synchronization.",
  },
  {
    title: "Real-time Social Platform",
    role: "Backend Performance",
    stack: "TypeScript · Node.js · Redis · WebSockets",
    impact: "Feed p95 improved 420ms -> 180ms while handling event-heavy traffic.",
  },
  {
    title: "Exadata Integration Framework",
    role: "Release Safety",
    stack: "Java · Spring Boot · Oracle DB · Terraform",
    impact: "Onboarding reduced from 2 weeks to 3 days with rollout guardrails.",
  },
];

const professionalTimeline = [
  { period: "2024 - Present", title: "Backend Engineer @ Lumora Social" },
  { period: "2023 - 2024", title: "Software Engineer @ Oracle" },
  { period: "2019 - 2023", title: "B.Tech CS @ IIT Kharagpur" },
];

const photoVault = [
  { title: "Chess Night", path: "/photos/chess-night.svg" },
  { title: "Cube Session", path: "/photos/cubing-desk.svg" },
  { title: "Origami Table", path: "/photos/origami-fold.svg" },
  { title: "Coding Setup", path: "/photos/coding-setup.svg" },
  { title: "Weekend Frame", path: "/photos/weekend.svg" },
  { title: "Street Capture", path: "/photos/city-walk.svg" },
];

const personalFeed = [
  {
    title: "This Week",
    items: ["Chess tactics sessions", "3x3 timed solves", "Origami reference study"],
  },
  {
    title: "Current Focus",
    items: ["Rapid consistency", "Sub-lower solve averages", "Complex crease patterns"],
  },
  {
    title: "Capture Queue",
    items: ["Board setup", "Desk flow", "Fold progress", "Street frames"],
  },
];

export default function Lab3DPage() {
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") {
      return "professional";
    }

    if (window.location.hash === "#personal") {
      return "personal";
    }

    if (window.location.hash === "#professional") {
      return "professional";
    }

    const savedTab = window.localStorage.getItem("lab3d-tab");
    if (savedTab === "professional" || savedTab === "personal") {
      return savedTab;
    }

    return "professional";
  });

  const [scenePaused, setScenePaused] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("lab3d-motion") === "paused";
  });

  useEffect(() => {
    window.localStorage.setItem("lab3d-tab", tab);
    const hash = tab === "personal" ? "#personal" : "#professional";
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [tab]);

  useEffect(() => {
    window.localStorage.setItem("lab3d-motion", scenePaused ? "paused" : "running");
  }, [scenePaused]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable = target?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === "1") {
        setTab("professional");
        return;
      }

      if (event.key === "2") {
        setTab("personal");
        return;
      }

      if (event.key.toLowerCase() === "m") {
        setScenePaused((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const changeTab = (nextTab: TabKey) => {
    if (tab === nextTab) return;
    setTab(nextTab);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const order: TabKey[] = ["professional", "personal"];
    const current = order.indexOf(tab);

    if (event.key === "ArrowRight") {
      event.preventDefault();
      changeTab(order[(current + 1) % order.length]);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      changeTab(order[(current - 1 + order.length) % order.length]);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      changeTab(order[0]);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      changeTab(order[order.length - 1]);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.noise} />
      <div className={styles.overlayTop} />

      <Canvas className={styles.canvas} camera={{ position: [0, 0.4, 8.5], fov: 52 }} dpr={[1, 2]}>
        <Scene3D paused={scenePaused} />
      </Canvas>

      <header className={styles.header}>
        <p className={styles.badge}>LAB / R3F / 3D</p>
        <div className={styles.headerLinks}>
          <Link href="/lab" className={styles.headerLink}>
            CSS 3D Version
          </Link>
          <Link href="/" className={styles.headerLink}>
            Main Portfolio
          </Link>
          <button
            type="button"
            onClick={() => setScenePaused((prev) => !prev)}
            className={`${styles.motionButton} ${scenePaused ? styles.motionButtonPaused : ""}`}
            aria-keyshortcuts="M"
          >
            {scenePaused ? "Resume Motion" : "Pause Motion"}
          </button>
        </div>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}>Experimental Route</p>
        <h1 className={styles.title}>
          Real 3D Canvas.
          <br />
          Heavy Motion UI.
        </h1>
        <p className={styles.subtitle}>
          This variant runs on three.js through react-three-fiber with orbiting geometry, dynamic lighting,
          postural camera drift, and layered interface chrome.
        </p>
        <p className={styles.heroNote}>Use arrow keys on tabs to switch sections quickly.</p>
        <p className={styles.heroNote}>Shortcuts: `1` Professional, `2` Personal, `M` Motion.</p>

        <div className={styles.actionRow}>
          <a href="mailto:preyam2002@gmail.com?subject=Lab%203D%20Route" className={styles.primaryAction}>
            Use This Direction
          </a>
          <Link href="/lab" className={styles.secondaryAction}>
            Compare With /lab
          </Link>
        </div>

        <div className={styles.chips}>
          {["Three.js", "React Three Fiber", "Drei", "Instanced Meshes", "Camera Rig"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className={styles.contentWrap}>
        <div
          className={styles.tabBar}
          role="tablist"
          aria-label="Profile sections"
          onKeyDown={handleTabKeyDown}
        >
          <button
            type="button"
            onClick={() => changeTab("professional")}
            className={`${styles.tabButton} ${tab === "professional" ? styles.tabButtonActive : ""}`}
            role="tab"
            aria-selected={tab === "professional"}
            aria-controls="professional-panel"
            id="professional-tab"
            aria-keyshortcuts="1"
          >
            Professional
          </button>
          <button
            type="button"
            onClick={() => changeTab("personal")}
            className={`${styles.tabButton} ${tab === "personal" ? styles.tabButtonActive : ""}`}
            role="tab"
            aria-selected={tab === "personal"}
            aria-controls="personal-panel"
            id="personal-tab"
            aria-keyshortcuts="2"
          >
            Personal
          </button>
        </div>

        {tab === "professional" ? (
          <div
            className={styles.tabPanel}
            role="tabpanel"
            id="professional-panel"
            aria-labelledby="professional-tab"
          >
            <article className={styles.statsPanel}>
              <p className={styles.panelLabel}>Professional Stats</p>
              <div className={styles.statsGrid}>
                {statMatrix.map((item) => (
                  <div key={item.label} className={styles.statCell}>
                    <p className={styles.statLabel}>{item.label}</p>
                    <p className={styles.statValue}>{item.value}</p>
                    <p className={styles.statSub}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.signalPanel}>
              <p className={styles.panelLabel}>Coding Signal Board</p>
              <div className={styles.signalGrid}>
                {codingSignals.map((signal) => (
                  <div key={signal.title} className={styles.signalCard}>
                    <h3>{signal.title}</h3>
                    <ul>
                      {signal.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.workPanel}>
              <p className={styles.panelLabel}>Selected Professional Highlights</p>
              <div className={styles.workGrid}>
                {professionalHighlights.map((item) => (
                  <div key={item.title} className={styles.workCard}>
                    <h3>{item.title}</h3>
                    <p className={styles.workMeta}>{item.role}</p>
                    <p className={styles.workMeta}>{item.stack}</p>
                    <p className={styles.workImpact}>{item.impact}</p>
                  </div>
                ))}
              </div>
              <ul className={styles.timelineList}>
                {professionalTimeline.map((item) => (
                  <li key={item.title}>
                    <span>{item.period}</span>
                    <strong>{item.title}</strong>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        ) : (
          <div
            className={styles.tabPanel}
            role="tabpanel"
            id="personal-panel"
            aria-labelledby="personal-tab"
          >
            <article className={styles.statsPanel}>
              <p className={styles.panelLabel}>Personal Snapshot</p>
              <div className={styles.statsGrid}>
                {personalSnapshot.map((item) => (
                  <div key={item.label} className={styles.statCell}>
                    <p className={styles.statLabel}>{item.label}</p>
                    <p className={styles.statValue}>{item.value}</p>
                    <p className={styles.statSub}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </article>

            <div className={styles.boardGrid}>
              {hobbyBoards.map((board) => (
                <article key={board.title} className={styles.boardCard}>
                  <p className={styles.panelLabel}>{board.title}</p>

                  <div className={styles.boardLinks}>
                    {board.links.map((link) => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.boardLink}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>

                  <ul className={styles.metricList}>
                    {board.stats.map((item) => (
                      <li key={item.metric}>
                        <span>{item.metric}</span>
                        <strong>{item.value}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <article className={styles.photoPanel}>
              <p className={styles.panelLabel}>Photo Vault</p>
              <div className={styles.photoGrid}>
                {photoVault.map((photo) => (
                  <div key={photo.title} className={styles.photoCard}>
                    <Image
                      className={styles.photoImage}
                      src={photo.path}
                      alt={photo.title}
                      width={1200}
                      height={900}
                      loading="lazy"
                    />
                    <p>{photo.title}</p>
                    <span>{photo.path}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.feedPanel}>
              <p className={styles.panelLabel}>Personal Activity Feed</p>
              <div className={styles.feedGrid}>
                {personalFeed.map((block) => (
                  <div key={block.title} className={styles.feedCard}>
                    <h3>{block.title}</h3>
                    <ul>
                      {block.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
