/**
 * Runs generated client scripts in JSDOM for dev-server tests.
 *
 * Parses viewState, fastCarryForward, trackByMap from the script,
 * loads the hydrate module via Vite's ssrLoadModule, and executes
 * hydration in a JSDOM document.
 */

import { JSDOM } from 'jsdom';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { hydrateCompositeJayComponent } from '@jay-framework/stack-client-runtime';

export interface RunScriptResult {
    /** The hydrated component instance (or rendered element for makeComposite) */
    instance: unknown;
    /** The JSDOM document */
    document: Document;
}

export interface ParsedScript {
    viewState: object;
    fastCarryForward: object;
    trackByMap: object;
    isHydrate: boolean;
    hydrateModulePath: string;
}

/**
 * Extracts viewState, fastCarryForward, trackByMap from the generated script.
 * Uses regex to parse the const assignments.
 */
export function parseScriptData(script: string): ParsedScript {
    const viewStateMatch = script.match(/const viewState = ([^;]+);/);
    const fastCarryForwardMatch = script.match(/const fastCarryForward = ([^;]+);/);
    const trackByMapMatch = script.match(/const trackByMap = ([^;]+);/);

    const viewState = viewStateMatch ? JSON.parse(viewStateMatch[1].trim()) : {};
    const fastCarryForward = fastCarryForwardMatch ? JSON.parse(fastCarryForwardMatch[1].trim()) : {};
    const trackByMap = trackByMapMatch ? JSON.parse(trackByMapMatch[1].trim()) : {};

    const isHydrate = script.includes('hydrateCompositeJayComponent');
    const hydrateMatch = script.match(/import\s*\{\s*hydrate\s*\}\s*from\s*["']([^"']+)["']/);
    const hydrateModulePath = hydrateMatch
        ? hydrateMatch[1].replace(/\?import&jay-hydrate\.ts$/, '?import&jay-hydrate')
        : '';

    return { viewState, fastCarryForward, trackByMap, isHydrate, hydrateModulePath };
}

/**
 * Runs a hydrate-based script in JSDOM.
 * For simple-page and other SSR pages that use hydrateCompositeJayComponent.
 */
export async function runHydrateScriptInJsdom(
    html: string,
    script: string,
    viteServer: ViteDevServer,
    pagesRoot: string,
): Promise<RunScriptResult> {
    const parsed = parseScriptData(script);
    if (!parsed.isHydrate) {
        throw new Error('Script is not a hydrate script (expected hydrateCompositeJayComponent)');
    }

    const hydrateModuleId = path.resolve(pagesRoot, 'page.jay-html') + '?import&jay-hydrate';
    const { hydrate } = await viteServer.ssrLoadModule(hydrateModuleId);

    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    const doc = dom.window.document;

    const prevDocument = (global as any).document;
    const prevWindow = (global as any).window;
    (global as any).document = doc;
    (global as any).window = dom.window;

    try {
        const target = doc.getElementById('target');
        if (!target) throw new Error('No #target element in HTML');
        const rootElement = target.firstElementChild;
        if (!rootElement) throw new Error('No root element inside #target');

        const pageComp = hydrateCompositeJayComponent(
            hydrate,
            parsed.viewState,
            parsed.fastCarryForward,
            [],
            parsed.trackByMap,
            rootElement,
        );

        const instance = pageComp({});

        return { instance, document: doc };
    } finally {
        (global as any).document = prevDocument;
        (global as any).window = prevWindow;
    }
}
