import {makeJayComponent, Props, provideContext} from "../../lib";
import {COUNT_CONTEXT, mkContext} from "./number-context.ts";
import {AppElement, AppRefs} from "./app-element.ts";

export interface AppProps {}
export function AppComponentConstructor({}: Props<AppProps>, refs: AppRefs) {
    const context = mkContext();
    provideContext(COUNT_CONTEXT, context)
    refs.button.onclick(() => context.inc())
    return {
        render: () => ({}),
    };
}

export const App = makeJayComponent(AppElement, AppComponentConstructor);
