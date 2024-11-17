import { render, ItemElementRefs, ItemViewState } from './item.jay-html';
import { createEvent, createState, makeJayComponent, Props } from 'jay-component';
import { JayEvent } from 'jay-runtime';

interface ItemProps {
    title: string;
    isCompleted: boolean;
}

const ENTER_KEY = 13;
const ESCAPE_KEY = 27;

function ItemConstructor({ title, isCompleted }: Props<ItemProps>, refs: ItemElementRefs) {
    let [isEditing, setIsEditing] = createState(false);
    let [editText, setEditText] = createState(title);

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
        onCompletedToggle: onCompletedToggle,
        onRemove: onRemove,
        onTitleChanged: onTitleChanged,
    };
}

export const Item = makeJayComponent(render, ItemConstructor);
