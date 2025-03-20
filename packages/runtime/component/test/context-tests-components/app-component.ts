import { makeJayComponent, Props, provideContext } from '../../lib';
import { COUNT_CONTEXT, mkContext } from './number-context';
import { AppElement, AppRefs } from './app-element';

export interface AppProps {}
export function AppComponentConstructor({}: Props<AppProps>, refs: AppRefs) {
    const context = mkContext();
    provideContext(COUNT_CONTEXT, context);
    refs.button.onclick(() => context.inc());
    return {
        render: () => ({ parentCount: context.count() }),
    };
}

export const App = makeJayComponent(AppElement, AppComponentConstructor);
