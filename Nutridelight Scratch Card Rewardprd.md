# Nutridelight Scratch Card Reward Game (PRD)

## 1. Overview
The Nutridelight Scratch Card Reward Game is a simple, engaging digital experience designed to reward customers with surprise offers. Customers scratch a branded card surface to reveal hidden rewards. The game emphasizes speed, satisfaction, and accessibility across devices.

---

## 2. Objectives
- Increase customer engagement with Nutridelight brand.
- Provide instant gratification through rewards.
- Ensure seamless play without login or complex setup.
- Deliver a visually branded experience using Nutridelight logo.

---

## 3. Target Users
- Walk-in customers at Nutridelight shops.
- Online visitors accessing the scratch card via touchscreen or laptop.

---

## 4. Core Features
- **Scratch Surface:** Displays Nutridelight logo before interaction.
- **Scratch Interaction:** Customers use finger (touchscreen) or mouse/trackpad (desktop) to scratch.
- **Reward Reveal:** Hidden reward appears once sufficient scratching is done.
- **Reward Pool:**
  - Free Cookie
  - ₹50 Off
  - Free Coffee
  - Try Again
- **Weighted Probability:**
  - "Try Again" → Most frequent
  - "Free Cookie" → Moderate
  - "Free Coffee" → Rare
  - "₹50 Off" → Rare
- **One Play Per Session:** Restrict to a single scratch per customer session.
- **Result Display:** Admin sees “Result: [reward]” on screen after reveal.

---

## 5. Functional Requirements
- **Cross-Platform Support:** Works on touchscreen devices and laptops.
- **No Login Required:** Instant play without authentication.
- **Performance:** Fast, responsive scratching with no lag.
- **Randomization:** Rewards assigned via weighted random algorithm.
- **Session Control:** Prevent multiple plays in one session.

---

## 6. User Flow
1. Customer opens scratch card.
2. Sees Nutridelight logo surface.
3. Scratches surface with finger/mouse.
4. Reward revealed underneath.
5. Result displayed on screen for customer and admin.

---

## 7. Non-Functional Requirements
- **Brand Consistency:** Use Nutridelight logo prominently.
- **Satisfaction:** Smooth scratching animation, tactile feedback.
- **Speed:** Reward reveal within 2–3 seconds of sufficient scratch.
- **Scalability:** Support multiple concurrent sessions.
- **Security:** Prevent manipulation of reward probabilities.

---

## 8. Admin View
- Simple dashboard showing:
  - Session ID
  - Reward result
- No customer login or personal data required.

---

## 9. Success Metrics
- Number of plays per day.
- Customer satisfaction (feedback surveys).
- Redemption rate of rewards.
- Increased repeat visits to Nutridelight.

---

## 10. Constraints
- Must use Nutridelight logo from provided image.
- Limited to defined reward pool.
- No external authentication or data collection.
