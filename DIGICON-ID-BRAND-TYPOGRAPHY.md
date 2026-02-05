# DigiCon iD – Brand Typography Guide

## Overview

**DigiCon iD** (Digital Contact ID) is a digital identity product with a cartoon mascot as the brand icon. The typography treatment balances credibility with approachability – the wordmark is clean and professional while the teal dot adds a playful signature element that connects to the mascot's personality.

---

## Logo Specifications

### Typography
- **Font:** Inter (Google Fonts)
- **Weight:** Bold (700)
- **Letter spacing:** -0.02em
- **Colour:** #000000 (light mode) / #FFFFFF (dark mode)

### The Teal Dot
The dot above the "i" in "iD" is replaced with a larger teal dot, serving as a subtle brand mark within the wordmark. It must sit clearly above the "ı" stem with no visual clash.

- **Colour:** #00c9b7
- **Size:** 0.26em (relative to font size)
- **Position:** top: -0.04em (slightly above the stem; adjust between -0.08em and 0 for spacing)
- **Shape:** Perfect circle (border-radius: 50%)

### Spacing
There is a standard space between "DigiCon" and "iD" to create a clear two-part structure:
- "DigiCon" = the brand
- "iD" = the product descriptor

---

## HTML Implementation

```html
<!-- Include Inter font -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap" rel="stylesheet">

<!-- Logo markup -->
<span class="digicon-logo">DigiCon <span class="i-dot">ı</span>D</span>
```

> **Note:** The "ı" character is a Turkish dotless i (Unicode: U+0131). This allows the CSS pseudo-element to add the custom teal dot without conflicting with the original dot.

---

## CSS Implementation

```css
.digicon-logo {
  font-family: 'Inter', sans-serif;
  font-size: 48px; /* Adjust as needed */
  font-weight: 700;
  color: #000000;
  letter-spacing: -0.02em;
}

/* Dark mode */
.digicon-logo.dark {
  color: #ffffff;
}

/* Custom teal dot */
.digicon-logo .i-dot {
  position: relative;
  display: inline-block;
}

.digicon-logo .i-dot::after {
  content: '';
  position: absolute;
  width: 0.26em;
  height: 0.26em;
  background: #00c9b7;
  border-radius: 50%;
  top: -0.04em;  /* slightly above the stem; use -0.08em to 0 to tune spacing */
  left: 50%;
  transform: translateX(-50%);
}
```

---

## Size Guidelines

| Context | Font Size | Usage |
|---------|-----------|-------|
| Favicon / Small UI | 18px | Minimal applications |
| Nav / Header | 24px | Site navigation |
| Section headers | 36px | Page sections |
| Hero / Landing | 48–72px | Primary hero placement |
| Large display | 64–80px | Marketing materials |

The dot scales proportionally with font size due to `em` units.

---

## Colour Reference

| Element | Hex | RGB | Usage |
|---------|-----|-----|-------|
| Text (light mode) | #000000 | 0, 0, 0 | Default text |
| Text (dark mode) | #FFFFFF | 255, 255, 255 | Dark backgrounds |
| Teal dot | #00c9b7 | 0, 201, 183 | i dot accent |

---

## Do's and Don'ts

### Do
- ✓ Maintain the space between "DigiCon" and "iD"
- ✓ Keep the teal dot colour consistent (#00c9b7)
- ✓ Position the dot slightly above the "ı" stem (e.g. top: -0.04em) so it does not clash
- ✓ Scale proportionally – never stretch or distort
- ✓ Use Inter Bold (700) only

### Don't
- ✗ Change the dot colour to match other brand colours
- ✗ Remove the space between "DigiCon" and "iD"
- ✗ Use a regular "i" with its default dot
- ✗ Apply effects like shadows or gradients to the wordmark
- ✗ Use font weights other than Bold (700)
