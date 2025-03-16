import './style.css'
import './typescript.svg'
import { setupCounter } from './counter'

setupCounter(document.querySelector('#counter') as HTMLButtonElement)

export function init() {
    console.log('init')
}