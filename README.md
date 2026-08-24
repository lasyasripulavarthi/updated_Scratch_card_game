# Nutri Delight - Gesture-Controlled Scratch & Win

Local prototype of the Nutri Delight Bhimavaram Gesture-Controlled Scratch & Win Game.

Quick start

1. Place the provided Nutri Delight logo image at `public/assets/logo.png` (do not modify the image).
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open the player UI on the device: `http://localhost:3000/`
   Open the admin UI: `http://localhost:3000/admin.html`

Default admin credentials (change immediately in production):

- username: `admin`
- password: `adminpass`

Notes
- The backend uses SQLite `data.db` in the project root.
- The admin panel persists rewards; changes are used by the player immediately.
- The player uses MediaPipe Hands for gesture recognition; touch fallback is available.
