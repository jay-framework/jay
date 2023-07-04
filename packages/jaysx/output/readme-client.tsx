
    import Jay, { JayNode, Signal } from './jay';

 
/**
 * by passing only signals between components we can maybe identify code that is not needed at all
 */

interface LanguageInfo{
    id: string;
    name: string
}

interface Language{
    [key: string]: string
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


    const App = Jay.registerComp('app_guid', ({supporetdLangs, user, lang}:{supporetdLangs: Signal<LanguageInfo[]>, user: Signal<User>
        , lang: Signal<Language>})=>{

        // needs server run because it depends on user
        // id: selectedLang, deps: user, lang
        const selectedLang = Jay.getClientData<JayNode>('app_guid_selectedLang');

        // native
        return <div key="div0">
            {/* native deps: selectedLang*/}
            <div key="div1">
                current lang: {selectedLang}
                {/** needs client representation */}
                {/* comp deps: lang */}
                <Accordion title={lang.value.chooseLang} key='Accordion0'>
                    {/** can be rendered once in build */}
                    {/* comp deps: supporetdLangs */}
                    <LangSelector supporetdLangs={supporetdLangs} key='LangSelector0'/>

                </Accordion>
                {/** can be rendered once in server */}
                {/* comp deps: user, lang */}
                <UserDisplay user={user} lang={lang} key='UserDisplay0'/>
            </div>
        </div>
    })

    
    // lang selector can be rendered once in build
    const LangSelector = ({supporetdLangs}:{supporetdLangs: Signal<LanguageInfo[]>})=>{
        {/* native deps: selectedLang*/}
        return <div key="div0">{
                supporetdLangs.value.map(lang=>{
                {/* native deps: selectedLang*/}
                return <a key="a0" href={lang.id}>{lang.name}</a>
            })
            }</div>
    }


    const Accordion = (props:{children: JayNode, title: JayNode})=>{
        // client-signal
        const isOpen = Jay.Signal(false);
        // isHidden allows the user to ask for rendering to happen for hidden parts
        // this allows the component to render the content in ssr
        // native
        return <div key="div0">
            {/* native, deps: title */}
            <div key="div1">{props.title}</div>
            {/* native, deps: isOpen children */}
            <div key="div2" isHidden={!isOpen.value}>{props.children}</div>
        </div>
    }

    // lang controlls can be rendered once in server
    const UserDisplay = ({user, lang}:{user: Signal<User>, lang:Signal<Language>})=>{
         // native deps: lang, user
        return <div>{lang.value.hello} {user.value.name}</div>
    }

   
