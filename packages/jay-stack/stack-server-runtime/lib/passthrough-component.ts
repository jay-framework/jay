import { phaseOutput } from '@jay-framework/fullstack-component';
import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';

/**
 * A contract tag reduced to what the passthrough synthesis needs: its name and phase.
 * (For a Tier 2 pure headfull component, props ≡ tags — validated at compile time (DL#187 Q9) —
 * so the tag name is also the prop name the usage site binds to.)
 */
export interface PassthroughTag {
    name: string;
    phase?: string;
}

const isFastPhase = (phase?: string) => phase === 'fast' || phase === 'fast+interactive';

/**
 * Pick the given tags' props by name.
 *
 * Values are already resolved and coerced to their declared `dataType` upstream, at the single
 * serialization source `normalizeAndResolveInstanceProps` (DL#190) — the passthrough echoes them
 * verbatim.
 */
const pick = (props: Record<string, any>, tags: PassthroughTag[]): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const tag of tags) {
        if (props && tag.name in props) out[tag.name] = props[tag.name];
    }
    return out;
};

/**
 * DL#187 — synthesize an identity passthrough component definition for a Tier 2 pure headfull
 * component (`.jay-html` + `.jay-contract`, no `.ts`). Its ViewState is exactly the props the usage
 * site supplies, split per tag phase so slow fields bake into the SSG output and fast fields resolve
 * at request time. There is no code to transform, no services, and no carryForward — each phase
 * echoes its subset of props straight through (props ≡ tags, validated at compile time). Values are
 * typed by contract `dataType` upstream in `normalizeAndResolveInstanceProps` (DL#190).
 *
 * Used by the dev server, the production build, and the production server so a Tier 2 instance
 * behaves like a code-backed instance component at every phase without an author-written `.ts`.
 */
export function makePassthroughInstanceComponent(
    tags: PassthroughTag[],
): AnyJayStackComponentDefinition {
    const slowTags = tags.filter((t) => !isFastPhase(t.phase));
    const fastTags = tags.filter((t) => isFastPhase(t.phase));

    const definition: any = { services: [] };
    if (slowTags.length > 0) {
        definition.slowlyRender = async (props: Record<string, any>) =>
            phaseOutput(pick(props, slowTags), {});
    }
    if (fastTags.length > 0) {
        definition.fastRender = async (props: Record<string, any>) =>
            phaseOutput(pick(props, fastTags), {});
    }
    return definition as AnyJayStackComponentDefinition;
}
