import Image from "next/image";
import Link from "next/link";
import waterStyles from "../water.module.css";
import type { Composition } from "./compositions";
import styles from "./compositions.module.css";

export default function CompositionPreview({ composition }: { composition: Composition }) {
  return (
    <main className={`${waterStyles.page} ${styles.scenePreview}`}>
      <picture className={`${waterStyles.surface} ${waterStyles.poster}`}>
        <source media="(max-width: 760px)" srcSet={`/water/compositions/${composition.slug}-scene-mobile.webp`} />
        <Image src={`/water/compositions/${composition.slug}-scene.webp`} alt="" width={1440} height={900} unoptimized loading="eager" />
      </picture>
      <nav className={waterStyles.nav} aria-label="Portfolio navigation">
        <Link href="/#work" prefetch={false}>Work</Link>
        <Link href="/#contact" prefetch={false}>Contact</Link>
      </nav>
      <section className={`${waterStyles.section} ${waterStyles.hero}`} id="top" aria-labelledby="hero-title">
        <h1 id="hero-title">Preyam Rao</h1>
      </section>
    </main>
  );
}
