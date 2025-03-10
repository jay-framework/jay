import { makeJayStackComponent } from 'jay-stack-runtime';
import {PageViewState, PageElement, render, PageElementRefs} from './page.jay-html'
import {Props} from "jay-component";

interface HomePageProps {}

function homePageConstructor(props: Props<HomePageProps>, refs: PageElementRefs) {

    return {
        render: () => ({})
    }
}

makeJayStackComponent({
    elementPreRender: render,
    comp: homePageConstructor
})