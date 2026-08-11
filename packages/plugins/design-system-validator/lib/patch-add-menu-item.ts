import type { AddMenuItem } from '@jay-framework/plugin-validator';

import {
    buildColorItem,
    buildRoundedItem,
    buildSpacingItem,
    buildTypographyItem,
    type TypographyEdit,
} from './add-menu-item-builders.js';

export type AddMenuItemKind =
    | 'color'
    | 'spacing'
    | 'rounded'
    | 'typography'
    | 'breakpoint'
    | 'animation'
    | 'component'
    | 'unknown';

export type ParsedAddMenuItemId = {
    kind: AddMenuItemKind;
    tokenName: string;
};

export function parseAddMenuItemId(id: string): ParsedAddMenuItemId {
    const match = id.match(/^design-system:(color|spacing|rounded|typography|breakpoint|animation|component)-(.+)$/);
    if (!match) {
        return { kind: 'unknown', tokenName: id };
    }
    return { kind: match[1] as AddMenuItemKind, tokenName: match[2]! };
}

function extractQuotedValue(prompt: string, label: string): string | undefined {
    const pattern = new RegExp(`${label}\\s+"([^"]+)"\\s+with value\\s+(.+?)\\s+from DESIGN\\.md`, 'i');
    const match = prompt.match(pattern);
    if (!match) return undefined;
    return match[2]!.trim().replace(/\.$/, '');
}

function extractTypographyFromPrompt(prompt: string): TypographyEdit {
    const nameMatch = prompt.match(/typography preset "([^"]+)"/i);
    const afterColon = prompt.split(':').slice(1).join(':').replace(/\.\s*$/, '').trim();
    const edit: TypographyEdit = {};

    const fontFamilyMatch = afterColon.match(/([^,]+),\s*[\d.]+(?:px|rem|em)/);
    if (fontFamilyMatch) {
        edit.fontFamily = fontFamilyMatch[1]!.trim();
    }

    const fontSizeMatch = afterColon.match(/([\d.]+(?:px|rem|em|vw|vh|%|clamp\([^)]+\)))/);
    if (fontSizeMatch) {
        edit.fontSize = fontSizeMatch[1]!;
    }

    const weightMatch = afterColon.match(/weight\s+(\d+)/i);
    if (weightMatch) {
        edit.fontWeight = weightMatch[1]!;
    }

    const lineHeightMatch = afterColon.match(/line-height\s+([^,]+)/i);
    if (lineHeightMatch) {
        edit.lineHeight = lineHeightMatch[1]!.trim();
    }

    const letterSpacingMatch = afterColon.match(/letter-spacing\s+([^,]+)/i);
    if (letterSpacingMatch) {
        edit.letterSpacing = letterSpacingMatch[1]!.trim();
    }

    if (!nameMatch && Object.keys(edit).length === 0) {
        return { fontSize: '16px', fontWeight: '400' };
    }

    return edit;
}

export type AddMenuItemEditorFields = {
    kind: AddMenuItemKind;
    tokenName: string;
    title: string;
    tokenValue: string;
    fontSize: string;
    fontWeight: string;
    fontFamily: string;
    editable: boolean;
    readOnlyReason: string;
};

export function extractAddMenuItemEditorFields(item: AddMenuItem): AddMenuItemEditorFields {
    const { kind, tokenName } = parseAddMenuItemId(item.id);
    const base = {
        kind,
        tokenName,
        title: item.title,
        tokenValue: '',
        fontSize: '',
        fontWeight: '',
        fontFamily: '',
        editable: false,
        readOnlyReason: '',
    };

    switch (kind) {
        case 'color':
            return {
                ...base,
                editable: true,
                tokenValue:
                    extractQuotedValue(item.prompt, 'color token') ??
                    extractColorFromPresentation(item) ??
                    '',
            };
        case 'spacing':
            return {
                ...base,
                editable: true,
                tokenValue: extractQuotedValue(item.prompt, 'spacing token') ?? '',
            };
        case 'rounded':
            return {
                ...base,
                editable: true,
                tokenValue: extractQuotedValue(item.prompt, 'border-radius token') ?? '',
            };
        case 'typography': {
            const typography = extractTypographyFromPrompt(item.prompt);
            return {
                ...base,
                editable: true,
                fontFamily: typography.fontFamily ?? '',
                fontSize: typography.fontSize ?? '',
                fontWeight: typography.fontWeight ?? '',
            };
        }
        case 'breakpoint':
        case 'animation':
        case 'component':
            return {
                ...base,
                editable: false,
                readOnlyReason: `${kind} items are read-only here — edit DESIGN.md and regenerate the catalog.`,
            };
        default:
            return {
                ...base,
                editable: false,
                readOnlyReason: 'This item type cannot be edited in the settings panel.',
            };
    }
}

function extractColorFromPresentation(item: AddMenuItem): string | undefined {
    if (item.presentation?.type !== 'html-fragment') return undefined;
    const match = item.presentation.html.match(/background:([^;"]+)/);
    return match?.[1]?.trim();
}

export type AddMenuItemEditorPatch = {
    title?: string;
    tokenValue?: string;
    fontSize?: string;
    fontWeight?: string;
    fontFamily?: string;
};

export function patchAddMenuItem(item: AddMenuItem, patch: AddMenuItemEditorPatch): AddMenuItem {
    const { kind, tokenName } = parseAddMenuItemId(item.id);
    const category = item.category;
    const title = patch.title ?? item.title;

    switch (kind) {
        case 'color': {
            const value = patch.tokenValue ?? extractQuotedValue(item.prompt, 'color token') ?? '';
            const rebuilt = buildColorItem(tokenName, value, category);
            return { ...rebuilt, title };
        }
        case 'spacing': {
            const value = patch.tokenValue ?? extractQuotedValue(item.prompt, 'spacing token') ?? '';
            const rebuilt = buildSpacingItem(tokenName, value, category);
            return { ...rebuilt, title };
        }
        case 'rounded': {
            const value =
                patch.tokenValue ?? extractQuotedValue(item.prompt, 'border-radius token') ?? '';
            const rebuilt = buildRoundedItem(tokenName, value, category);
            return { ...rebuilt, title };
        }
        case 'typography': {
            const current = extractTypographyFromPrompt(item.prompt);
            const rebuilt = buildTypographyItem(
                tokenName,
                {
                    fontFamily: patch.fontFamily ?? current.fontFamily,
                    fontSize: patch.fontSize ?? current.fontSize,
                    fontWeight: patch.fontWeight ?? current.fontWeight,
                    lineHeight: current.lineHeight,
                    letterSpacing: current.letterSpacing,
                },
                category,
            );
            return { ...rebuilt, title };
        }
        default:
            return { ...item, title };
    }
}

export function getAddMenuItemPreviewHtml(item: AddMenuItem): string {
    if (item.presentation?.type === 'html-fragment') {
        return item.presentation.html;
    }
    return '<div style="padding:12px;color:#64748b;font-family:sans-serif;font-size:13px;">No preview for this item.</div>';
}

export function serializeAddMenuCatalogForCompare(items: AddMenuItem[]): string {
    return JSON.stringify(items);
}
