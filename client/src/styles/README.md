# Centralized Styling System

This directory contains the centralized styling system for the application. The goal is to create a consistent, maintainable, and scalable CSS architecture.

## Organization

The styling system is organized into the following files:

- `index.css`: Imports all other CSS files in the proper order
- `typography.css`: Typography styles (headings, paragraphs, text utilities)
- `layout.css`: Layout utilities (flex, grid, containers, spacing)
- `buttons.css`: Button styles and variants
- `forms.css`: Form controls and input styles
- `cards.css`: Card components and content containers
- `animations.css`: Animation utilities and keyframes

## Design Tokens

Design tokens are defined in `../theme.css` and include:

- Color system with light/dark theme support
- Typography scale (font sizes, weights, line heights)
- Spacing scale
- Border radius values
- Shadow definitions
- Animation timings and easing functions
- Z-index layers

## How to Use

### Importing

To use the centralized styling system in your application:

1. Import the main CSS file in your application entry point:
   ```js
   import './main.css';
   ```

### Using the Design System

#### Colors

Use CSS variables for colors:

```css
.my-component {
  color: var(--text-color);
  background-color: var(--primary);
}
```

#### Typography

Use typography classes:

```html
<h1 class="text-3xl font-bold">Heading</h1>
<p class="text-md">Regular paragraph text</p>
<span class="text-sm text-muted">Small muted text</span>
```

#### Layout

Use layout utilities:

```html
<div class="container">
  <div class="flex justify-between items-center">
    <div class="flex-1">Content</div>
    <div>Sidebar</div>
  </div>
</div>
```

#### Buttons

Use button classes:

```html
<button class="btn btn-primary">Primary Button</button>
<button class="btn btn-outline btn-sm">Small Outline Button</button>
```

#### Forms

Use form classes:

```html
<form class="form">
  <div class="form-group">
    <label class="form-label">Username</label>
    <input type="text" class="form-control" />
  </div>
</form>
```

#### Cards

Use card classes:

```html
<div class="card card-padding-md">
  <h3 class="card-title">Card Title</h3>
  <div class="card-body">Content goes here</div>
</div>
```

#### Animations

Use animation classes:

```html
<div class="animate-fade-in">This will fade in</div>
<button class="btn btn-primary animate-pulse">Pulsing button</button>
```

## Guidelines

1. **Always use variables**: Use CSS variables for colors, spacing, etc.
2. **Don't modify the core files**: Extend them with your own styles if needed
3. **Component-specific styles**: If a style is only used in one component, keep it in that component's CSS file
4. **Avoid magic numbers**: Use spacing variables instead of arbitrary pixel values
5. **Use responsive utilities**: The system includes responsive utilities for different screen sizes

## Extending the System

To add new utility classes or components to the system:

1. Determine which file your styles belong in
2. Add your styles using the existing patterns and naming conventions
3. Document any new utilities or components in this README 