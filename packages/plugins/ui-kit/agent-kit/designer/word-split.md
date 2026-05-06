# Word Split

Splits dynamic text into one span per word for individual word styling. Headless component — requires import.

## Import

```html
<head>
  <script type="application/jay-headless"
          plugin="@jay-framework/ui-kit"
          contract="word-split"
  ></script>
</head>
```

## Usage

```html
<jay:word-split text="{title}">
  <span forEach="words" trackBy="index" class="word">{text} </span>
</jay:word-split>
```

**Props:** `text` — the string to split (bound from page ViewState)

**ViewState:** `words` — array of `{ index: number, text: string }`

## Styling examples

Highlight every other word:

```css
.word:nth-child(odd) { color: #e91e63; }
```

Stagger animation per word:

```css
.word {
  display: inline-block;
  animation: fadeIn 0.3s both;
}
.word:nth-child(1) { animation-delay: 0s; }
.word:nth-child(2) { animation-delay: 0.1s; }
.word:nth-child(3) { animation-delay: 0.2s; }
/* or use calc: animation-delay: calc(var(--index) * 0.1s); */
```

Style a specific word by position:

```css
.word:first-child { font-size: 2em; font-weight: bold; }
.word:last-child { font-style: italic; }
```
