import {Pillar} from "./board.jay.html";

export const DEFAULT_PILLARS: Array<Pillar> = [
    {
        pillarId: "todo",
        pillarData: {
            title: "To Do",
            tasks: [
                {id: '1', description: 'description of task 1', title: 'Task 1'},
                {id: '2', description: 'description of task 2', title: 'Task 2'}
            ]
        }
    },
    {
        pillarId: "progress",
        pillarData: {
            title: "In Progress",
            tasks: [
                {id: '3', description: 'description of task 3', title: 'Task 3'},
                {id: '4', description: 'description of task 4', title: 'Task 4'}
            ]
        }
    },
    {
        pillarId: "Done",
        pillarData: {
            title: "Done",
            tasks: [
                {id: '5', description: 'description of task 5', title: 'Task 5'},
                {id: '6', description: 'description of task 6', title: 'Task 6'}
            ]
        }
    }
]