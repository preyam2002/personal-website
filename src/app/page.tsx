import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { About } from "@/components/about";
import { Projects } from "@/components/projects";
import { Personal } from "@/components/personal";
import { Contact } from "@/components/contact";
import { Footer } from "@/components/footer";
import { ScrollProgress } from "@/components/scroll-progress";
import { CursorGlow } from "@/components/cursor-glow";
import { BackToTop } from "@/components/back-to-top";
import { PageTransition } from "@/components/page-transition";

export default function Home() {
  return (
    <>
      <PageTransition />
      <ScrollProgress />
      <CursorGlow />
      <Nav />
      <main className="flex-1 px-6 md:px-12 lg:px-20 max-w-5xl mx-auto w-full relative">
        <Hero />
        <About />
        <Projects />
        <Personal />
        <Contact />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
