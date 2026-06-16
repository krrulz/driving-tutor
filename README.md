# 🎧 Max — Belgium Driving Audio Tutor

An interactive audio tutor for the Belgian Category B driving theory exam. Max speaks lessons aloud, quizzes you after each concept, and tracks your score across all 10 exam topics.

## Topics Covered
- 🚦 Road Signs
- ⚠️ Priority Rules
- 🏎️ Speed Limits
- 🍺 Alcohol & Drugs
- 🦺 Safety Rules
- 🛣️ Motorway Rules
- 🌿 Environment & LEZ
- 🅿️ Parking Rules
- 🚴 Vulnerable Users
- 🔧 Vehicle Tech

## Local Development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

Push to `main` — GitHub Actions builds and deploys automatically.

Then go to **Settings → Pages → Source → GitHub Actions**.

## Built With
- React 18 + Vite
- Anthropic Claude API (claude-sonnet-4-6)
- Web Speech API (TTS)
