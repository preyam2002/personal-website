import type { Metadata } from "next";
import OceanExperience from "@/components/OceanExperience";
import styles from "./water.module.css";

export const metadata: Metadata = {
  title: "Preyam Rao | Experience",
  description: "The personal website of Preyam Rao.",
};

const experience = [
  {
    company: "AlphaFi",
    role: "Software Engineer",
    period: "Feb 2026 - Now",
    summary: "I build and audit DeFi systems across Sui Move contracts, protocol infrastructure, and production releases.",
    url: "https://www.linkedin.com/company/alphafisui",
  },
  {
    company: "Stealth",
    role: "Founder",
    period: "Jun 2025 - Jan 2026",
    summary: "I received a $140K grant to build a social platform with SuiNS.",
    url: "https://www.linkedin.com/in/preyam",
  },
  {
    company: "Oracle",
    role: "Software Developer",
    period: "Jul 2023 - Jun 2025",
    summary: "I built cloud services for authentication, FHIR, and cross-region secret replication.",
    url: "https://www.linkedin.com/company/oracle",
  },
  {
    company: "Oracle",
    role: "Software Engineering Intern",
    period: "May 2022 - Jul 2022",
    summary: "I built an Oracle Digital Assistant chatbot that classified requests, retrieved build history and test results, and submitted Jenkins jobs.",
    url: "https://www.linkedin.com/company/oracle",
  },
  {
    company: "Krishi Network",
    role: "Software Engineering Intern",
    period: "Jun 2021 - Jul 2021",
    summary: "I built a multilingual classifier for more than 17,000 farmer questions.",
    url: "https://www.linkedin.com/company/krishi-network",
  },
];

const contactLinks = [
  { label: "GitHub", url: "https://github.com/preyam2002" },
  { label: "LinkedIn", url: "https://www.linkedin.com/in/preyam" },
  { label: "Codeforces", url: "https://codeforces.com/profile/preyam" },
  { label: "Email", url: "mailto:preyam2002@gmail.com" },
];

export default function WaterConcept() {
  return (
    <main className={styles.page} id="water-page">
      <OceanExperience surfaceClassName={styles.surface} stageId="water-page" />

      <nav className={styles.nav} aria-label="Portfolio navigation">
        <a href="#work">Work</a>
        <a href="#contact">Contact</a>
      </nav>

      <section className={`${styles.section} ${styles.hero}`} id="top" aria-labelledby="hero-title">
        <h1 id="hero-title">Preyam Rao</h1>
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
                    <a href={entry.url} target="_blank" rel="noopener noreferrer">
                      {entry.company}
                    </a>
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
              I am Preyam, a software engineer. I build secure financial systems, from
              Sui smart contracts to distributed cloud services.
            </p>
            <p>
              I earned a B.Tech in Electrical Engineering with a minor in Computer
              Science from IIT Kharagpur in 2023. I am also a Codeforces Candidate
              Master.
            </p>
            <p className={styles.aboutPersonal}>
              Outside work, I solve Rubik’s Cubes, fold origami, read, and watch films
              and anime. I study languages, practice piano, play badminton, run, lift
              weights, and swim.
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
