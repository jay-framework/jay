# Letter Split

Splits dynamic text into one span per letter for individual character styling. Headless component — requires import.

## Import

```html
<head>
  <script type="application/jay-headless"
          plugin="@jay-framework/ui-kit"
          contract="letter-split"
  ></script>
</head>
```

## Usage

```html
<jay:letter-split text="{heroTitle}">
  <span forEach="letters" trackBy="index" class="letter">{text}</span>
</jay:letter-split>
```

**Props:** `text` — the string to split (bound from page ViewState)

**ViewState:** `letters` — array of `{ index: number, text: string }` (spaces are included as entries)

## Styling examples

Rainbow text:

```css
.letter:nth-child(7n+1) { color: red; }
.letter:nth-child(7n+2) { color: orange; }
.letter:nth-child(7n+3) { color: yellow; }
.letter:nth-child(7n+4) { color: green; }
.letter:nth-child(7n+5) { color: blue; }
.letter:nth-child(7n+6) { color: indigo; }
.letter:nth-child(7n+7) { color: violet; }
```

Typewriter animation:

```css
.letter {
  display: inline-block;
  opacity: 0;
  animation: typeIn 0.05s forwards;
}
.letter:nth-child(1) { animation-delay: 0s; }
.letter:nth-child(2) { animation-delay: 0.05s; }
.letter:nth-child(3) { animation-delay: 0.1s; }
/* scale with calc or CSS custom properties */

@keyframes typeIn {
  to { opacity: 1; }
}
```

Hover effect per letter:

```css
.letter {
  display: inline-block;
  transition: transform 0.2s;
}
.letter:hover {
  transform: translateY(-4px) scale(1.2);
  color: #e91e63;
}
```
