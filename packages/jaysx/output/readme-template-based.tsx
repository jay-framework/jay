
import { CompiledJay } from '../jay';
import Jay, { JayNode, Signal } from './jay';
import languages from './supported-languages.json'

 
/**
 * an example user app 
 * the idea behind the compilation can be
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
 * 
 * 
 */
const supportedLangs = Jay.BuildSignal(languages)

const App1: CompiledJay<{ user: Signal<User>
    , lang: Signal<Language>}, {selectedLang:any}> = {
    logic({ user, lang}){
        const selectedLang = supportedLangs.value.find(lang=>lang.id===user.value.lang).name;
        return { selectedLang }
    },
    template({selectedLang, lang, user}) {
        return <div>
        <div >
            current lang: {selectedLang}
            {/** needs client representation */}
            <Accordion title={lang.value.chooseLang}>
                {/** can be rendered once in build */}
                <LangSelector supporetdLangs={supportedLangs}/>

            </Accordion>
            {/** can be rendered once in server */}
            <UserDisplay user={user} lang={lang}/>
            <CartComp/>
            </div>
        </div>
    },

}

const App = Jay(({ user, lang}:{ user: Signal<User>
    , lang: Signal<Language>})=>{

    // needs server run because it depends on user
    const selectedLang = supportedLangs.value.find(lang=>lang.id===user.value.lang).name;
    return <div>
        <div >
            current lang: {selectedLang}
            {/** needs client representation */}
            <Accordion title={lang.value.chooseLang}>
                {/** can be rendered once in build */}
                <LangSelector supporetdLangs={supportedLangs}/>

            </Accordion>
            {/** can be rendered once in server */}
            <UserDisplay user={user} lang={lang}/>
            <CartComp/>
        </div>
    </div>
})

// lang selector can be rendered once in build
const LangSelector = Jay(({supporetdLangs}:{supporetdLangs: Signal<LanguageInfo[]>})=>{
    return <div>{
            supporetdLangs.value.map(lang=><a href={lang.id} key={lang.id}>{lang.name}</a>)
        }</div>
})

const Accordion = Jay((props:{children: JayNode, title: JayNode})=>{
    const isOpen = Jay.Signal(false);
    return <div>
        <div>{props.title}</div>
        {isOpen.value ? <div>{props.children}</div>: null}
    </div>
})

// lang controlls can be rendered once in server
const UserDisplay = Jay(({user, lang}:{user: Signal<User>, lang:Signal<Language>})=>{
    return <div>{lang.value.hello} {user.value.name}</div>
})



const CartComp = Jay(async ()=>{
    const serverItems = await Jay.fetch<CartItem[]>('my-db:query');
    const state = Jay.useState(serverItems);
    return <div>
        {Jay.map(state ,item=><CartItemComp key={item.id} item={item} />)}
    </div>
})
const CartItemComp = Jay(({item}:{ item:Signal<CartItem>})=>{
    return <div>
        <h4>{item.value.title}</h4>
        <img src={item.value.src} />
    </div>
})

export default App