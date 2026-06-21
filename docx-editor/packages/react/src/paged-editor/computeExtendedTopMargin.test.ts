import { describe, expect, it } from 'bun:test';

import { computeExtendedTopMargin } from './PagedEditor';

// twips → px at 96 DPI, matching the editor's twipsToPixels.
const tw = (t: number) => (t / 20) * (96 / 72);

describe('computeExtendedTopMargin', () => {
  describe('positive top margin (must be a no-op vs. the original push)', () => {
    // Original behavior: out.top = max(marginTop, headerDistance + headerContentHeight).
    const original = (mt: number, hd: number, hch: number) => Math.max(mt, hd + hch);

    const cases: Array<[number, number, number]> = [
      [96, 48, 0], // default-ish, empty header
      [96, 48, 80], // tall header pushes body below marginTop
      [120, 48, 30], // marginTop is the floor
      [0, 48, 40], // zero top margin
      [48.4, 48.4, 34.18], // medical's header geometry but with a 0-clamped... (positive mt)
    ];

    for (const [mt, hd, hch] of cases) {
      it(`marginTop=${mt} matches the original formula`, () => {
        expect(computeExtendedTopMargin(mt, hd, hch)).toBeCloseTo(original(mt, hd, hch), 6);
      });
    }
  });

  describe('negative top margin (header overlaps body)', () => {
    it('reduces the push by the negative margin amount', () => {
      // medical-incident-form: w:pgMar w:top="-270", header="726".
      const marginTop = tw(-270); // -18px
      const headerDistance = tw(726); // 48.4px
      const headerContentHeight = 34.18; // two empty header paragraphs

      const top = computeExtendedTopMargin(marginTop, headerDistance, headerContentHeight);

      // Old (buggy) behavior would have been headerDistance + headerContentHeight
      // (~82.6px), pushing the body too low. The negative margin pulls it back up
      // by |marginTop| (18px) → ~64.6px.
      const expected = headerDistance + headerContentHeight + marginTop;
      expect(top).toBeCloseTo(expected, 6);
      expect(top).toBeLessThan(headerDistance + headerContentHeight);
    });

    it('never pulls the body above the page edge (clamped to >= marginTop)', () => {
      // A large negative margin should not produce a negative body top below the
      // authored marginTop floor, and the clear position is clamped to >= 0.
      const marginTop = -200;
      const top = computeExtendedTopMargin(marginTop, 48, 30);
      // headerDistance+hch+marginTop = -122 → clamped to 0; max(marginTop, 0) = 0.
      expect(top).toBe(0);
    });
  });
});
