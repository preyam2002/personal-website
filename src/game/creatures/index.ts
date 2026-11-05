import type { GameSystemFactory } from "../types";
import { createFishSchools } from "./fishSchools";
import { createMoonJellies } from "./jellies";
import { createManta } from "./manta";
import { createSharks } from "./sharks";
import { createSeaTurtles } from "./turtle";
import { createWhaleShark } from "./whaleShark";
import { createHumpbackWhales } from "./whales";

/** The creature systems of the game world. Each one builds, moves, and removes its animals. */
export const creatureSystems: GameSystemFactory[] = [
  createHumpbackWhales,
  createWhaleShark,
  createSharks,
  createFishSchools,
  createManta,
  createSeaTurtles,
  createMoonJellies,
];
