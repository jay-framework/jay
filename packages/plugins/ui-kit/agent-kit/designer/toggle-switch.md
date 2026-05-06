# Toggle Switch

On/off toggle styled as a switch. Pure CSS using a checkbox input, no component needed.

## Usage

```html
<label class="switch">
  <input type="checkbox" />
  <span class="slider"></span>
</label>
```

With a label:

```html
<label class="switch-row">
  <span>Dark mode</span>
  <span class="switch">
    <input type="checkbox" />
    <span class="slider"></span>
  </span>
</label>
```

## CSS

```css
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  inset: 0;
  background: #ccc;
  border-radius: 24px;
  cursor: pointer;
  transition: background 0.2s;
}
.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}
input:checked + .slider {
  background: #4caf50;
}
input:checked + .slider::before {
  transform: translateX(20px);
}
```

## With layout

```css
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
```

**How it works:** A hidden checkbox drives the state. CSS `:checked` selector moves the slider knob and changes the background color.
