import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext} from "jay-runtime";

interface Item {
    name: string,
    completed: boolean,
    cost: number,
    id: string
}

interface ViewState {
    title: string,
    items: Array<Item>
}

export function render(viewState: ViewState): JayElement<ViewState> {
    return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
        e('div', {}, [
            e('h1', {}, [dt(context, vs => vs.title)]),
            de('div', {}, [forEach(vs => vs.items, (vs1: Item) => {
                const itemContext = context.forItem(vs1)
                return e('div', {}, [
                    e('span', {style: {cssText: 'color:green; width: 100px; display: inline-block;'}}, [dt(itemContext, vs => vs.name)]),
                    e('span', {style: {cssText: 'color:red; width: 100px; display: inline-block;'}}, [dt(itemContext, vs => vs.completed)]),
                    e('span', {style: {cssText: 'color:blue; width: 100px; display: inline-block;'}}, [dt(itemContext, vs => vs.cost)])
                ])}, 'id')], context)
        ]));
}

