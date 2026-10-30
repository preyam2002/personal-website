import type { Metadata } from "next";
import Image from "next/image";
import OceanExperience from "@/components/OceanExperience";
import styles from "./water/water.module.css";

export const metadata: Metadata = {
  title: "Preyam Rao",
  description: "The personal website of Preyam Rao.",
  alternates: { canonical: "/" },
};

const experience = [
  {
    company: "o1.exchange",
    role: "Software Engineer",
    period: "Sep 2026 - Now",
    summary: "I work on an onchain platform for token launches, swaps, and trading.",
    url: "https://o1.exchange",
  },
  {
    company: "AlphaFi",
    role: "Software Engineer",
    period: "Mar 2026 - Sep 2026",
    summary: "I built and maintained a lending protocol with about $54M TVL along with a proprietary DLMM.",
    url: "https://alphafi.xyz/",
  },
  {
    company: "Stealth",
    role: "Founder",
    period: "Jun 2025 - Jan 2026",
    summary: "I received a $140K grant to build a social platform with SuiNS.",
    url: null,
  },
  {
    company: "Oracle",
    role: "Software Developer",
    period: "Jul 2023 - Jun 2025",
    summary: "I worked on Oracle Integration Cloud, maintained backend microservices, and filed a patent for cross-region secret replication.",
    url: "https://www.oracle.com/",
  },
];

const contactLinks = [
  { label: "GitHub", url: "https://github.com/preyam2002" },
  { label: "LinkedIn", url: "https://www.linkedin.com/in/preyam" },
  { label: "Codeforces", url: "https://codeforces.com/profile/preyam" },
  { label: "Letterboxd", url: "https://letterboxd.com/preyam/" },
  { label: "MyAnimeList", url: "https://myanimelist.net/profile/preyam" },
  { label: "Goodreads", url: "https://www.goodreads.com/user/show/44002045-preyam-rao" },
  { label: "Email", url: "mailto:preyam2002@gmail.com" },
];

export default function Home() {
  const fallback = (
    <picture className={`${styles.surface} ${styles.poster}`}>
      <source media="(max-width: 760px)" srcSet="/water/ocean-poster-small.webp" />
      <Image
        src="/water/ocean-poster.webp"
        alt=""
        width={1440}
        height={900}
        unoptimized
        loading="eager"
      />
    </picture>
  );
  return (
    <main className={styles.page} id="water-page">
      <noscript>{fallback}</noscript>
      <OceanExperience surfaceClassName={styles.surface} stageId="water-page" fallback={fallback} />

      <nav className={styles.nav} aria-label="Portfolio navigation">
        <a href="#work">Work</a>
        <a href="#contact">Contact</a>
      </nav>

      <section className={`${styles.section} ${styles.hero}`} id="top" aria-labelledby="hero-title">
        <h1 id="hero-title">Preyam Rao</h1>
        <a className={styles.scrollCue} href="#work">
          Scroll to explore <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section className={`${styles.section} ${styles.work}`} id="work" aria-labelledby="work-title">
        <div className={styles.workContent}>
          <header className={styles.workHeader}>
            <h2 id="work-title">Experience</h2>
          </header>

          <ol className={styles.experience}>
            {experience.map((entry) => (
              <li key={`${entry.company}-${entry.role}`}>
                <div className={styles.position}>
                  <h3>
                    {entry.url ? (
                      <a href={entry.url} target="_blank" rel="noopener noreferrer">
                        {entry.company}
                      </a>
                    ) : entry.company}
                  </h3>
                  <span>{entry.role}</span>
                </div>
                <p>{entry.summary}</p>
                <time>{entry.period}</time>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.section} ${styles.about}`} id="contact" aria-labelledby="about-title">
        <div className={styles.aboutContent}>
          <h2 id="about-title">About</h2>
          <div className={styles.aboutCopy}>
            <p>
              I am Preyam, a software engineer based in Bangalore. I build backend
              systems and full-stack products.
            </p>
            <p>
              I now focus on Web3. I write smart contracts and design financial
              systems that treat money as a programmable object. Outside work, I
              solve Rubik’s Cubes, fold origami, learn languages, practice piano,
              play badminton, run, lift weights, and swim.
            </p>
          </div>

          <nav className={styles.contactLinks} aria-label="Contact and profile links">
            {contactLinks.map((link) => {
              const external = link.url.startsWith("https://");
              return (
                <a
                  href={link.url}
                  key={link.label}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>
        </div>
      </section>
    </main>
  );
}
