import type { Viewport } from "@/lib/domain/types";

import { GRID_DOT_RADIUS, GRID_STEP } from "./constants";

/**
 * The canvas backdrop is drawn in *screen* space (so dots stay crisp) while its
 * spacing follows the world grid (so it feels attached to the content).
 *
 * Two details make it feel like Figma rather than a texture:
 *  - the effective step doubles whenever the on-screen spacing would fall below
 *    `minScreenStep`, so zooming out never turns the canvas into grey noise, and
 *  - dot opacity fades toward the zoom extremes, so the grid whispers at 20%
 *    and steps forward only when the user is close enough to work.
 */

export interface GridStyle {
  /** On-screen distance between dots, in CSS pixels. */
  step: number;
  /** Dot radius in CSS pixels. */
  radius: number;
  /** 0..1 opacity for the dot layer. */
  opacity: number;
  /** Background position so dots stay locked to the world origin. */
  offsetX: number;
  offsetY: number;
}

export interface GridOptions {
  baseStep?: number;
  baseRadius?: number;
  /** User preference multiplier, 0 - 1.5. */
  contrast?: number;
  /** Below this on-screen spacing, the step is doubled. */
  minScreenStep?: number;
}

export function gridStyle(viewport: Viewport, options: GridOptions = {}): GridStyle {
  const baseStep = options.baseStep ?? GRID_STEP;
  const baseRadius = options.baseRadius ?? GRID_DOT_RADIUS;
  const contrast = options.contrast ?? 1;
  const minScreenStep = options.minScreenStep ?? 14;

  let multiplier = 1;
  let step = baseStep * viewport.zoom;
  while (step < minScreenStep && multiplier < 64) {
    multiplier *= 2;
    step = baseStep * multiplier * viewport.zoom;
  }

  // Fade in as spacing approaches the comfortable range, fade out when so far
  // out that the grid is more clutter than guide.
  const spacingFade = Math.min(1, Math.max(0.25, (step - minScreenStep) / (minScreenStep * 1.6)));
  const zoomFade = viewport.zoom < 0.3 ? Math.max(0.22, viewport.zoom / 0.3) : 1;
  const zoomCeiling = viewport.zoom > 1.6 ? Math.max(0.55, 1 - (viewport.zoom - 1.6) * 0.35) : 1;

  const opacity = Math.min(0.9, Math.max(0.1, 0.4 * spacingFade * zoomFade * zoomCeiling * contrast));

  const worldStep = multiplier;
  const offsetX = -((viewport.x * viewport.zoom) % (baseStep * worldStep));
  const offsetY = -((viewport.y * viewport.zoom) % (baseStep * worldStep));

  return {
    step: baseStep * worldStep * viewport.zoom,
    radius: baseRadius * Math.min(1.4, Math.max(0.85, viewport.zoom)),
    opacity,
    offsetX,
    offsetY,
  };
}

export function gridBackgroundImage(color: string, style: GridStyle): string {
  return `radial-gradient(circle at center, ${color} ${Math.max(0.6, style.radius)}px, transparent ${Math.max(0.6, style.radius)}px)`;
}
