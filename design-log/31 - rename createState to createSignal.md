# Rename createState to createSignal

Why?

Because `useState` is the React style, not reactive state management, while `createSignal` is the solid.js reactive.
Jay is using the latter, and therefore we should call the thingy by the accepted name, `createSignal`.
