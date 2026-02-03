# WebRTC P2P Video Call

A simple peer-to-peer video calling application built with React and WebRTC.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 in your browser

## How to Make a Video Call

This app uses manual signaling (copy-paste) for simplicity. To make a call between two peers:

### Caller (Person A):
1. Open the app in your browser
2. Click "Start Camera" and allow camera/microphone access
3. Click "Create Offer (Caller)"
4. Copy the generated offer SDP
5. Send it to your peer (via chat, email, etc.)

### Receiver (Person B):
1. Open the app in another browser/device
2. Click "Start Camera" and allow camera/microphone access
3. Paste the offer SDP you received
4. Click "Accept Offer (Receiver)"
5. Copy the generated answer SDP
6. Send it back to the caller

### Caller (Person A - continued):
1. Paste the answer SDP you received
2. Click "Accept Answer"
3. The video call should now be connected!

## Notes

- Both peers need to be on browsers that support WebRTC (Chrome, Firefox, Edge, Safari)
- For calls over the internet, both peers need to be able to reach each other (may require TURN servers for strict NAT configurations)
- The app uses Google's public STUN servers for NAT traversal

## Tech Stack

- React 18
- Vite
- WebRTC API
- CSS3

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` folder.
