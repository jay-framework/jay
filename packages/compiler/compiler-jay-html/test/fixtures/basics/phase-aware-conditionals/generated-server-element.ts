import { type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface PhaseAwareConditionalsViewState {
    slowFlag: boolean;
    fastFlag: boolean;
    interactiveFlag: boolean;
}

export function renderToStream(
    vs: PhaseAwareConditionalsViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    if (vs.slowFlag) {
        w('<span');
        w(' jay-coordinate="S0/0/0">');
        w('Slow');
        w('</span>');
    }
    if (vs.fastFlag) {
        w('<span');
        w(' jay-coordinate="S0/0/1">');
        w('Fast');
        w('</span>');
    }
    if (vs.interactiveFlag) {
        w('<span');
        w(' jay-coordinate="S0/0/2">');
        w('Interactive');
        w('</span>');
    }
    if (vs.slowFlag && vs.fastFlag && vs.interactiveFlag) {
        w('<span');
        w(' jay-coordinate="S0/0/3">');
        w('Mixed');
        w('</span>');
    }
    w('</div>');
}
