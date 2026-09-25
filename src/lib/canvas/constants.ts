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

/**
 * Time constant of the eased zoom.
 *
 * Wheel and key zooming move a *target* and let the camera chase it, the way
 * Figma does: a mouse wheel produces coarse steps that would otherwise jump,
 * and a trackpad produces a stream of tiny ones that would otherwise feel
 * gritty. 60ms is short enough to still read as immediate.
 */
export const ZOOM_SMOOTHING_MS = 60;

/**
 * Longest a zoom chase may run before it simply snaps to its target.
 *
 * An exponential approach never *arrives*; without a deadline it would spend a
 * third of a second issuing frames that move the camera by fractions of a
 * pixel. Two-thirds of the way to a deadline like this is already
 * indistinguishable from being there, so the snap is invisible and the canvas
 * stops working the moment the user does.
 */
export const CAMERA_CHASE_MAX_MS = 220;

/** Distance (world units) at which a chasing camera is considered settled. */
export const CAMERA_SETTLE_DISTANCE = 0.4;
export const CAMERA_SETTLE_ZOOM = 0.002;

/** A double tap has to land this soon and this close to the previous tap. */
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_SLOP = 32;

/** Zoom applied by a double tap when zoomed out, and when zoomed in. */
export const DOUBLE_TAP_ZOOM_IN = 1.9;
export const DOUBLE_TAP_ZOOM_OUT = 0.5;
/** Above this zoom, a double tap zooms back out instead of further in. */
export const DOUBLE_TAP_ZOOM_OUT_ABOVE = 1.5;
