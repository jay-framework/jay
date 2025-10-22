import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
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

export interface IndirectRecursionElementRefs {
    menuItem: HTMLElementProxy<IndirectRecursionViewState, HTMLLIElement>;
}

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
    const [itemsRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [submenuRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const [refManager, [refMenuItem]] = ReferencesManager.for(options, ['menuItem'], [], [], [], {
        submenu: submenuRefManager,
    });

    function renderRecursiveRegion_menuItem(nodeData: IndirectRecursionViewState) {
        return de(
            'li',
            { class: 'menu-item' },
            [
                e('a', { href: '#' }, [
                    e('span', { class: 'icon' }, [dt((vs) => vs.icon)]),
                    e('span', { class: 'label' }, [dt((vs) => vs.label)]),
                ]),
                c(
                    (vs) => vs.hasSubmenu,
                    () =>
                        de('div', {}, [
                            c(
                                (vs) => vs.isOpen,
                                () =>
                                    de('ul', { class: 'submenu' }, [
                                        forEach(
                                            (vs: IndirectRecursionViewState) => vs.submenu?.items,
                                            (vs1: IndirectRecursionViewState) => {
                                                return e('li', {}, [
                                                    renderRecursiveRegion_menuItem(vs1),
                                                ]);
                                            },
                                            'id',
                                        ),
                                    ]),
                            ),
                        ]),
                ),
            ],
            refMenuItem(),
        );
    }

    const render = (viewState: IndirectRecursionViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('nav', { class: 'menu' }, [renderRecursiveRegion_menuItem(vs)]),
        ) as IndirectRecursionElement;
    return [refManager.getPublicAPI() as IndirectRecursionElementRefs, render];
}
