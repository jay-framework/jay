import { render, ItemElementRefs, ItemViewState } from './item.jay-html';
import { createMemo, createSignal, makeJayComponent, Props } from '@jay-framework/component';
import { JayEvent } from '@jay-framework/runtime';
import { TODO_CONTEXT, TodoContext } from './todo-context';

interface ItemProps {
    id: string;
}

const ENTER_KEY = 13;
const ESCAPE_KEY = 27;

function ItemConstructor(
    { id }: Props<ItemProps>,
    refs: ItemElementRefs,
    { todos, remove, completeToggle, changeTitle }: TodoContext,
) {
    const todo = createMemo(() => todos().find((_) => _.id === id()));
    const title = createMemo(() => todo().title);
    const isCompleted = createMemo(() => todo().isCompleted);

    let [isEditing, setIsEditing] = createSignal(false);
    let [editText, setEditText] = createSignal(title);

    let handleSubmit = () => {
        let val = editText().trim();
        if (val) {
            changeTitle(id(), val);
            setIsEditing(false);
        } else {
            remove(id());
        }
    };

    refs.completed.onchange(() => completeToggle(id(), !isCompleted()));
    refs.label.ondblclick(() => {
        setIsEditing(true);
        setEditText(title());
    });
    refs.button.onclick(() => remove(id()));
    refs.title.onblur(() => handleSubmit());
    refs.title.onchange(({ event }: JayEvent<Event, ItemViewState>) =>
        setEditText((event.target as HTMLInputElement).value),
    );
    refs.title.onkeydown(({ event, viewState: todo }: JayEvent<KeyboardEvent, ItemViewState>) => {
        if (event.which === ESCAPE_KEY) {
            todo.editText = todo.title;
            todo.isEditing = false;
        } else if (event.which === ENTER_KEY) {
            handleSubmit();
        }
    });

    return {
        render: () => ({ title, isCompleted, isEditing, editText }),
    };
}

export const Item = makeJayComponent(render, ItemConstructor, TODO_CONTEXT);
