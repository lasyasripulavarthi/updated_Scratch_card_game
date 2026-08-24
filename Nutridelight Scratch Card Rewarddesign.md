# Nutridelight Scratch Card Reward Game (Design.md)

## 1. Layout
- **Scratch Card Placement:** Centered on the screen for maximum visibility.
- **Branding:** Nutridelight logo prominently displayed on the scratch surface before interaction.
- **Screen Composition:**
  - Top: Nutridelight tagline or subtle branding.
  - Center: Scratch card canvas.
  - Bottom: Instruction text (“Scratch to reveal your reward!”).

---

## 2. Scratch Interaction
- **Canvas Overlay:** A gray/silver scratch texture covering the reward.
- **Interaction Modes:**
  - **Touchscreen:** Finger swipe erases overlay.
  - **Desktop:** Mouse/trackpad drag erases overlay.
- **Erasing Effect:** Smooth, responsive brush strokes with slight particle effect for realism.
- **Auto-Reveal:** Once ~50–70% of the surface is scratched, the rest clears automatically.

---

## 3. Color Palette
- **Primary Colors:**
  - Fresh Green (#4CAF50) → evokes health and freshness.
  - Warm Orange (#FF9800) → energetic, inviting.
  - Bright Yellow (#FDD835) → cheerful, optimistic.
- **Secondary Colors:**
  - Soft White (#FAFAFA) → clean background.
  - Neutral Gray (#BDBDBD) → scratch surface texture.
- **Overall Vibe:** Fresh, warm, inviting — aligned with a healthy juice/food shop.

---

## 4. Typography
- **Font Style:** Rounded, sans-serif (e.g., Poppins, Nunito).
- **Tone:** Friendly and approachable.
- **Size:** Large enough to be readable from a distance (shop display).
- **Hierarchy:**
  - Headings: Bold, uppercase.
  - Instructions: Medium weight, sentence case.
  - Rewards: Bold, colorful, celebratory.

---

## 5. Reward Reveal Animation
- **Trigger:** Auto-reveal when 50–70% scratched.
- **Animation:**
  - Scratch surface fades out smoothly.
  - Reward text scales up slightly (zoom-in effect).
  - Confetti burst or subtle glow for celebratory rewards.
- **Result Display:** “Result: [reward]” appears clearly on screen.

---

## 6. States to Design
1. **Idle/Before Scratch:**
   - Scratch card centered with Nutridelight logo.
   - Instruction text below.
2. **Mid-Scratch:**
   - Partial erasure showing glimpses of reward.
   - Scratch particles visible.
3. **Fully Revealed/Result Screen:**
   - Reward text fully visible.
   - Animation (zoom-in + confetti/glow).
   - Admin result displayed at bottom.
4. **"Try Again" State:**
   - Neutral animation (fade-in only).
   - Text styled in gray or muted tone.
   - Encouraging message: “Better luck next time!”

---

## 7. Mobile vs Desktop Considerations
- **Mobile (Touchscreen):**
  - Larger scratch area for finger input.
  - Optimized for swipe gestures.
- **Desktop (Mouse/Trackpad):**
  - Smaller brush size for precision.
  - Cursor changes to “scratch” icon when hovering.
- **Consistency:** Both platforms deliver smooth, fast feedback.

---

## 8. Realistic Constraints
- Designed for small shop display screens.
- Lightweight animations (confetti, glow) to avoid lag.
- Simple UI with minimal distractions.
- No complex menus or login flows — one clear interaction.

---

## 9. Accessibility
- High contrast between scratch surface and revealed reward.
- Large, legible text.
- Clear instructions visible at all times.
