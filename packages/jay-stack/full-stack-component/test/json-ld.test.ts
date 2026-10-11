import { describe, it, expect } from 'vitest';
import { jsonLd } from '../lib/render-results';

describe('jsonLd helper (DL#213)', () => {
    it('builds an application/ld+json script HeadTag', () => {
        const data = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' };
        expect(jsonLd(data)).toEqual({
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: JSON.stringify(data),
        });
    });

    it('does not pre-escape the body (serializer owns breakout safety)', () => {
        const data = { url: 'https://x.com/?a=1&b=2' };
        const tag = jsonLd(data);
        // Raw JSON with the literal & — escaping happens at serialization time.
        expect(tag.children).toBe('{"url":"https://x.com/?a=1&b=2"}');
    });
});
