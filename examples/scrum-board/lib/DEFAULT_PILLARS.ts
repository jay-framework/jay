import {Pillar} from "./board.jay.html";

export const DEFAULT_PILLARS: Array<Pillar> = [
    {
        pillarId: "todo",
        pillarData: {
            title: "To Do",
            tasks: [
                {id: '1', description: 'Round up those elusive unicorns! They\'ve been grazing in the enchanted meadow again.', title: 'Unicorn Wrangling'},
                {id: '2', description: 'Embark on a quest for the mythical triple-shot caramel macchiato. Fuel for the fearless!', title: 'Epic Coffee Run'},
                {id: '3', description: 'Befriend our office plants. They\'ve been gossiping about us, and we need to win them over.', title: 'Operation: Office Plant Whisperer'}
            ]
        }
    },
    {
        pillarId: "progress",
        pillarData: {
            title: "In Progress",
            tasks: [
                {id: '4', description: 'Conquer the treacherous Email Dragon that guards your inbox. It hoards unread messages.', title: 'Slay the Email Dragon'},
                {id: '5', description: 'Prepare for battle! Defend your desk against the clutter monsters. Victory is neatness!', title: 'Mission: Desk Organizing Extravaganza'},
                {id: '6', description: 'Our feline colleagues demand we understand their meows and purrs. Time to decode!', title: 'Code the Secret Language of Cats"'}
            ]
        }
    },
    {
        pillarId: "Done",
        pillarData: {
            title: "Done",
            tasks: [
                {id: '7', description: 'In times of tech turmoil, call upon the IT Wizards to cast spells and banish glitches.', title: 'Summon the IT Wizards'},
                {id: '8', description: 'Venture to the kitchen and conquer the Snack Castle! The vending machines await!', title: 'Journey to the Snack Castle'}
            ]
        }
    }
]