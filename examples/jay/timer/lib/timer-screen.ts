import {
    Down,
    Pause,
    Play,
    render,
    Restart,
    Screen,
    Start,
    Stop,
    TimerScreenElementRefs,
    Up,
} from './timer-screen.jay-html';
import { createSignal, makeJayComponent } from 'jay-component';

function AppComponentConstructor(_, refs: TimerScreenElementRefs) {
    const [screen, setScreen] = createSignal<Screen>(Screen.welcome);
    const [seconds, setSeconds] = createSignal(3);
    const [timeLeft, setTimeLeft] = createSignal(3);

    const [start, setStart] = createSignal<Start>(Start.regular);
    const [play, setPlay] = createSignal<Play>(Play.regular);
    const [stop, setStop] = createSignal<Stop>(Stop.regular);
    const [pause, setPause] = createSignal<Pause>(Pause.regular);
    const [restart, setRestart] = createSignal<Restart>(Restart.regular);
    const [up, setUp] = createSignal<Up>(Up.regular);
    const [down, setDown] = createSignal<Down>(Down.regular);

    const [intervalPointer, setIntervalPointer] = createSignal<any>(null);

    function pauseTimer() {
        clearInterval(intervalPointer());
        setIntervalPointer(null);
    }

    function stopTimer() {
        pauseTimer();
        setScreen(Screen.set);
    }

    function endTimer() {
        pauseTimer();
        setScreen(Screen.done);
    }

    function playTimer() {
        const interval = setInterval(() => {
            const tl = timeLeft();
            if (tl > 1) {
                setTimeLeft(tl - 1);
            } else {
                endTimer();
            }
        }, 1000);
        setIntervalPointer(interval);
    }

    /**
     * Handle Buttons Hover
     */
    //start
    refs.startWelcome.onmouseenter(() => {
        setStart(Start.hover);
    });

    refs.startWelcome.onmouseleave(() => {
        setStart(Start.regular);
    });

    //stop
    refs.stopPlay.onmouseenter(() => {
        setStop(Stop.hover);
    });

    refs.stopPlay.onmouseleave(() => {
        setStop(Stop.regular);
    });

    //pause
    refs.pausePlay.onmouseenter(() => {
        setPause(Pause.hover);
    });

    refs.pausePlay.onmouseleave(() => {
        if (intervalPointer() === null) {
            setPause(Pause.hover);
        } else {
            setPause(Pause.regular);
        }
    });

    //play
    refs.playSet.onmouseenter(() => {
        setPlay(Play.hover);
    });

    refs.playSet.onmouseleave(() => {
        setPlay(Play.regular);
    });

    //up
    refs.upSet.onmouseenter(() => {
        setUp(Up.hover);
    });

    refs.upSet.onmouseleave(() => {
        setUp(Up.regular);
    });

    //down
    refs.downSet.onmouseenter(() => {
        setDown(Down.hover);
    });

    refs.downSet.onmouseleave(() => {
        setDown(Down.regular);
    });

    //restart
    refs.restartDone.onmouseenter(() => {
        setRestart(Restart.hover);
    });

    refs.restartDone.onmouseleave(() => {
        setRestart(Restart.regular);
    });

    /**
     * Handle user actions
     */
    refs.startWelcome.onclick(() => {
        setScreen(Screen.set);
    });

    refs.pausePlay.onclick(() => {
        if (intervalPointer() === null) {
            playTimer();
            setPause(Pause.regular);
        } else {
            pauseTimer();
            setPause(Pause.hover);
        }
    });
    refs.stopPlay.onclick(() => stopTimer());

    refs.restartDone.onclick(() => {
        setScreen(Screen.set);
    });

    refs.startWelcome.onclick(() => setScreen(Screen.set));

    refs.upSet.onclick(() => {
        const newSeconds = seconds() + 1;
        if (newSeconds > 10) {
            //todo - ask yoav how to disable (I can use target) but how to enable it later or on initial state ?
            return;
        }
        setSeconds(newSeconds);
    });

    refs.downSet.onclick(() => {
        const newSeconds = seconds() - 1;
        if (newSeconds < 1) {
            //todo - ask yoav how to disable (I can use target) but how to enable it later or on initial state ?
            return;
        }
        setSeconds(newSeconds);
    });

    refs.playSet.onclick(() => {
        setTimeLeft(seconds());
        setScreen(Screen.play);
        playTimer();
    });
    /**
     * Fetch the data and prepare App View State
     */
    return {
        render: () => ({
            screen: screen(),
            start: start(),
            time: `${seconds()}`,
            play: play(),
            timeLeft: `${timeLeft()}`,
            stop: stop(),
            pause: pause(),
            restart: restart(),
            up: up(),
            down: down(),
        }),
    };
}

export const AppComponent = makeJayComponent(render, AppComponentConstructor);
