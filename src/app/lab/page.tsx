"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import type { MouseEvent } from "react";
import styles from "./lab.module.css";

const motionBlocks = [
  {
    title: "Depth Through Motion",
    body: "Layered transforms combine with parallax offset to create spatial hierarchy that reacts to pointer movement.",
  },
  {
    title: "Deliberate Visual Weight",
    body: "Large gradients, heavy contrast blocks, and saturated accents turn this page into a statement piece.",
  },
  {
    title: "Performance-Friendly 3D",
    body: "Effects rely on CSS transform, perspective, and opacity rather than heavy runtime scene rendering.",
  },
];

const flipCards = [
  {
    front: "Interaction",
    back: "Nested hover states, spring transitions, and visual depth cues guide user attention.",
  },
  {
    front: "Narrative",
    back: "Each section escalates intensity: hero, systems strip, reveal cards, and strong CTA ending.",
  },
  {
    front: "Identity",
    back: "Bold composition signals confidence and helps your portfolio stand out from minimalist clones.",
  },
  {
    front: "Rhythm",
    back: "Fast accents are balanced by stable content blocks to keep the UI dramatic but readable.",
  },
];

const techRail = [
  "Next.js",
  "Framer Motion",
  "TypeScript",
  "CSS Perspective",
  "Parallax",
  "Grid + Glow",
  "Transform 3D",
  "Micro-Physics",
  "Pointer Reactivity",
];

export default function LabPage() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x, y });
  };

  const handleLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  return (
    <main className={styles.page}>
      <div className={styles.auroraA} />
      <div className={styles.auroraB} />
      <div className={styles.gridGlow} />

      <header className={styles.topBar}>
        <p className={styles.signature}>UI LAB / VERSION 02</p>
        <div className={styles.topLinks}>
          <Link href="/lab-3d" className={styles.ghostLink}>
            WebGL 3D Route
          </Link>
          <Link href="/" className={styles.ghostLink}>
            Main Portfolio
          </Link>
          <a href="mailto:preyam2002@gmail.com" className={styles.ghostLink}>
            Contact
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Experimental Route</p>
          <h1 className={styles.title}>
            Heavy UI
            <br />
            with 3D motion.
          </h1>
          <p className={styles.subtitle}>
            This page is intentionally maximal: layered depth, dramatic color, motion-driven hierarchy, and interaction-first layout.
          </p>
          <div className={styles.ctaRow}>
            <Link href="/" className={styles.primaryButton}>
              Back to Main Site
            </Link>
            <a href="#systems" className={styles.secondaryButton}>
              Explore Effects
            </a>
          </div>
        </div>

        <motion.div
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          animate={{
            rotateX: -tilt.y * 16,
            rotateY: tilt.x * 22,
          }}
          transition={{ type: "spring", stiffness: 140, damping: 16, mass: 0.8 }}
          className={styles.depthPanel}
        >
          <div className={styles.depthLayerTop}>
            <span className={styles.pill}>Interactive Plane</span>
            <h2>3D Interface Stack</h2>
          </div>
          <div className={styles.depthLayerMiddle}>
            <p>Pointer-aware transformation</p>
            <p>Animated scanline overlays</p>
            <p>High-contrast glass + glow</p>
          </div>
          <div className={styles.depthLayerBottom}>
            <span>Latency: smooth</span>
            <span>Composition: bold</span>
          </div>
        </motion.div>
      </section>

      <section id="systems" className={styles.band}>
        <div className={styles.marqueeWrap}>
          <div className={styles.marqueeTrack}>
            {[...techRail, ...techRail].map((item, index) => (
              <span key={`${item}-${index}`} className={styles.marqueeItem}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.motionGrid}>
        {motionBlocks.map((block, index) => (
          <motion.article
            key={block.title}
            className={styles.motionCard}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: index * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -8, rotateX: 4, rotateY: -4 }}
          >
            <div className={styles.cardOrb} />
            <h3>{block.title}</h3>
            <p>{block.body}</p>
          </motion.article>
        ))}
      </section>

      <section className={styles.flipSection}>
        <p className={styles.sectionLabel}>3D FLIP SYSTEM</p>
        <div className={styles.flipGrid}>
          {flipCards.map((card) => (
            <article key={card.front} className={styles.flipCard}>
              <div className={styles.flipInner}>
                <div className={styles.flipFront}>
                  <p>{card.front}</p>
                </div>
                <div className={styles.flipBack}>
                  <p>{card.back}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p>Want this style adapted into your real portfolio sections?</p>
        <a href="mailto:preyam2002@gmail.com?subject=UI%20Lab%20Version%202" className={styles.primaryButton}>
          Build This Into Production
        </a>
      </section>
    </main>
  );
}
