import {JayElement, element as e, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {Counter} from './counter';
import {mainRoot as mr} from "../../../../lib/main/main-root";
import {secureChildComp} from "../../../../lib/main/main-child-comp";

export interface AppViewState {

}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(viewState, () =>
        mr(viewState, () =>
            e('div', {}, [
                secureChildComp(Counter, vs => ({title: 'first counter', initialCount: 12}), 'a')
            ])
        ), options);
}