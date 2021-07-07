import {
    dynamicElement as de,
    element as e,
    forEach,
    JayElement,
    dynamicText as dt, ConstructContext
} from '../../lib/element.js';

interface Item {
    name: string,
    completed: boolean,
    cost: number,
    id: string
}

interface ViewState {
    items: Array<Item>,
    title: string
}

export default function render(viewState: ViewState): JayElement<ViewState> {


    return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) => {

        const createDiv = (item: Item) => {
            const itemContext = context.child(item)
            return e('div', {}, [
                e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}},
                    [dt(itemContext, item => item.name)]),
                e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}},
                    [dt(itemContext, item => item.completed ? 'yes' : 'no')]),
                e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}},
                    [dt(itemContext, item => item.cost.toString())])
            ]);
        };

        return e('div', {}, [
            e('h1', {}, [dt(context, vs => vs.title)]),
            de('div', {}, [
                forEach(vs => vs.items, createDiv, 'id')
            ], context)
        ], context)
    })
}

