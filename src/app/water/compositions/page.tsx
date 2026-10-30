import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { compositions } from "./compositions";
import styles from "./compositions.module.css";

export const metadata: Metadata = {
  title: "Water and sky compositions | Preyam Rao",
  description: "Six views of the ocean with different horizon heights and perspectives.",
  robots: { index: false, follow: false },
};

export default function CompositionsPage() {
  return (
    <main className={styles.gallery}>
      <header className={styles.galleryHeader}>
        <Link href="/">Preyam Rao</Link>
        <span>Water and sky / 01–06</span>
      </header>
      <div className={styles.galleryIntro}>
        <h1>Water and sky.<br />Six compositions.</h1>
        <p>Different horizon heights and viewpoints. Each preview shows a still frame from the ocean renderer, with the same text and layout.</p>
      </div>
      <ol className={styles.galleryGrid}>
        {compositions.map((composition) => (
          <li key={composition.slug}>
            <Link href={`/water/compositions/${composition.slug}`} className={styles.galleryLink}>
              <Image src={`/water/compositions/${composition.slug}.webp`} alt={`${composition.name} first screen`} width={1440} height={900} unoptimized />
              <div><h2><span>{composition.number}</span>{composition.name}</h2><ArrowUpRight size={24} aria-hidden="true" /></div>
              <p>{composition.description}</p>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
