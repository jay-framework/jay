import { describe, expect, it } from 'vitest';

import { buildColorItem, buildTypographyItem } from '../lib/add-menu-item-builders.js';
import {
    extractAddMenuItemEditorFields,
    getAddMenuItemPreviewHtml,
    patchAddMenuItem,
} from '../lib/patch-add-menu-item.js';

describe('patch-add-menu-item', () => {
    it('extracts color token value from prompt and presentation', () => {
        const item = buildColorItem('primary', '#2563eb', 'Test Design');
        const fields = extractAddMenuItemEditorFields(item);

        expect(fields.kind).toBe('color');
        expect(fields.tokenName).toBe('primary');
        expect(fields.tokenValue).toBe('#2563eb');
        expect(fields.editable).toBe(true);
    });

    it('patches color value and updates preview html', () => {
        const item = buildColorItem('primary', '#2563eb', 'Test Design');
        const patched = patchAddMenuItem(item, { tokenValue: '#ff0000', title: 'Primary red' });

        expect(patched.title).toBe('Primary red');
        expect(patched.prompt).toEqual(
            'Use color token "primary" with value #ff0000 from DESIGN.md.',
        );
        expect(getAddMenuItemPreviewHtml(patched)).toEqual(
            expect.stringMatching(/background:#ff0000/),
        );
    });

    it('patches typography fields', () => {
        const item = buildTypographyItem(
            'body-md',
            {
                fontFamily: 'Inter',
                fontSize: '1rem',
                fontWeight: '400',
            },
            'Test Design',
        );
        const patched = patchAddMenuItem(item, {
            fontSize: '1.25rem',
            fontWeight: '600',
            fontFamily: 'Georgia',
        });

        expect(patched.prompt).toEqual(
            expect.stringMatching(/Georgia.*1\.25rem.*weight 600/),
        );
    });

    it('marks breakpoint items as read-only', () => {
        const item = buildColorItem('primary', '#000', 'Test Design');
        const breakpointItem = {
            ...item,
            id: 'design-system:breakpoint-mobile',
            prompt: 'Breakpoint mobile from DESIGN.md.',
        };
        const fields = extractAddMenuItemEditorFields(breakpointItem);

        expect(fields.editable).toBe(false);
        expect(fields.readOnlyReason).toEqual(
            expect.stringMatching(/read-only/i),
        );
    });
});
