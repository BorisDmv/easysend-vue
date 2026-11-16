# Magic Box

A cross-device portal for sending files, links, images, and text — built with Vue 3, Vite, and Tailwind CSS v4.

## Tech stack

- **Vue 3** with Composition API
- **Vite** for fast builds and HMR
- **Tailwind CSS v4** for styling
- **WebRTC** for peer-to-peer data channels
- **Web Crypto API** for end-to-end encryption (AES--256-GCM, ECDH, HKDF-SHA256)

## Run it

```bash
npm install
npm run dev        # this computer only (http://localhost:5173)
npm run dev:lan    # phones and other devices on your network (HTTPS)
```

To pair a phone, use `npm run dev:lan` and open the **Network** URL it prints (for example `https://192.168.0.9:5173`) on the other device. The certificate is self-signed, so each device has to accept a browser warning once. HTTPS is required because browsers only allow the Web Crypto API on secure pages or `localhost`.

Run the tests with `npm test`.

## How a transfer works

1. **Room.** Opening the app creates a room on the signalling server and generates a random 128-bit secret in the browser. The QR code contains `…/#join=<code>.<secret>`. The secret stays in the URL fragment, which browsers never send to the server.
2. **Connection.** Devices in the same room exchange WebRTC offers, answers, and ICE candidates through the server, then open a direct peer-to-peer data channel.
3. **Key exchange** over that channel (`src/lib/secureChannel.js`):
   - Each device creates a P-256 ECDH key pair and commits to its key before seeing the other's.
   - Keys are derived with HKDF-SHA256 from the shared secret and a hash of the handshake transcript. Both sides prove they have the same keys with HMAC.
   - If both devices know the QR secret, it is mixed into the key derivation and the device shows as **Verified**.
   - If a device joined by typing the code, both show a 4-emoji **safety code** for the users to compare.
4. **Data.** Every item and every 16 KB file chunk is encrypted with AES-256-GCM. Each direction has its own key, and the nonce is a counter, so modified, replayed, or reordered data is rejected.

## Project structure

```
src/
├── main.js              # entry point
├── App.vue              # root component
├── style.css            # global styles + Tailwind imports
├── components/          # Vue components
├── composables/         # reusable composition logic
├── lib/                 # core utilities (WebRTC, encryption)
└── utils/               # helpers
```

## Limitations

- No TURN server by default. If direct peer-to-peer connections are blocked, pairing fails after 20 seconds. Set `VITE_ICE_SERVERS` to a JSON array of ICE server objects to add one. The default uses Google's public STUN server.
- Items are only sent to devices connected when you add them. A device that joins later doesn't receive earlier items.
- Clearing or dismissing items only affects the current device.
- Files are limited to 512 MB, and text snippets to 16,000 characters. Received files are held in memory until downloaded.
