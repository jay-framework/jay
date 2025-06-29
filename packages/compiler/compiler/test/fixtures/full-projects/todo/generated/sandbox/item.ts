// @ts-expect-error Cannot find module
import { render, ItemElementRefs, ItemViewState } from './item.jay-html?jay-workerSandbox';
import { createEvent, createSignal, makeJayComponent, Props } from '@jay-framework/component';
import { JayEvent } from '@jay-framework/runtime';
import { handler$ } from '@jay-framework/secure';
interface ItemProps {
    title: string;
    isCompleted: boolean;
}
const ENTER_KEY = 13;
const ESCAPE_KEY = 27;
function ItemConstructor({ title, isCompleted }: Props<ItemProps>, refs: ItemElementRefs) {
    let [isEditing, setIsEditing] = createSignal(false);
    let [editText, setEditText] = createSignal(title);
    let onCompletedToggle = createEvent<boolean>();
    let onRemove = createEvent<null>();
    let onTitleChanged = createEvent<string>();
    let handleSubmit = () => {
        let val = editText().trim();
        if (val) {
            onTitleChanged.emit(val);
            setIsEditing(false);
        } else {
            onRemove.emit(null);
        }
    };
    refs.completed.onchange(() => onCompletedToggle.emit(!isCompleted()));
    refs.label.ondblclick(() => {
        setIsEditing(true);
        setEditText(title());
    });
    refs.button.onclick(() => onRemove.emit(null));
    refs.title.onblur(() => handleSubmit());
    refs.title
        .onchange$(handler$('0'))
        .then(({ event }: JayEvent<any, ItemViewState>) => setEditText(event.$0));
    refs.title
        .onkeydown$(handler$('1'))
        .then(({ event, viewState: todo }: JayEvent<any, ItemViewState>) => {
            if (event.$0 === ESCAPE_KEY) {
                todo.editText = todo.title;
                todo.isEditing = false;
            } else if (event.$0 === ENTER_KEY) {
                handleSubmit();
            }
        });
    return {
        render: () => ({ title, isCompleted, isEditing, editText }),
        onCompletedToggle: onCompletedToggle,
        onRemove: onRemove,
        onTitleChanged: onTitleChanged,
    };
}
export const Item = makeJayComponent(render, ItemConstructor);
