import { describe, it, expect } from 'vitest';
import { fontFallback } from '../../lib';

describe('fontFallback action', () => {
    it('generates fallback @font-face for Inter/Arial', async () => {
        const result = await fontFallback({ primary: 'Inter', fallback: 'Arial' });

        expect(result.fontFamily).toBe('Inter, "Inter Fallback", Arial');
        expect(result.fontFaces).toMatch(/font-family: "Inter Fallback"/);
        expect(result.fontFaces).toMatch(/src: local\('Arial'\)/);
        expect(result.fontFaces).toMatch(/ascent-override:/);
        expect(result.fontFaces).toMatch(/descent-override:/);
        expect(result.fontFaces).toMatch(/line-gap-override:/);
        expect(result.fontFaces).toMatch(/size-adjust:/);
    });

    it('generates fallback @font-face for Playfair Display/Georgia', async () => {
        const result = await fontFallback({ primary: 'Playfair Display', fallback: 'Georgia' });

        expect(result.fontFamily).toBe('"Playfair Display", "Playfair Display Fallback", Georgia');
        expect(result.fontFaces).toMatch(/font-family: "Playfair Display Fallback"/);
        expect(result.fontFaces).toMatch(/src: local\('Georgia'\)/);
    });

    it('throws for unknown font', async () => {
        await expect(
            fontFallback({ primary: 'NonExistentFont12345', fallback: 'Arial' }),
        ).rejects.toThrow('Font "NonExistentFont12345" not found in @capsizecss/metrics');
    });
});
