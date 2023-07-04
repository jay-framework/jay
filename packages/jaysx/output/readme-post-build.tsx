
import Jay, { JayNode, Signal } from '../jay';
import languages from '../supported-languages.json'

 
/**
 * an example user app 
 * the files
 * readme-client
 * readme-worker
 * readme-server
 * readme-build
 * represent the different compilation of this app for the diffent runtimes that are gonna run it
 */

interface LanguageInfo{
    id: string;
    name: string
}

interface Language{
    [key: string]: string
}
interface CartItem{
    title: string,
    src: string;
}


interface User{
    id: string;
    name: string
    lang: string;
}


// App with signals example
/**
 * this App uses 3 signals ( state stores )
 * the supporetdLangs store is supplied at build time
 * while user and lang are supplied in the server
 */
const supportedLangs = Jay.BuildSignal(languages)
// lang selector can be rendered once in build
const LangSelector = Jay(({supporetdLangs}:{supporetdLangs: Signal<LanguageInfo[]>})=>{
    return <div>{
            supporetdLangs.value.map(lang=><a href={lang.id}>{lang.name}</a>)
        }</div>
})

Jay.registerPrerendered('LangSelector1', Jay.renderToString(<LangSelector supporetdLangs={supportedLangs}/>))