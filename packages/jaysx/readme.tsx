
    import Jay from './jay';

    // simple example
    const Comp = ({title}: {title: string})=>{
        return <div>{title}</div>
    }
    
    {
        // worker
        const Comp = Jay.registerComp( 'Comp_guid1',({title}: {title: string})=>{
            return Jay.renderTemplate('CompDiv_guid1', {
              title
            })
        });
    
       
       
    }
    {
     // client
    
        Jay.registerTemplate('CompDiv1', ({title}: {title: string})=>{
            return <div>{title}</div>
        })
    }
       


    
    // statefull example
    const Statefull = ({title}: {title: string})=>{
        const [value, setValue] = Jay.useState('title')
        return <input onChange={(ev)=>setValue(ev.target.value)} value={value}/>
    }
    
    {
        // worker
        const Comp = Jay.registerComp( 'Statefull_guid1',({title}: {title: string})=>{
            const [value, setValue] = Jay.useState('title');
            const inputOnChange = (ev: any)=>setValue(ev.target.value);

            return Jay.renderTemplate('StatefullDiv_guid1', {
              value,
              inputOnChange
            })
        });
    
       
       
    }
    {
     // client
    
        Jay.registerTemplate('CompDiv1', ({inputOnChange, value}: {inputOnChange: any,value: string })=>{
            
            return <inputOnChange onChange={inputOnChange} value={value}/>
        })
    }
       


  // using component example
const Comp2 = ({title}: {title: string})=>{
    return <div><Comp title={title}/>{title}</div>
}

{
    // worker
    const Comp = Jay.registerComp('Comp_guid1',({title}: {title: string})=>{
        return Jay.renderTemplate('CompDiv_guid1', {
            title
        })
    });

    Jay.registerTemplate('CompDiv_guid1', ({title}: {title: string})=>{
        return {
            innerCompKey: <Comp2 title={title}/>
        }
    })
   
}
{
    // client
``
    Jay.registerTemplate('CompDiv_guid1', ({title}: {title: string})=>{
        return <div><Comp2 key='innerCompKey'/>{title}</div>
    })
}
    
 


  // repeater example
  const Repeater = ({titles}: {titles: string[]})=>{
    return <div>{titles.map(t=>(
        <div key={t}>
            <Comp title={t}/>
        </div>
    ))}</div>
}

{
    // worker
    const Comp = Jay.registerComp('Repeater_guid1',({titles}: {titles: string[]})=>{
        return Jay.renderTemplate('CompDiv_guid1', {
            titles
        })
    });

    Jay.registerTemplate('CompDiv_guid1', ({titles}: {titles: string[]})=>{
        return {
            expressionKey: titles.map(t=>(
                    <Comp title={t} key={`${t}|innerCompKey`}/>
            ))
        }
    })
   
}
{
    // client
``
    Jay.registerTemplate('CompDiv1', ({titles}: {titles: string[]})=>{
        return <div>{titles.map(t=>(
            <div key={t}>
                <Comp key={`${t}|innerCompKey`}/>
            </div>
        ))}</div>
    })
}
    
 