import { registerLayoutEngine } from "./engine";
import { generationsLayoutEngine } from "./layered";
import { radialLayoutEngine } from "./radial";

/**
 * Importing this module registers the available engines. The UI only ever
 * talks to `getLayoutEngine(id)`, so adding a new algorithm is a one-line
 * change here.
 */
registerLayoutEngine(generationsLayoutEngine);
registerLayoutEngine(radialLayoutEngine);

export { GENERATIONS_ENGINE_ID, RADIAL_ENGINE_ID } from "./ids";
export {
  getLayoutEngine,
  listLayoutEngines,
  registerLayoutEngine,
  type LayoutEngine,
  type LayoutOptions,
  type LayoutRequest,
  type LayoutResult,
} from "./engine";
export { assignGenerations, coupleGroups } from "./generations";
export { computeLayeredLayout } from "./layered";
export { computeRadialLayout } from "./radial";
