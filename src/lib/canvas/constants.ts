/**
 * Canvas geometry constants. Kept in one module so the layout engine, the node
 * renderer and the minimap cannot drift apart.
 */

export const NODE_WIDTH = 236;
export const NODE_HEIGHT = 92;

/** Horizontal gap between unrelated people in the same generation. */
export const NODE_GAP_X = 52;
/** Horizontal gap between two people recorded as a couple. */
export const COUPLE_GAP_X = 30;
/** Vertical distance between the tops of consecutive generations. */
export const GENERATION_GAP_Y = 196;

/** Size of the "+ add first person" ghost node. */
export const GHOST_NODE_SIZE = 148;

/** Distance between dots in the canvas backdrop, at 100% zoom. */
export const GRID_STEP = 26;
export const GRID_DOT_RADIUS = 1.15;

/** Where layouts start before being re-centred on the origin. */
export const LAYOUT_ORIGIN_X = 0;
export const LAYOUT_ORIGIN_Y = 0;

/** Gap between separate family clusters placed side by side. */
export const COMPONENT_GAP_X = 180;

/** Manual drag snapping step (multiple of the dot grid). */
export const SNAP_STEP = GRID_STEP / 2;

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;

/** Chosen so a single click of the zoom buttons moves ~20%. */
export const ZOOM_STEP_FACTOR = 1.2;

export const CAMERA_ANIMATION_MS = 320;
