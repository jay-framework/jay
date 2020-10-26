interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    let lastViewState = {text: ''};
    let root = document.createElement('div');

    const updateRootText = (text) => {
        root.textContent = text;
    };

    const rerender = (newViewState) => {
        if (lastViewState.text !== newViewState.text)
            updateRootText(newViewState.text);
        lastViewState = newViewState
    };

    updateRootText(viewState.text);

    return {
        dom: root,
        update: rerender
    }
}

