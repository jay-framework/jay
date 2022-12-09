import {render, ItemRefs} from "./item.jay.html";
import {createEvent, createState, makeJayComponent, Props } from "jay-component";

interface ItemProps {
    title: string,
    isCompleted: boolean
}

const ENTER_KEY = 13;
const ESCAPE_KEY = 27;

function ItemConstructor({title, isCompleted}: Props<ItemProps>, refs: ItemRefs) {

    let [isEditing, setIsEditing] = createState(false);
    let [editText, setEditText] = createState(title);

    let onCompletedToggle = createEvent<boolean>()
    let onRemove = createEvent<null>()
    let onTitleChanged = createEvent<string>()

    let handleSubmit = () => {
        let val = editText().trim();
        if (val) {
            onTitleChanged.emit(val);
            setIsEditing(false);
        } else {
            onRemove.emit(null);
        }
    }

    refs.completed.onchange(() => onCompletedToggle.emit(!isCompleted()));
    refs.label.ondblclick(() => {
        setIsEditing(true);
        setEditText(title());
    })
    refs.button.onclick(() => onRemove.emit(null))
    refs.title.onblur(() => handleSubmit())
    refs.title
        .$onchange(({event}) => (event.target as HTMLInputElement).value)
        .then(({event: value}) => setEditText(value))
    refs.title
        .$onkeydown(({event}) => (event.which))
        .then(({event:which, viewState: todo})=> {
            if (which === ESCAPE_KEY) {
                todo.editText = todo.title;
                todo.isEditing = false;
            } else if (which === ENTER_KEY) {
                handleSubmit();
            }
        })

    return {
        render: () => ({title, isCompleted, isEditing, editText}),
        onCompletedToggle: onCompletedToggle,
        onRemove: onRemove,
        onTitleChanged: onTitleChanged
    }
}

export const Item = makeJayComponent(render, ItemConstructor)