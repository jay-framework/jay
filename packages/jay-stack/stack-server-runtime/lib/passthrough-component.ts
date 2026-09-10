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

const pickByName = (props: Record<string, any>, names: string[]): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const name of names) {
        if (props && name in props) out[name] = props[name];
    }
    return out;
};

/**
 * DL#187 — synthesize an identity passthrough component definition for a Tier 2 pure headfull
 * component (`.jay-html` + `.jay-contract`, no `.ts`). Its ViewState is exactly the props the usage
 * site supplies, split per tag phase so slow fields bake into the SSG output and fast fields resolve
 * at request time. There is no code to transform, no services, and no carryForward — each phase
 * echoes its subset of props straight through (props ≡ tags, validated at compile time).
 *
 * Used by the dev server, the production build, and the production server so a Tier 2 instance
 * behaves like a code-backed instance component at every phase without an author-written `.ts`.
 */
export function makePassthroughInstanceComponent(
    tags: PassthroughTag[],
): AnyJayStackComponentDefinition {
    const slowNames = tags.filter((t) => !isFastPhase(t.phase)).map((t) => t.name);
    const fastNames = tags.filter((t) => isFastPhase(t.phase)).map((t) => t.name);

    const definition: any = { services: [] };
    if (slowNames.length > 0) {
        definition.slowlyRender = async (props: Record<string, any>) =>
            phaseOutput(pickByName(props, slowNames), {});
    }
    if (fastNames.length > 0) {
        definition.fastRender = async (props: Record<string, any>) =>
            phaseOutput(pickByName(props, fastNames), {});
    }
    return definition as AnyJayStackComponentDefinition;
}
