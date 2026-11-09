import fs from 'fs';
import path from 'path';
import { matchGlob } from '../glob.js';
import { diffBodies, isRegionTag } from '@jay-framework/compiler-inline-composition';
import {
    type DesignTokens,
    isColorProperty,
    isSpacingProperty,
    isRadiusProperty,
    isTypographyProperty,
    matchColor,
    matchSpacing,
    matchRounded,
    matchTypographyProperty,
} from '@jay-framework/design-system-validator/design-tokens';
import type { HTMLElement } from 'node-html-parser';
import { DesignDiff, findMarkedSubtree, parsePage, ParsedPage } from './regions.js';

export type Verdict = 'pass' | 'fail' | 'unknown';

function styleValueIsToken(prop: string, value: string, tokens: DesignTokens): boolean {
    if (isColorProperty(prop)) return matchColor(value, tokens.colors).matches;
    if (isSpacingProperty(prop)) return matchSpacing(value, tokens.spacing).matches;
    if (isRadiusProperty(prop)) return matchRounded(value, tokens.rounded).matches;
    if (isTypographyProperty(prop))
        return matchTypographyProperty(prop, value, tokens.typography).matches;
    return false; // an unrecognised property is not a design-system token
}

/**
 * `designSystemOnly` (DL#233 §6.3, Q1 = additive + token-only): pass iff the change only ADDS
 * design-system regions/elements (token-valued styles), and does not restructure/re-theme a
 * pre-existing element. Added regions pass without `DESIGN.md`; token-valued styles need it (Q4).
 * v1: an added plain element that carries `class` names is `unknown` (class→token membership is a v2
 * refinement) — safe, since unknown keeps the conservative review.
 */
export function verifyDesignSystemOnly(
    diff: DesignDiff,
    tokens: DesignTokens | undefined,
): Verdict {
    if (diff.removedOrChanged > 0) return 'fail'; // a pre-existing element was changed or removed

    for (const el of diff.added) {
        if (el.isRegion) continue; // added design-system region — allowed, no tokens needed
        if (el.classes.length > 0) return 'unknown'; // class membership not verifiable in v1
        if (el.styles.length > 0) {
            if (!tokens) return 'unknown'; // token-valued facet but no DESIGN.md (Q4)
            for (const [prop, value] of el.styles) {
                if (!styleValueIsToken(prop, value, tokens)) return 'fail';
            }
        }
        // a bare added element (no class/style) is structurally additive — allowed
    }
    return 'pass';
}

/**
 * `create: from-template` (DL#233 §6.4): pass iff the new page has ≥1 region whose `template=`
 * resolves to a component matching the policy's `templates` globs. (v1: a template-based page passes;
 * token-checking the non-region markup is a v2 refinement, Q7.)
 */
export function verifyFromTemplate(page: ParsedPage, templatesGlobs: string[]): Verdict {
    const hasTemplateRegion = [...page.provenance.values()].some((tpl) =>
        templatesGlobs.some((g) => matchGlob(tpl, g)),
    );
    return hasTemplateRegion ? 'pass' : 'fail';
}

/**
 * `sync` (DL#233 §6.5, DL#231 Q10): true iff the candidate region equals its current template source
 * (a re-flatten) — `diffBodies(templateBody, regionBody)` is empty. Reads the template from the
 * candidate on disk (`candidateRoot`).
 */
export async function verifySync(
    candPage: ParsedPage,
    section: string | undefined,
    candidateRoot: string,
): Promise<boolean> {
    if (!section) return false; // sync is attributed to a marked region
    const regionEl = findMarkedSubtree(candPage.body, section);
    if (!regionEl || !isRegionTag(regionEl)) return false;

    // Provenance is keyed by the contract/region name (paramCase, no `jay:` prefix); the region
    // element's tag is `jay:<name>`.
    const regionName = (regionEl.tagName ?? '').toLowerCase().replace(/^jay:/, '');
    if (!regionName) return false;

    const templatePath = candPage.provenance.get(regionName);
    if (!templatePath) return false;

    let templateContent: string;
    try {
        templateContent = fs.readFileSync(path.join(candidateRoot, templatePath), 'utf-8');
    } catch {
        return false;
    }

    const templatePage = await parsePage(templateContent, templatePath, candidateRoot);
    if (!templatePage) return false;

    // A re-flatten: the region body has no drift from its current template source.
    return diffBodies(templatePage.body, regionEl).length === 0;
}

export { parsePage };
