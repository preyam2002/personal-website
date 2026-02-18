"use client";

import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="min-h-svh flex flex-col justify-center">
      <div className="container">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="text-[clamp(2.5rem,9vw,8rem)] font-serif leading-[0.95] tracking-tight text-neutral-900 max-w-5xl"
        >
          In a world of
          <br />
          complex systems,
          <br />
          <span className="text-neutral-300">I build clarity.</span>
        </motion.h1>
      </div>
    </section>
  );
}
