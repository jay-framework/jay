import React, {useState} from 'react';
import './App.css';
import { Basic } from './basic';
import {Collections} from "./collections";
import {Composite} from "./composite";
import {Conditions} from "./conditions";
import {TableHost} from "./table-host";

export enum SelectedExample {
    basic,
    collections,
    composite,
    conditions,
    table
}

const examples = Object.keys(SelectedExample)
    .filter(_ => !isNaN(Number(_)))
    .map(_ => ({value: _, name: SelectedExample[_]}))

function App() {

    let [cycles, setCycles] = useState(1000)
    let [selectedExample, setSelectedExample] = useState(SelectedExample.basic)
    let [progress, setProgress] = useState('')
    let [running, setRunning] = useState(false);

    const cyclesChanged = (event) =>
        setCycles(event.target.value)

    const chooseExample = (event) => {
        let index = event.target.selectedIndex;
        setSelectedExample(Number(examples[index].value));
    }

    const progressCallback = (message: string, done: boolean) => {
        setProgress(message);
        if (done)
            setRunning(false);
    }

    const run = () => setRunning(true);

    return (
        <div className="App">
            <div className="title">Jay Examples</div>
            <div className="select-example">
                <label htmlFor="choose-example">Select example to view</label>
                <select id="choose-example" onChange={chooseExample}>
                    {examples.map(example =>
                        (<option key={example.value} value={example.value}>{example.name}</option>)
                    )}
                </select>
            </div>
            <div className="cycles"><label htmlFor="cycles">Select number of cycles</label>
                <input id="cycles" value={cycles} onInput={cyclesChanged}/>
            </div>
            <div className="progress">{progress}</div>
            <button onClick={run}>run</button>
            <div className="stage">
                {(selectedExample === SelectedExample.basic) &&
                (<Basic cycles={cycles} progressCallback={progressCallback} running={running}/>)}

                {(selectedExample === SelectedExample.collections) &&
                (<Collections cycles={cycles} progressCallback={progressCallback} running={running}/>)}

                {(selectedExample === SelectedExample.composite) &&
                (<Composite cycles={cycles} progressCallback={progressCallback} running={running}/>)}

                {(selectedExample === SelectedExample.conditions) &&
                (<Conditions cycles={cycles} progressCallback={progressCallback} running={running}/>)}

                {(selectedExample === SelectedExample.table) &&
                (<TableHost cycles={cycles} progressCallback={progressCallback} running={running}/>)}
            </div>
        </div>
    );
}

export default App;
