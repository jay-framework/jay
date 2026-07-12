import { describe, it, expect } from 'vitest';
import {
    matchColor,
    matchSpacing,
    matchRounded,
    matchTypographyProperty,
    matchAnimationDuration,
    matchAnimationEasing,
    matchComponent,
    hexToRgbValues,
    relativeLuminance,
    contrastRatio,
    extractBackgroundColors,
} from '../lib/token-matcher.js';

const colors = {
    primary: '#2563eb',
    error: '#dc2626',
    background: '#ffffff',
    text: '#0f172a',
};

const spacing = { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem' };
const rounded = { sm: '0.25rem', md: '0.5rem', full: '9999px' };
const typography = {
    'headline-lg': { fontFamily: 'Inter', fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.2 },
    'body-md': { fontFamily: 'Inter', fontSize: '1rem', fontWeight: 400, lineHeight: 1.6 },
};

describe('matchColor', () => {
    it('matches a token color', () => {
        expect(matchColor('#2563eb', colors).matches).toEqual(true);
    });

    it('matches case-insensitively', () => {
        expect(matchColor('#2563EB', colors).matches).toEqual(true);
    });

    it('rejects an unknown color with suggestion', () => {
        const result = matchColor('#ff0000', colors);
        expect(result.matches).toEqual(false);
        expect(result.suggestion).toBeDefined();
    });

    it('allows var() references', () => {
        expect(matchColor('var(--color-primary)', colors).matches).toEqual(true);
    });

    it('allows transparent', () => {
        expect(matchColor('transparent', colors).matches).toEqual(true);
    });

    it('allows inherit', () => {
        expect(matchColor('inherit', colors).matches).toEqual(true);
    });

    it('matches rgb() format', () => {
        expect(matchColor('rgb(37, 99, 235)', colors).matches).toEqual(true);
    });

    it('rejects unknown rgb()', () => {
        expect(matchColor('rgb(255, 0, 0)', colors).matches).toEqual(false);
    });

    it('normalizes 3-digit hex', () => {
        expect(matchColor('#fff', { white: '#ffffff' }).matches).toEqual(true);
    });
});

describe('matchSpacing', () => {
    it('matches a scale value', () => {
        expect(matchSpacing('1rem', spacing).matches).toEqual(true);
    });

    it('rejects off-scale value', () => {
        const result = matchSpacing('13px', spacing);
        expect(result.matches).toEqual(false);
        expect(result.suggestion).toBeDefined();
    });

    it('allows 0', () => {
        expect(matchSpacing('0', spacing).matches).toEqual(true);
    });

    it('allows auto', () => {
        expect(matchSpacing('auto', spacing).matches).toEqual(true);
    });

    it('allows var()', () => {
        expect(matchSpacing('var(--spacing-md)', spacing).matches).toEqual(true);
    });

    it('handles multi-value shorthand', () => {
        expect(matchSpacing('0.5rem 1rem', spacing).matches).toEqual(true);
    });

    it('rejects shorthand with one bad value', () => {
        expect(matchSpacing('0.5rem 13px', spacing).matches).toEqual(false);
    });
});

describe('matchRounded', () => {
    it('matches a scale value', () => {
        expect(matchRounded('0.5rem', rounded).matches).toEqual(true);
    });

    it('rejects off-scale value', () => {
        expect(matchRounded('10px', rounded).matches).toEqual(false);
    });

    it('allows 0', () => {
        expect(matchRounded('0', rounded).matches).toEqual(true);
    });
});

describe('matchTypographyProperty', () => {
    it('matches a known font-size', () => {
        expect(matchTypographyProperty('font-size', '2.5rem', typography).matches).toEqual(true);
    });

    it('rejects unknown font-size', () => {
        expect(matchTypographyProperty('font-size', '3rem', typography).matches).toEqual(false);
    });

    it('matches font-weight', () => {
        expect(matchTypographyProperty('font-weight', '700', typography).matches).toEqual(true);
    });

    it('allows inherit', () => {
        expect(matchTypographyProperty('font-size', 'inherit', typography).matches).toEqual(true);
    });

    it('matches font-family ignoring quotes', () => {
        expect(
            matchTypographyProperty('font-family', '"Inter", sans-serif', typography).matches,
        ).toEqual(true);
    });
});

const animations = {
    'fade-in': { duration: '300ms', easing: 'cubic-bezier(0, 0, 0.2, 1)' },
    micro: { duration: '150ms', easing: 'ease-in-out' },
};

describe('matchAnimationDuration', () => {
    it('matches a preset duration', () => {
        expect(matchAnimationDuration('300ms', animations).matches).toEqual(true);
    });

    it('rejects unknown duration', () => {
        const result = matchAnimationDuration('200ms', animations);
        expect(result.matches).toEqual(false);
        expect(result.suggestion).toMatch(/fade-in.*300ms/);
    });

    it('allows 0s', () => {
        expect(matchAnimationDuration('0s', animations).matches).toEqual(true);
    });

    it('allows var()', () => {
        expect(matchAnimationDuration('var(--duration)', animations).matches).toEqual(true);
    });
});

describe('matchAnimationEasing', () => {
    it('matches a preset easing', () => {
        expect(matchAnimationEasing('ease-in-out', animations).matches).toEqual(true);
    });

    it('matches cubic-bezier with whitespace differences', () => {
        expect(matchAnimationEasing('cubic-bezier(0,0,0.2,1)', animations).matches).toEqual(true);
    });

    it('rejects unknown easing', () => {
        const result = matchAnimationEasing('ease', animations);
        expect(result.matches).toEqual(false);
        expect(result.suggestion).toBeDefined();
    });

    it('allows inherit', () => {
        expect(matchAnimationEasing('inherit', animations).matches).toEqual(true);
    });
});

describe('matchComponent', () => {
    it('passes when styles match spec', () => {
        const styles = { 'background-color': '#2563eb', color: '#ffffff' };
        const spec = { backgroundColor: '#2563eb', textColor: '#ffffff' };
        const results = matchComponent(styles, spec, 'button-primary');
        expect(results.every((r) => r.matches)).toEqual(true);
    });

    it('fails when a property mismatches', () => {
        const styles = { 'background-color': '#ff0000', color: '#ffffff' };
        const spec = { backgroundColor: '#2563eb', textColor: '#ffffff' };
        const results = matchComponent(styles, spec, 'button-primary');
        expect(results.some((r) => !r.matches)).toEqual(true);
    });
});

describe('contrast utilities', () => {
    it('computes RGB from hex', () => {
        expect(hexToRgbValues('#ffffff')).toEqual([255, 255, 255]);
        expect(hexToRgbValues('#000000')).toEqual([0, 0, 0]);
    });

    it('computes relative luminance', () => {
        expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 2);
        expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0.0, 2);
    });

    it('computes contrast ratio', () => {
        const white = relativeLuminance(255, 255, 255);
        const black = relativeLuminance(0, 0, 0);
        expect(contrastRatio(white, black)).toBeCloseTo(21, 0);
    });
});

describe('extractBackgroundColors', () => {
    it('extracts plain hex color', () => {
        expect(extractBackgroundColors('#0f172a')).toEqual(['#0f172a']);
    });

    it('extracts fallback color after gradient', () => {
        expect(
            extractBackgroundColors(
                'linear-gradient(180deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.4) 100%), #0f172a',
            ),
        ).toEqual(['#0f172a']);
    });

    it('extracts fallback color after multiple gradients', () => {
        expect(
            extractBackgroundColors(
                'radial-gradient(circle at 20% 30%, #4f46e5 0%, transparent 40%), radial-gradient(circle at 80% 20%, #db2777 0%, transparent 45%), #0f172a',
            ),
        ).toEqual(['#0f172a']);
    });

    it('returns empty for gradient-only background', () => {
        expect(extractBackgroundColors('linear-gradient(135deg, #111 0%, #222 100%)')).toEqual([]);
    });

    it('returns empty for url background', () => {
        expect(extractBackgroundColors("url('img.jpg') center/cover no-repeat")).toEqual([]);
    });

    it('extracts color from color + url layer', () => {
        expect(extractBackgroundColors("#fff url('image.jpg')")).toEqual(['#fff']);
    });

    it('returns empty for var()', () => {
        expect(extractBackgroundColors('var(--bg-primary)')).toEqual([]);
    });

    it('returns empty for transparent', () => {
        expect(extractBackgroundColors('transparent')).toEqual([]);
    });

    it('returns empty for none', () => {
        expect(extractBackgroundColors('none')).toEqual([]);
    });
});
