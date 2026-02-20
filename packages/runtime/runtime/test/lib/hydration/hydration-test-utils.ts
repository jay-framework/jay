import { ConstructContext, JayElement, ReferencesManager } from '../../../lib';

/**
 * Parse an HTML string into a root element (simulates server-rendered HTML).
 */
export function makeServerHTML(html: string): Element {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

/**
 * Hydrate server-rendered HTML with a view state and constructor.
 * Handles the common case of no refs — creates a no-op ReferencesManager,
 * parses HTML, and calls withHydrationRootContext.
 */
export function hydrate<VS>(
    html: string,
    viewState: VS,
    hydrateConstructor: () => void,
): { jayElement: JayElement<VS, {}>; root: Element } {
    const root = makeServerHTML(html);
    const [refManager] = ReferencesManager.for({}, [], [], [], []);
    const jayElement = ConstructContext.withHydrationRootContext<VS, {}>(
        viewState,
        refManager,
        root,
        hydrateConstructor,
    );
    return { jayElement, root };
}