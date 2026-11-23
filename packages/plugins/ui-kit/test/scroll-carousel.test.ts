import { afterEach, describe, it, expect, vi } from 'vitest';
import { scrollCarouselBy } from '../lib/scroll-carousel';

function stubReducedMotion(matches: boolean) {
    const matchMedia = vi.fn((query: string) => ({ matches, media: query }));
    vi.stubGlobal('matchMedia', matchMedia);
    return matchMedia;
}

function fakeTrack() {
    return { clientWidth: 300, scrollBy: vi.fn() };
}

describe('scrollCarouselBy (DL#238)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it("should scroll with behavior 'instant' when reduced motion is preferred", () => {
        const matchMedia = stubReducedMotion(true);
        const el = fakeTrack();
        scrollCarouselBy(el as unknown as HTMLElement, 1);
        scrollCarouselBy(el as unknown as HTMLElement, -1);
        expect(el.scrollBy.mock.calls).toEqual([
            [{ left: 300, behavior: 'instant' }],
            [{ left: -300, behavior: 'instant' }],
        ]);
        expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });

    it('should scroll smoothly when no reduced-motion preference', () => {
        stubReducedMotion(false);
        const el = fakeTrack();
        scrollCarouselBy(el as unknown as HTMLElement, 1);
        expect(el.scrollBy.mock.calls).toEqual([[{ left: 300, behavior: 'smooth' }]]);
    });
});
