interface ViewState {
    text1: string,
    text2: string,
    cond: boolean
}

export default function render(viewState: ViewState) {
    let lastViewState = viewState;
    let root = document.createElement('div');
    let div1 = document.createElement('div');
    let div2 = document.createElement('div');
    div1.style.cssText = "color:red";
    div2.style.cssText = "color:green";

    const updatediv1 = (text) => {
        div1.textContent = text;
    };

    const updatediv2 = (text) => {
        div2.textContent = text;
    };

    const updateRoot = (cond) => {
        if (cond && root.childNodes[0] !== div1) {
            if (root.childNodes[0])
                root.removeChild(root.childNodes[0]);
            root.appendChild(div1)
        }
        if (!cond && root.childNodes[0] !== div2) {
            if (root.childNodes[0])
                root.removeChild(root.childNodes[0]);
            root.appendChild(div2)
        }
    }

    const rerender = (newViewState) => {
        if (lastViewState.cond !== newViewState.cond)
            updateRoot(newViewState.cond);
        if (lastViewState.text1 !== newViewState.text1)
            updatediv1(newViewState.text1);
        if (lastViewState.text2 !== newViewState.text2)
            updatediv2(newViewState.text2);
        lastViewState = newViewState
    };


    updateRoot(viewState.cond);
    if (viewState.cond)
        updatediv1(viewState.text1);
    else
        updatediv2(viewState.text2);

    return {
        dom: root,
        update: rerender
    }
}

