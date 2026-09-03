// @vitest-environment node
// Ryan's SVG renderer: regression tests for eye placement.
// The eyes used to ignore their x/y arguments and render at the SVG origin (0,0),
// on top of the hair. They must land on the face instead.
import { describe, it, expect } from 'vitest';
import { renderRyanSVG } from '../src/ui/ryanView.js';
import { buildSpec } from '../src/core/ryanSpec.js';
import { defaultState } from '../src/core/save.js';

// One weight per physique tier (1-5).
const WEIGHTS = [1.0, 1.25, 1.6, 2.0, 3.0];

const EYE_RE = /<g class="eye (left|right)-eye" transform="translate\(([-\d.]+), ([-\d.]+)\)">/g;

function eyePositions(spec) {
  const html = renderRyanSVG(spec);
  const out = {};
  for (const m of html.matchAll(EYE_RE)) out[m[1]] = { x: Number(m[2]), y: Number(m[3]) };
  return out;
}

describe('ryanView.renderRyanSVG eyes', () => {
  it('renders both eyes on the face for every physique tier', () => {
    for (const weight of WEIGHTS) {
      const s = defaultState();
      s.stats.weight = weight;
      const spec = buildSpec(s);
      const eyes = eyePositions(spec);

      expect(eyes.left, `tier ${spec.tier}: left eye group`).toBeTruthy();
      expect(eyes.right, `tier ${spec.tier}: right eye group`).toBeTruthy();

      // Regression: eyes used to ignore x/y and render at the origin.
      expect(eyes.left.x, `tier ${spec.tier}: left eye x`).toBeGreaterThan(10);
      expect(eyes.right.x, `tier ${spec.tier}: right eye x`).toBeGreaterThan(eyes.left.x);

      // Both eyes sit on the same eye line, inside the face rect.
      const jawW = Math.round(60 * spec.physique.jaw);
      const faceX = 50 - jawW / 2;
      expect(eyes.left.y).toBe(44);
      expect(eyes.right.y).toBe(44);
      expect(eyes.left.x).toBeGreaterThanOrEqual(faceX);
      expect(eyes.right.x + 12).toBeLessThanOrEqual(faceX + jawW);
    }
  });

  it('anchors the default tier eye positions (regression)', () => {
    const s = defaultState(); // weight 1.0 -> tier 1
    const eyes = eyePositions(buildSpec(s));
    expect(eyes.left).toEqual({ x: 35, y: 44 });
    expect(eyes.right).toEqual({ x: 53, y: 44 });
  });
});