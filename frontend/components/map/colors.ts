import { Color } from "three";

const TEAL_HUE = 181 / 360;
const GOLDEN = 0.618033988749895;

/**
 * Neighborhood colors: hues step by the golden ratio from the brand teal, so consecutive
 * labels land far apart on the color wheel, and lightness alternates between two levels
 * so even similar hues stay distinguishable on the dark backdrop.
 */
export function clusterPalette(labels: string[]): Map<string, Color> {
  const sorted = [...new Set(labels)].sort();
  return new Map(
    sorted.map((label, i) => [
      label,
      new Color().setHSL((TEAL_HUE + i * GOLDEN) % 1, 0.92, i % 2 === 0 ? 0.52 : 0.72),
    ]),
  );
}
