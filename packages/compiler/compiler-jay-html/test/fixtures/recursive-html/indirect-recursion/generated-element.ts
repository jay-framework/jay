import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    conditional as c,
    forEach,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface SubmenuOfIndirectRecursionViewState {
    items: Array<IndirectRecursionViewState>;
}

export interface IndirectRecursionViewState {
    label: string;
    id: string;
    icon: string;
    hasSubmenu: boolean;
    isOpen: boolean;
    submenu: SubmenuOfIndirectRecursionViewState;
}

export interface IndirectRecursionElementRefs {}

export type IndirectRecursionElement = JayElement<
    IndirectRecursionViewState,
    IndirectRecursionElementRefs
>;
export type IndirectRecursionElementRender = RenderElement<
    IndirectRecursionViewState,
    IndirectRecursionElementRefs,
    IndirectRecursionElement
>;
export type IndirectRecursionElementPreRender = [
    IndirectRecursionElementRefs,
    IndirectRecursionElementRender,
];
export type IndirectRecursionContract = JayContract<
    IndirectRecursionViewState,
    IndirectRecursionElementRefs
>;

export function render(options?: RenderElementOptions): IndirectRecursionElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);

    function renderRecursiveRegion_menuItem(itemData: IndirectRecursionViewState) {
        return de('li', { class: 'menu-item' }, [
            e('a', { href: '#' }, [
                e('span', { class: 'icon' }, [dt((vs: IndirectRecursionViewState) => vs.icon)]),
                e('span', { class: 'label' }, [dt((vs: IndirectRecursionViewState) => vs.label)]),
            ]),
            c(
                (vs: IndirectRecursionViewState) => vs.hasSubmenu && vs.isOpen,
                () =>
                    de('ul', { class: 'submenu' }, [
                        forEach(
                            (vs: IndirectRecursionViewState) => vs.submenu?.items,
                            (childData: IndirectRecursionViewState) => {
                                return e('li', {}, [renderRecursiveRegion_menuItem(childData)]);
                            },
                            'id',
                        ),
                    ]),
            ),
        ]);
    }

    const render = (viewState: IndirectRecursionViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('nav', { class: 'menu' }, [renderRecursiveRegion_menuItem(viewState)]),
        ) as IndirectRecursionElement;

    return [refManager.getPublicAPI() as IndirectRecursionElementRefs, render];
}

