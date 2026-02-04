# WebRTC Group Video Call (Up to 4)

A simple WebRTC group video calling demo (mesh topology) built with React + Vite, with a tiny WebSocket signaling server.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the signaling server (WebSocket, port 9001):
   ```bash
   npm run server
   ```

3. Start the React app (Vite, port 3000):
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000 in your browser

## How to Use (2 → 3 → 4 participants)

1. Person 1 opens the app → **Start Camera** → choose a **Room name** → **Join Room**
2. Person 2 opens the same app URL → **Start Camera** → join the **same Room**
3. To add a 3rd/4th participant, have them join the same room (or use **Add Participant (Copy Invite Link)**)
4. The room supports up to **4 total participants** (you + up to 3 others)

## Notes

- Both peers need to be on browsers that support WebRTC (Chrome, Firefox, Edge, Safari)
- For calls over the internet, participants need to be able to reach each other (may require TURN servers for strict NAT configurations)
- The app uses Google's public STUN servers for NAT traversal
- Signaling defaults to:
  - `ws://<hostname>:9001` when running the Vite dev server (e.g. on `:3000`)
  - `ws(s)://<same-origin-host>` when the app is served from the signaling server (recommended for sharing)
  - You can always override by setting `VITE_SIGNALING_URL`.

## Share with a Friend (ngrok, 1 tunnel)

Because free ngrok accounts often allow only **one** simultaneous session, the easiest approach is to serve the built React app from the same Node server on **port 9001**, and tunnel just that one port.

1. Build the app:
   ```bash
   npm run build
   ```

2. Start the server (serves `dist/` + WebSocket signaling on the same port):
   ```bash
   npm run start
   ```

3. Tunnel the server:
   ```bash
   ngrok http 9001
   ```

4. Share the **HTTPS** ngrok URL with your friend and have them join the same room.

## Tech Stack

- React 18
- Vite
- WebRTC API
- WebSocket signaling (`ws`)
- CSS3

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` folder.
