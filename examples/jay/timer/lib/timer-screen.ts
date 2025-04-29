import {
    DownOfTimerScreenViewState,
    PauseOfTimerScreenViewState,
    PlayOfTimerScreenViewState,
    render,
    RestartOfTimerScreenViewState,
    ScreenOfTimerScreenViewState,
    StartOfTimerScreenViewState,
    StopOfTimerScreenViewState,
    TimerScreenElementRefs,
    UpOfTimerScreenViewState,
} from './timer-screen.jay-html';
import { createSignal, makeJayComponent } from 'jay-component';

function AppComponentConstructor(_, refs: TimerScreenElementRefs) {
    const [screen, setScreen] = createSignal<ScreenOfTimerScreenViewState>(
        ScreenOfTimerScreenViewState.welcome,
    );
    const [seconds, setSeconds] = createSignal(3);
    const [timeLeft, setTimeLeft] = createSignal(3);

    const [start, setStart] = createSignal<StartOfTimerScreenViewState>(
        StartOfTimerScreenViewState.regular,
    );
    const [play, setPlay] = createSignal<PlayOfTimerScreenViewState>(
        PlayOfTimerScreenViewState.regular,
    );
    const [stop, setStop] = createSignal<StopOfTimerScreenViewState>(
        StopOfTimerScreenViewState.regular,
    );
    const [pause, setPause] = createSignal<PauseOfTimerScreenViewState>(
        PauseOfTimerScreenViewState.regular,
    );
    const [restart, setRestart] = createSignal<RestartOfTimerScreenViewState>(
        RestartOfTimerScreenViewState.regular,
    );
    const [up, setUp] = createSignal<UpOfTimerScreenViewState>(UpOfTimerScreenViewState.regular);
    const [down, setDown] = createSignal<DownOfTimerScreenViewState>(
        DownOfTimerScreenViewState.regular,
    );

    const [intervalPointer, setIntervalPointer] = createSignal<any>(null);

    function pauseTimer() {
        clearInterval(intervalPointer());
        setIntervalPointer(null);
    }

    function stopTimer() {
        pauseTimer();
        setScreen(ScreenOfTimerScreenViewState.set);
    }

    function endTimer() {
        pauseTimer();
        setScreen(ScreenOfTimerScreenViewState.done);
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
        setStart(StartOfTimerScreenViewState.hover);
    });

    refs.startWelcome.onmouseleave(() => {
        setStart(StartOfTimerScreenViewState.regular);
    });

    //stop
    refs.stopPlay.onmouseenter(() => {
        setStop(StopOfTimerScreenViewState.hover);
    });

    refs.stopPlay.onmouseleave(() => {
        setStop(StopOfTimerScreenViewState.regular);
    });

    //pause
    refs.pausePlay.onmouseenter(() => {
        setPause(PauseOfTimerScreenViewState.hover);
    });

    refs.pausePlay.onmouseleave(() => {
        if (intervalPointer() === null) {
            setPause(PauseOfTimerScreenViewState.hover);
        } else {
            setPause(PauseOfTimerScreenViewState.regular);
        }
    });

    //play
    refs.playSet.onmouseenter(() => {
        setPlay(PlayOfTimerScreenViewState.hover);
    });

    refs.playSet.onmouseleave(() => {
        setPlay(PlayOfTimerScreenViewState.regular);
    });

    //up
    refs.upSet.onmouseenter(() => {
        setUp(UpOfTimerScreenViewState.hover);
    });

    refs.upSet.onmouseleave(() => {
        setUp(UpOfTimerScreenViewState.regular);
    });

    //down
    refs.downSet.onmouseenter(() => {
        setDown(DownOfTimerScreenViewState.hover);
    });

    refs.downSet.onmouseleave(() => {
        setDown(DownOfTimerScreenViewState.regular);
    });

    //restart
    refs.restartDone.onmouseenter(() => {
        setRestart(RestartOfTimerScreenViewState.hover);
    });

    refs.restartDone.onmouseleave(() => {
        setRestart(RestartOfTimerScreenViewState.regular);
    });

    /**
     * Handle user actions
     */
    refs.startWelcome.onclick(() => {
        setScreen(ScreenOfTimerScreenViewState.set);
    });

    refs.pausePlay.onclick(() => {
        if (intervalPointer() === null) {
            playTimer();
            setPause(PauseOfTimerScreenViewState.regular);
        } else {
            pauseTimer();
            setPause(PauseOfTimerScreenViewState.hover);
        }
    });
    refs.stopPlay.onclick(() => stopTimer());

    refs.restartDone.onclick(() => {
        setScreen(ScreenOfTimerScreenViewState.set);
    });

    refs.startWelcome.onclick(() => setScreen(ScreenOfTimerScreenViewState.set));

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
        setScreen(ScreenOfTimerScreenViewState.play);
        playTimer();
    });
    /**
     * Fetch the data and prepare App View State
     */
    return {
        render: () => ({
            screen,
            start,
            time: `${seconds()}`,
            play,
            timeLeft: `${timeLeft()}`,
            stop,
            pause,
            restart,
            up,
            down,
        }),
    };
}

export const AppComponent = makeJayComponent(render, AppComponentConstructor);
