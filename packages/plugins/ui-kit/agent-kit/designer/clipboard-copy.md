# Clipboard Copy

Copy-to-clipboard button with "Copied!" feedback. Headless component — requires import.

## Import

```html
<head>
  <script
    type="application/jay-headless"
    plugin="@jay-framework/ui-kit"
    contract="clipboard-copy"
  ></script>
</head>
```

## Usage

```html
<jay:clipboard-copy text="{shareUrl}">
  <button ref="copyBtn" class="copy-btn">
    <span if="!copied">Copy Link</span>
    <span if="copied">Copied!</span>
  </button>
</jay:clipboard-copy>
```

**Required refs:** `copyBtn`

**Props:** `text` — the string to copy (bound from page ViewState)

**ViewState:** `copied` (boolean) — true for 2 seconds after clicking copy
