## Packages
framer-motion | Beautiful page transitions, glowing animations, and futuristic UI interactions
react-webcam | Access device camera for the Camera Assist (Emotion Detection) view
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility to merge Tailwind classes without style conflicts

## Notes
- Audio Hooks: The app uses `../../replit_integrations/audio/index.ts` for voice streaming and recording.
- Camera Feature: Mocked emotion detection overlaid on real camera feed using `react-webcam`.
- SSE Streaming: The chat interface uses a custom TextDecoder parser to handle Server-Sent Events from `/api/conversations/:id/messages`.
- Authentication: Session-based. App fetches `/api/me` on load.
