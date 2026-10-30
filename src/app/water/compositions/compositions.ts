export const compositions = [
  { slug: "current", name: "Current", number: "01", horizon: (1 + 2.7 * (-1.8 / 6.9)) / 2, cameraHeight: 3.6, description: "About 15% sky and 85% water. The current view." },
  { slug: "one-third-sky", name: "One-third sky", number: "02", horizon: 1 / 3, cameraHeight: 3.6, description: "The horizon sits one-third of the way down the screen." },
  { slug: "balanced", name: "Balanced", number: "03", horizon: 0.5, cameraHeight: 3.6, description: "The horizon divides the sky and water equally." },
  { slug: "more-sky", name: "More sky", number: "04", horizon: 0.65, cameraHeight: 3.6, description: "About 65% sky and 35% water. The horizon sits lower." },
  { slug: "close-to-water", name: "Close to the water", number: "05", horizon: 1 / 3, cameraHeight: 1.2, description: "One-third sky, with the viewpoint close to the waves." },
  { slug: "higher-view", name: "Higher view", number: "06", horizon: 1 / 3, cameraHeight: 8, description: "One-third sky, with a higher viewpoint over the water." },
] as const;

export type Composition = (typeof compositions)[number];
