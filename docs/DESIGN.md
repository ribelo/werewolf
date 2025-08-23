# Werewolf Design System - Complete Implementation Guide

A dark, high-contrast design system for the powerlifting contest management application using the "Blood Theme" color palette.

## Design Philosophy

- **High contrast**: White text on black backgrounds for maximum readability
- **Sharp edges**: No rounded corners - keep everything angular and aggressive
- **Selective red**: Use the primary red color sparingly for maximum impact
- **Bold typography**: Large, uppercase text with generous letter spacing
- **Layered depth**: Stack background colors from darkest to lightest

## Color Palette (Blood Theme)

### Primary Colors
- **Primary Red**: `#DC143C` - Main actions, active states, brand color
- **Secondary Red**: `#8B0000` - Hover states, secondary actions
- **Accent Red**: `#FF0040` - Highlights, glowing effects
- **Primary Glow**: `rgba(220, 20, 60, 0.5)` - Red glow effects

### Background Colors
- **Main Background**: `#000000` - Pure black, main app background
- **Card Background**: `#1A1A1A` - Dark gray for card backgrounds
- **Element Background**: `#2C2C2C` - Medium gray for input fields, secondary elements

### Border & Text Colors
- **Border Color**: `#404040` - All borders and dividers
- **Primary Text**: `#FFFFFF` - Main text, headings
- **Secondary Text**: `#B0B0B0` - Labels, secondary information

### Status Colors
- **Success**: `#0F4C0F` - Successful lifts
- **Warning**: `#FFA500` - Warnings, close to limit
- **Error**: `#8B0000` - Failed lifts

## Typography System

### Font Families
1. **Display Font**: `Bebas Neue` - Headings, athlete names, important text
2. **Body Font**: `Inter` - Body text, labels, descriptions
3. **Mono Font**: `JetBrains Mono` - Numbers, weights, statistics

### Font Scale (Tailwind Classes)

#### Display Text (Bebas Neue)
```css
.text-hero     { @apply text-9xl tracking-[0.5rem] font-normal; }     /* 128px - Main logo only */
.text-display  { @apply text-8xl tracking-[0.25rem] font-normal; }    /* 96px - Page titles */
.text-h1       { @apply text-6xl tracking-[0.125rem] font-normal; }   /* 60px - Section headers */
.text-h2       { @apply text-4xl tracking-wider font-normal; }        /* 36px - Athlete names */
.text-h3       { @apply text-2xl tracking-wide font-normal; }         /* 24px - Sub-sections */
```

#### Weight Numbers (JetBrains Mono)
```css
.weight-hero   { @apply text-9xl font-bold leading-none; }            /* 128px - Main weight display */
.weight-large  { @apply text-8xl font-bold leading-none; }            /* 96px - Secondary weights */
.weight-medium { @apply text-4xl font-semibold leading-none; }        /* 36px - Stats */
.weight-small  { @apply text-xl font-semibold leading-none; }         /* 20px - Previous attempts */
```

#### Body Text (Inter)
```css
.text-body     { @apply text-base font-normal leading-relaxed; }      /* 16px - Body text */
.text-label    { @apply text-xs font-semibold uppercase tracking-widest; } /* 12px - Labels */
.text-caption  { @apply text-sm font-medium leading-tight; }          /* 14px - Captions */
```

## Component Classes

### Layout Containers
```css
.container-narrow { @apply max-w-2xl mx-auto px-4 md:px-8; }          /* 672px max */
.container-medium { @apply max-w-4xl mx-auto px-4 md:px-8; }          /* 896px max */
.container-wide   { @apply max-w-6xl mx-auto px-4 md:px-8; }          /* 1152px max */
.container-full   { @apply max-w-7xl mx-auto px-4 md:px-8; }          /* 1280px max */
```

### Card Components
```css
.card {
  @apply bg-gray-900 border-2 border-gray-600 p-8 
         shadow-2xl relative transition-all duration-300 ease-in-out;
}

.card:hover {
  @apply border-primary-red transform -translate-y-1;
  box-shadow: 0 8px 32px rgba(220, 20, 60, 0.3);
}

.card::before {
  content: '';
  @apply absolute top-0 left-0 right-0 h-1 
         bg-gradient-to-r from-transparent via-primary-red to-transparent;
}

.card-header { @apply border-b-2 border-gray-600 pb-6 mb-6; }
```

### Button Components
```css
.btn-primary {
  @apply bg-primary-red text-black border-2 border-primary-red 
         px-8 py-4 font-display text-lg tracking-wider uppercase
         transition-all duration-300 ease-in-out cursor-pointer
         hover:bg-accent-red hover:border-accent-red hover:-translate-y-0.5;
  box-shadow: 0 0 20px rgba(255, 0, 64, 0.5);
}

.btn-secondary {
  @apply bg-transparent text-gray-300 border-2 border-gray-600
         px-8 py-4 font-display text-lg tracking-wider uppercase
         transition-all duration-300 ease-in-out cursor-pointer
         hover:text-white hover:border-primary-red hover:bg-red-500/10;
}

.btn-ghost {
  @apply bg-transparent text-gray-300 border-2 border-transparent
         px-8 py-4 font-display text-lg tracking-wider uppercase
         transition-all duration-300 ease-in-out cursor-pointer
         hover:text-white hover:border-gray-600;
}
```

### Input Components
```css
.input-field {
  @apply bg-gray-800 border-2 border-gray-600 text-white px-4 py-4
         font-body text-base transition-all duration-300 ease-in-out
         focus:border-primary-red focus:outline-none focus:ring-0;
  box-shadow: 0 0 0 0 transparent;
}

.input-field:focus {
  box-shadow: 0 0 0 3px rgba(220, 20, 60, 0.2);
}

.input-label {
  @apply block text-label text-gray-300 mb-2;
}
```

### Status Components
```css
.status-badge {
  @apply inline-flex items-center px-6 py-3 font-display text-base 
         tracking-wider uppercase;
}

.status-active   { @apply bg-green-900 text-green-100; }
.status-warning  { @apply bg-orange-900 text-orange-100; }
.status-error    { @apply bg-red-900 text-red-100; }
.status-neutral  { @apply bg-gray-800 text-gray-100; }
```

### Attempt Status
```css
.attempt-pending { @apply text-gray-400 bg-gray-800 px-3 py-2 font-mono text-sm; }
.attempt-good    { @apply text-green-100 bg-green-900 px-3 py-2 font-mono text-sm font-bold; }
.attempt-failed  { @apply text-red-100 bg-red-900 px-3 py-2 font-mono text-sm line-through; }
```

### Visual Effects
```css
.glow-effect {
  box-shadow: 0 0 20px rgba(220, 20, 60, 0.5);
}

.glow-active {
  @apply animate-pulse-glow;
}

.divider {
  @apply h-0.5 bg-gray-600 my-8;
}

.divider-accent {
  @apply h-1 bg-gradient-to-r from-transparent via-primary-red to-transparent my-8;
}
```

## Grid Layouts
```css
.stats-grid {
  @apply grid gap-4 grid-cols-1 md:grid-cols-3;
}

.leaderboard-grid {
  @apply grid gap-6 grid-cols-1 lg:grid-cols-2;
}

.attempt-grid {
  @apply grid gap-2 grid-cols-3;
}
```

## Specialized Components

### Weight Display
```css
.weight-display {
  @apply text-center;
}

.weight-value {
  @apply font-mono font-bold text-white;
}

.weight-unit {
  @apply font-mono font-normal text-gray-300 ml-2;
}

.weight-hero .weight-unit   { @apply text-4xl; }
.weight-large .weight-unit  { @apply text-3xl; }
.weight-medium .weight-unit { @apply text-xl; }
.weight-small .weight-unit  { @apply text-base; }
```

### Timer Components
```css
.timer-display {
  @apply weight-hero text-center p-8 bg-black text-white;
}

.timer-bar {
  @apply h-2 bg-primary-red transition-all duration-1000 ease-linear;
}

.timer-warning {
  @apply animate-pulse-slow bg-orange-500;
}

.timer-critical {
  @apply animate-ping bg-red-500;
}
```

### Display Window (Big Screen)
```css
.display-view {
  @apply bg-black text-white min-h-screen;
}

.display-title {
  @apply text-hero text-center text-white mb-12;
}

.display-competitor {
  @apply text-h1 text-center text-white mb-8;
}

.display-weight {
  @apply weight-hero text-center text-accent-red;
}
```

### Leaderboard
```css
.leaderboard-row {
  @apply border-b-2 border-gray-700 hover:bg-gray-900 transition-colors duration-200;
}

.leaderboard-place {
  @apply text-h3 font-bold text-white w-16 text-center;
}

.leaderboard-place.first  { @apply text-yellow-400; }
.leaderboard-place.second { @apply text-gray-300; }
.leaderboard-place.third  { @apply text-amber-600; }
```

## Mobile Responsive Adjustments

### Font Size Reductions (Mobile)
```css
@media (max-width: 768px) {
  .text-hero     { @apply text-7xl; }     /* 96px → 72px */
  .text-display  { @apply text-6xl; }     /* 80px → 60px */
  .text-h1       { @apply text-5xl; }     /* 60px → 48px */
  .text-h2       { @apply text-3xl; }     /* 36px → 30px */
  
  .weight-hero   { @apply text-7xl; }     /* 128px → 96px */
  .weight-large  { @apply text-6xl; }     /* 96px → 72px */
  
  .card { @apply p-6; }                   /* 32px → 24px padding */
}
```

### Layout Adjustments
```css
.mobile-stack {
  @apply flex flex-col md:flex-row gap-4 md:gap-8;
}

.mobile-center {
  @apply text-center md:text-left;
}

.mobile-full {
  @apply w-full md:w-auto;
}
```

## Animation Classes
```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(220, 20, 60, 0.5); }
  50% { box-shadow: 0 0 40px rgba(220, 20, 60, 0.8); }
}

.animate-pulse-glow {
  animation: pulse-glow 2s ease-in-out infinite;
}

.animate-timer {
  animation: timer-countdown 60s linear forwards;
}

@keyframes timer-countdown {
  0% { width: 100%; }
  100% { width: 0%; }
}
```

## Critical Design Rules

### DO's ✅
1. Use high contrast - white text on black/dark gray backgrounds
2. Keep corners sharp - no border-radius anywhere
3. Use red sparingly - only for active states, CTAs, and critical information
4. Make text LARGE - minimum 16px for body, 24px+ for headings
5. Add generous spacing - 32px padding in cards, 16px+ between elements
6. Layer backgrounds - stack black → dark gray → medium gray
7. Uppercase labels - all form labels and badges in UPPERCASE with wide tracking

### DON'Ts ❌
1. No rounded corners - border-radius should always be 0
2. No thin fonts - minimum 400 weight, prefer 600+ for body text
3. No subtle effects - make shadows, glows, and transitions obvious
4. No gradient backgrounds on large areas - solid colors only
5. No small text - 12px absolute minimum, prefer 16px+
6. No centered body text - only center headings and weight numbers
7. No pastel colors - keep palette limited to blacks, grays, and reds

## Example Component Usage

### Athlete Card
```html
<div class="card">
  <div class="card-header mobile-stack">
    <div>
      <h2 class="text-h2 text-white mb-2">MAGNUS ERIKSSON</h2>
      <p class="text-label text-gray-300">93KG CLASS • SWE</p>
    </div>
    <div class="status-badge status-active">3RD ATTEMPT</div>
  </div>
  
  <div class="weight-display mb-8">
    <p class="text-label text-gray-300 mb-4">DEADLIFT ATTEMPT</p>
    <div class="weight-large text-white">
      285<span class="weight-unit">kg</span>
    </div>
  </div>
  
  <div class="stats-grid">
    <div class="text-center">
      <p class="text-label text-gray-300 mb-2">PREVIOUS</p>
      <p class="weight-medium text-white">272.5</p>
    </div>
    <!-- More stats... -->
  </div>
</div>
```

### Action Button Group
```html
<div class="flex gap-4 mobile-stack">
  <button class="btn-primary mobile-full">CONFIRM LIFT</button>
  <button class="btn-secondary mobile-full">FAILED ATTEMPT</button>
  <button class="btn-ghost">CANCEL</button>
</div>
```

This design system provides a complete, consistent foundation for building a powerful, professional powerlifting application interface that maintains readability and usability while projecting strength and authority.