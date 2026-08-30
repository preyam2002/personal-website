import type { Metadata } from "next";
import Link from "next/link";
import OceanExperience from "@/components/OceanExperience";
import styles from "./water.module.css";

export const metadata: Metadata = {
  title: "Ocean study | Preyam Rao",
  description: "A physical ocean portfolio for Preyam Rao.",
};

const projects = [
  {
    title: "Aletheia",
    category: "Prediction markets",
    url: "https://github.com/preyam2002/Aletheia",
  },
  {
    title: "VibeShield",
    category: "Offensive security",
    url: "https://github.com/preyam2002/vibeshield",
  },
  {
    title: "HFT engine",
    category: "Low-latency systems",
    url: "https://github.com/preyam2002/HFT-system",
  },
];

export default function WaterConcept() {
  return (
    <main className={styles.page} id="water-page">
      <OceanExperience surfaceClassName={styles.surface} stageId="water-page" />

      <section className={`${styles.section} ${styles.hero}`} id="top">
        <header className={styles.nav}>
          <Link href="/" className={styles.mark} aria-label="Return to the main portfolio">
            PR <span>/</span>
          </Link>
          <nav aria-label="Ocean portfolio navigation">
            <a href="#work">Work</a>
            <a href="#contact">Contact</a>
          </nav>
        </header>

        <div className={styles.heroCopy}>
          <p>Systems engineer</p>
          <h1>Preyam Rao</h1>
          <span>I build markets, protocols, and security systems.</span>
        </div>
      </section>

      <section className={`${styles.section} ${styles.work}`} id="work" aria-labelledby="work-title">
        <div className={styles.workContent}>
          <h2 id="work-title">Selected systems</h2>
          <div className={styles.projects}>
            {projects.map((project) => (
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                key={project.title}
              >
                <strong>{project.title}</strong>
                <span>{project.category}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.contact}`} id="contact" aria-labelledby="contact-title">
        <div className={styles.contactCopy}>
          <h2 id="contact-title">Build something difficult.</h2>
          <a href="mailto:preyam2002@gmail.com">preyam2002@gmail.com</a>
        </div>

        <footer className={styles.footer}>
          <a href="https://github.com/preyam2002" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href="https://linkedin.com/in/preyam" target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
        </footer>
      </section>
    </main>
  );
}
