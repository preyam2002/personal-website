import type { GameSystemFactory } from "../types";
import createKelp from "./kelp";
import createProps from "./props";
import createReef from "./reef";
import createRocks from "./rocks";
import createSeaFloor from "./seafloor";
import createWreck from "./wreck";

/** The static and slow-moving scenery of the game world: reef, kelp, rocks, and the wreck. */
export const environmentSystems: GameSystemFactory[] = [createWreck, createReef, createRocks, createKelp, createSeaFloor, createProps];
