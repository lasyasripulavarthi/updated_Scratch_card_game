# Nutridelight Scratch Card Reward Game (TechStack.md)

## 1. Frontend Framework
- **React + TypeScript + Vite**  
  - React: Component-based UI, fast rendering.  
  - TypeScript: Type safety, maintainability.  
  - Vite: Lightweight, fast dev server and build tool.  
  - Confirmed as the base stack.

---

## 2. Scratch Effect Implementation
- **Approach:** HTML5 Canvas with mouse/touch event erasing.  
  - Reliable, lightweight, and widely supported.  
  - Allows smooth erasing effect with minimal dependencies.  
- **Alternative:** Lightweight library like `react-scratchcard` if faster setup is preferred.  
  - However, direct canvas implementation is simpler and avoids extra dependencies.

---

## 3. State Management
- **React State (useState, useEffect):**  
  - No Redux or heavy state libraries needed.  
  - Simple session-level state: idle, scratching, revealed.  
  - Reward result stored in local component state.

---

## 4. Reward Randomization Logic
- **Weighted Random Selection:**  
  - Define reward pool with weights, e.g.:  
    - Try Again → 60%  
    - Free Cookie → 20%  
    - Free Coffee → 10%  
    - ₹50 Off → 10%  
  - Algorithm: Generate random number (0–1), map to reward based on cumulative weight ranges.

---

## 5. Animations
- **CSS Transitions/Animations:**  
  - Fade-out for scratch surface.  
  - Zoom-in for reward text.  
- **Optional Lightweight Library:** `framer-motion` or `react-spring` for smoother reveal/confetti.  
  - Keep minimal to avoid performance overhead.  
- **Confetti Effect:** Use `canvas-confetti` for celebratory rewards.

---

## 6. Hosting & Deployment
- **Firebase Hosting:**  
  - Easy deployment for small projects.  
  - Free tier suitable for shop-scale traffic.  
  - Supports HTTPS and fast global CDN.

---

## 7. NPM Packages Needed
- **react** / **react-dom** → Core framework.  
- **typescript** → Type safety.  
- **vite** → Dev/build tool.  
- **canvas-confetti** → Lightweight confetti animation.  
- **react-scratchcard** (optional) → Prebuilt scratch effect if not using custom canvas.  
- **framer-motion** (optional) → Smooth animations for reveal states.

---

## 8. Minimal & Realistic Approach
- Avoid heavy state libraries (Redux, MobX).  
- Avoid large animation frameworks unless necessary.  
- Stick to canvas + CSS transitions for performance.  
- Ensure fast load times and responsive design for shop display screens.
