---
name: Vitality Bridge
colors:
  surface: '#fdf7ff'
  surface-dim: '#ded8e0'
  surface-bright: '#fdf7ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f2fa'
  surface-container: '#f2ecf4'
  surface-container-high: '#ece6ee'
  surface-container-highest: '#e6e0e9'
  on-surface: '#1d1b20'
  on-surface-variant: '#494551'
  inverse-surface: '#322f35'
  inverse-on-surface: '#f5eff7'
  outline: '#7a7582'
  outline-variant: '#cbc4d2'
  surface-tint: '#6750a4'
  primary: '#4f378a'
  on-primary: '#ffffff'
  primary-container: '#6750a4'
  on-primary-container: '#e0d2ff'
  inverse-primary: '#cfbcff'
  secondary: '#63597c'
  on-secondary: '#ffffff'
  secondary-container: '#e1d4fd'
  on-secondary-container: '#645a7d'
  tertiary: '#765b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#c9a74d'
  on-tertiary-container: '#503d00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#cfbcff'
  on-primary-fixed: '#22005d'
  on-primary-fixed-variant: '#4f378a'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#cdc0e9'
  on-secondary-fixed: '#1f1635'
  on-secondary-fixed-variant: '#4b4263'
  tertiary-fixed: '#ffdf93'
  tertiary-fixed-dim: '#e7c365'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#594400'
  background: '#fdf7ff'
  on-background: '#1d1b20'
  surface-variant: '#e6e0e9'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 30px
  body-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  headline-xl-mobile:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  body-lg-mobile:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 40px
---

## Brand & Style

The design system is built on the intersection of high-performance intelligence and compassionate care. It bridges two distinct user mentalities: the rigorous, data-driven "Gym and Coach" environment and the gentle, reassuring "Older Adults and Family" experience. 

The aesthetic is **Modern Humanist**. It avoids the sterile coldness of clinical platforms and the aggressive, neon-drenched tropes of traditional fitness apps. Instead, it utilizes soft surfaces, organic shapes, and a "Tonal Layering" approach to create depth without overwhelming the user. 

- **Gym and Coach:** High-contrast, structured, and efficient. It emphasizes clarity and rapid data consumption using sharp accents and professional depth.
- **Older Adults and Family:** Soft, spacious, and calming. It prioritizes legibility and low cognitive load through increased white space and warmer tonal shifts.

## Colors

This design system utilizes a dual-palette strategy to serve its two primary audiences while maintaining a shared DNA.

### Core Palette
- **Deep Teal (Primary):** Used for the Coach interface to convey authority, stability, and intelligence.
- **Soft Coral (Secondary):** The primary driver for the Family interface, providing warmth and a sense of care without the urgency of red.
- **Slate (Tertiary):** Used for data visualization and high-level typography.

### Application Rules
For the **Coach Dashboard**, use high-contrast combinations of Deep Teal against pure white backgrounds. Status indicators for "Success" should use a vibrant Mint rather than a standard lime green to maintain the professional aesthetic.

For the **Family App**, use Soft Coral and Muted Teal. Avoid pure blacks; use the Slate Grey for text to soften the visual impact. Backgrounds should lean toward "Warm White" (#FFFBF7) to reduce eye strain for older users.

## Typography

The typography strategy prioritizes **Universal Design**. 

**Manrope** is used for headlines and UI labels to provide a modern, geometric, and professional feel. It feels systematic for the Coach and friendly for the Family.

**Atkinson Hyperlegible Next** is the primary body font. It was specifically designed for low-vision readers, making it ideal for older adults. Its distinct character shapes ensure that "I", "l", and "1" are never confused, which is critical for reading nutritional data and dosages.

- **For Coaches:** Stick to `body-md` for dense data tables.
- **For Older Adults:** Default to `body-lg` for all narrative content. Touch targets for links within text must have a minimum height of 44px.

## Layout & Spacing

This design system uses a **Fluid-Fixed Hybrid Grid**. 

- **Coach Dashboard (Desktop):** A 12-column grid with a fixed left-hand navigation. Content is organized in a "Bento Box" style layout using 24px gutters to allow for high data density without visual clutter.
- **Family Experience (Mobile-First):** A single-column flow with generous vertical margins (`stack-lg`). This prevents accidental taps and creates a focused, step-by-step experience for nutritional logging or AI chat.

**Touch Targets:** All interactive elements in the Family theme must maintain a minimum 48x48px hit area, regardless of the visual size of the icon or label.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layering** and **Soft Ambient Shadows**.

1.  **The Base:** The lowest layer, usually a subtle off-white or very light grey.
2.  **The Surface:** Cards and containers are pure white. They use a very soft, large-radius shadow (15% opacity of the primary color) to appear "lifted."
3.  **The Interactive:** Buttons and active states use a slight vertical offset shadow to suggest pressability.

**Glassmorphism** is used sparingly in the Coach Dashboard for sticky headers or sidebars to maintain context of the data scrolling beneath, using a 20px background blur and a 1px low-contrast border.

## Shapes

The shape language is consistently **Rounded**. 

- **Standard Cards:** Use `rounded-lg` (16px) to feel approachable and safe.
- **Interactive Elements:** Buttons use `rounded-xl` (24px) or full pill shapes to distinguish them from informational cards.
- **Data Visualizations:** Bar charts and progress bars must have rounded caps to avoid a "sharp" or "punitive" medical feeling.

## Components

### Buttons
- **Primary:** High-fill color (Deep Teal for Coaches, Soft Coral for Family). High-contrast white text.
- **Secondary:** Outlined with a 2px stroke. Used for "Cancel" or "Back" actions.
- **Tertiary:** Text-only with an underline or chevron to indicate navigation.

### Cards
Cards are the primary container. In the Family theme, cards should have more internal padding (32px) and larger icons. In the Coach theme, cards use 16px padding and tighter borders to maximize data display.

### Status Indicators
Avoid "Red" for errors whenever possible. Use **Burnt Orange** for "Attention Needed" and **Slate Blue** for "Info." Success states should always use **Mint Green**.

### Input Fields
Inputs must have a permanent label (never just placeholder text) for accessibility. The border should thicken to 2px on focus using the theme's primary color.

### Data Visualizations
Charts should use a palette of Teal, Coral, and Gold. Avoid thin lines; use thick, rounded strokes that are easier for older eyes to follow. Every chart must be accompanied by a "Text Summary" for screen readers.