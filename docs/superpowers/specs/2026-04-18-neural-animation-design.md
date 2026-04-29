# Kado Neural Animation System — Design Spec
*2026-04-18*

## Summary

Replace the current GlobalNeural canvas + CharReveal typing effect with a unified neural animation engine. Background is a three-layer composition:
1. **A4 axon strands** — long, ultra-thin flowing fibers that cover the entire screen (thinner than demo, 0.2–0.5px)
2. **A3 node field** — dense chaotic cloud of 250–350 tiny nodes on top of the fibers
3. **A2 letter assembly** — nodes from the field fly toward letter contours to form text

Hero "KADO" assembles from particles on page load. Section titles assemble when scrolled into view.

---

## Visual Design

**Color palette:** unchanged — `#0a0a0a` background, white (`rgba(255,255,255,*)`) nodes and lines. No new colors introduced.

**Node morphology:** tiny filled circles, radius 0.6–1.8px. No dendrite tree structures — keep it consistent with the existing editorial aesthetic. Connections are thin lines (0.3–0.8px). Synaptic signals are 1.5px dots traveling along connections.

**Density:** 250–350 nodes on desktop, 100–150 on mobile. Nodes cover the full viewport, distributed evenly with slight randomness.

**Field behavior (A3):**
- Nodes drift slowly with small random velocity (±0.2 px/frame)
- Cursor within 200px radius: nodes lean toward cursor with spring force proportional to `(1 - d/200)²`
- When cursor moves fast: nodes trail behind, creating a "wake" effect
- Scroll: entire field shifts vertically at 40% scroll speed — nodes feel anchored to content, not viewport
- Nodes wrap vertically when they leave viewport bounds (seamless)
- Every 2–6s a node fires a synaptic pulse that travels to 1–3 neighbours

**A4 axon layer (drawn first, underneath nodes):**
- 40–55 long fiber strands on desktop, 20–25 on mobile
- Each strand originates from the bottom-left quadrant (like existing GlobalNeural Pegasus fibers)
- Drawn with sinusoidal wave deformation that evolves over time (slow, `speed 0.12–0.4`)
- Line width: `0.2–0.5px` — noticeably thinner than A4 demo (which was 0.3–0.7px)
- Opacity: `0.04–0.12` per strand — very subtle, structural depth layer
- Color: `rgba(255,255,255,*)` — same white palette
- Cursor influence: strands in 300px radius subtly warp toward cursor (`±3px` deflection max)
- Impulses still travel along strands (unchanged from current GlobalNeural) — they light up letter points in A2 assembly

**Neural storm phase (A3 chaos):**
- On page load: nodes spawn with high random velocity, field is turbulent for 800ms
- Then spring forces pull them toward home positions — chaos settles into order
- This happens once per page load

---

## Architecture

### 1. `GlobalNeural.jsx` — rewrite

Single full-page `<canvas>` fixed behind content (z-index 0). Owns the entire node simulation. Exposes `window.__neuronField` API object:

```js
window.__neuronField = {
  pulse(x, y, strength),        // trigger ripple from point
  assembleAt(pts, onDone),       // send nodes toward target points, call onDone when 95% arrived
  release(),                     // release assembled nodes back to field
  setScrollY(y),                 // called by scroll listener
}
```

**Render loop (requestAnimationFrame):**
1. Fill with `rgba(10,10,10, 0.18)` — motion blur trail
2. Update node positions (velocity + spring + cursor force)
3. Draw connections between nodes closer than 90px (`opacity = (1 - d/90) * 0.12`)
4. Draw synaptic signals
5. Draw nodes (assembling nodes draw with higher opacity + white glow)

**Node states:**
- `free` — normal drift in field
- `assembling` — flying toward target letter point (easeOutCubic, 600–900ms)
- `assembled` — locked at letter point, subtle breathing drift (±1px)
- `releasing` — spring back toward original home position

### 2. `NeuralText.jsx` — new component

Replaces `CharReveal` and `NeuronReveal` for hero/section titles. Takes a `text` prop and a `triggered` boolean. When `triggered` flips true:

1. Samples the text outline at 1 point per ~8px² using an offscreen canvas
2. Calls `window.__neuronField.assembleAt(pts)` — nodes fly to those points
3. Shows a ghost text underlay at 4% opacity so layout is preserved
4. When assembly is done (callback): ghost text fades out, assembled nodes remain

When element leaves viewport: calls `release()` — nodes drift back to field.

```jsx
<NeuralText
  text="KADO"
  fontSize="clamp(80px,18vw,220px)"
  fontWeight={900}
  triggered={heroVisible}
/>
```

**Non-title text** (body copy, labels): keep existing `CharReveal`/`NeuronReveal` — assembly is only for large display text (h1, h2, hero).

### 3. `useNeuralAssemble.js` — hook

Wraps IntersectionObserver. Returns `[ref, triggered]`. When element enters viewport at threshold 0.1, sets `triggered = true`. Once triggered, never un-triggers (assembly is a one-shot effect per session).

### 4. Scroll wiring in `App.jsx`

```js
useEffect(() => {
  const onScroll = () => window.__neuronField?.setScrollY(window.scrollY);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}, []);
```

---

## Component Changes

| Component | Change |
|-----------|--------|
| `GlobalNeural.jsx` | Full rewrite — A3 field engine |
| `Hero.jsx` | Replace `CharReveal text="KADO"` with `<NeuralText text="KADO">` |
| `Features.jsx` | Keep existing word-by-word reveal for section title — it's not a hero |
| `HowItWorks.jsx` | Keep existing reveal — section title only |
| `LandingCTA.jsx` | Replace `FallingLetters` for "READY TO / START?" with `NeuralText` |
| `CharReveal.jsx` | Unchanged — still used for body copy |
| `NeuronReveal.jsx` | Unchanged — still used for labels/small elements |
| `ScrollNeuron.jsx` | Delete — functionality merged into GlobalNeural |
| `App.jsx` | Remove ScrollNeuron import; add scroll listener |

---

## Performance Constraints

- Max 350 nodes total — never exceed
- Connection loop: O(n²) — skip pairs where `|dx| > CONN || |dy| > CONN` before sqrt
- Assembly: only sample up to 300 letter points regardless of text size
- Mobile (`pointer: coarse`): 120 nodes, connection distance 70px, no cursor interaction
- `will-change: transform` on canvas element
- Use `dt` clamped to 40ms for frame independence

---

## Files to Create / Modify

**Create:**
- `src/lib/NeuralText.jsx`
- `src/lib/useNeuralAssemble.js`

**Rewrite:**
- `src/components/global/GlobalNeural.jsx`

**Edit:**
- `src/components/landing/Hero.jsx` — swap CharReveal → NeuralText for KADO
- `src/components/landing/LandingCTA.jsx` — swap FallingLetters → NeuralText
- `src/App.jsx` — remove ScrollNeuron, add scroll listener

**Delete:**
- `src/lib/ScrollNeuron.js`

---

## Success Criteria

1. On load: nodes appear chaotically, settle within 1s
2. Moving mouse across page: nodes visibly lean/follow cursor in real-time
3. Scrolling: field shifts with content — feels organic, not stuck to viewport
4. "KADO" in hero: assembles from field particles within 1.5s of page load
5. "READY TO START?" in CTA: assembles when section scrolls into view
6. Release: when user scrolls past hero, KADO nodes drift back to field
7. No color changes — strictly black/white palette
8. 60fps on mid-range desktop, 30fps+ on mobile
