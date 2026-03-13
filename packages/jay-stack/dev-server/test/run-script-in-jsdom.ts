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
import {TrackByMap} from "@jay-framework/view-state-merge/lib";

export interface RunScriptResult {
    /** The hydrated component instance (or rendered element for makeComposite) */
    instance: unknown;
    /** The JSDOM document */
    document: Document;
}

export interface ParsedPart {
    name: string;
    modulePath: string;
    key?: string;
}

export interface ParsedScript {
    viewState: object;
    fastCarryForward: object;
    trackByMap: TrackByMap;
    isHydrate: boolean;
    hydrateModulePath: string;
    /** Component parts extracted from the script (page, headless components) */
    parts: ParsedPart[];
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

    // Extract component parts from the parts array in the script.
    // Pattern: {comp: name.comp, contextMarkers: name.contexts || [], key: 'key'}
    const parts: ParsedPart[] = [];
    const partPattern = /\{comp:\s*(\w+)\.comp,\s*contextMarkers:\s*\w+\.contexts\s*\|\|\s*\[\](?:,\s*key:\s*'([^']*)')?\}/g;
    let partMatch;
    while ((partMatch = partPattern.exec(script)) !== null) {
        const name = partMatch[1];
        const key = partMatch[2];
        // Find the import for this name
        const importPattern = new RegExp(`import\\s*\\{\\s*${name}\\s*\\}\\s*from\\s*["']([^"']+)["']`);
        const importMatch = script.match(importPattern);
        if (importMatch) {
            parts.push({ name, modulePath: importMatch[1], key });
        }
    }

    return { viewState, fastCarryForward, trackByMap, isHydrate, hydrateModulePath, parts };
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

    const hydrateModuleId = path.resolve(pagesRoot, 'page.jay-html') + '?jay-hydrate';
    const { hydrate } = await viteServer.ssrLoadModule(hydrateModuleId);

    // Load component parts (page component, headless components)
    const loadedParts: Array<{ comp: any; contextMarkers: any[]; key?: string }> = [];
    for (const part of parsed.parts) {
        const moduleId = path.resolve(pagesRoot, part.modulePath.replace(/^\//, ''));
        const mod = await viteServer.ssrLoadModule(moduleId);
        const comp = mod[part.name];
        if (comp) {
            loadedParts.push({
                comp: comp.comp,
                contextMarkers: comp.contexts || [],
                ...(part.key ? { key: part.key } : {}),
            });
        }
    }

    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    const doc = dom.window.document;

    const prevDocument = (global as any).document;
    const prevWindow = (global as any).window;
    const prevNode = (global as any).Node;
    const prevComment = (global as any).Comment;
    (global as any).document = doc;
    (global as any).window = dom.window;
    (global as any).Node = dom.window.Node;
    (global as any).Comment = dom.window.Comment;

    try {
        const target = doc.getElementById('target');
        if (!target) throw new Error('No #target element in HTML');
        const rootElement = target.firstElementChild;
        if (!rootElement) throw new Error('No root element inside #target');

        const pageComp = hydrateCompositeJayComponent(
            hydrate,
            parsed.viewState,
            parsed.fastCarryForward,
            loadedParts,
            parsed.trackByMap,
            rootElement,
        );

        const instance = pageComp({});

        return { instance, document: doc };
    } finally {
        (global as any).document = prevDocument;
        (global as any).window = prevWindow;
        (global as any).Node = prevNode;
        (global as any).Comment = prevComment;
    }
}
