export function ensureNode(parent: HTMLElementTagNameMap[string], node: HTMLElementTagNameMap[string], baseIndex: number) {
    if (parent.childNodes.length >= baseIndex && parent.childNodes[baseIndex] !== node) {
        if (baseIndex >= parent.children.length) {
            parent.appendChild(child)
        } else {
            parent.insertBefore(child, parent.children[index])
        }
    }
    else {
        parent.appendChild(child)
    }
}



/*

let roles = [
]

if (x !- x)
  roles.update(...)


    root_rules_elements = [];    // state of number of nodes per rule
    root_div1_rule(cond) {
        if (cong)
            ensureNode(root, div1, getPosition(root_rules_elements, 0))
            root_rules_elements[0] = 1;
        else {
            root.remove(div1
            root_rules_elements[0] = 0;
        }
    }

    root_div1_rule(cond) {
        if (!cong)
            ensureNode(root, div2, getPosition(root_rules_elements, 1))
            root_rules_elements[1] = 1;
        else {
            root.remove(div1
            root_rules_elements[1] = 0;
        }
    }

    const rerender = (newViewState) => {
        if (lastViewState.cond !== newViewState.cond) {
            root_div1_rule(newViewState.cond)
            root_div2_rule(newViewState.cond)
        }

        if (lastViewState.text1 !== newViewState.text1)
            updatediv1(newViewState.text1);
        if (lastViewState.text2 !== newViewState.text2)
            updatediv2(newViewState.text2);
        lastViewState = newViewState
    };



    kindergarden
      rules -> children

      rule -> initChildren: numChildren
      -> updateChildren(offset): numChildren

 */