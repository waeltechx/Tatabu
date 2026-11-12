# Tatabu · منصة تتبع

A local, private job application tracker for **Windows and macOS**, with AI-tailored
CVs and cover letters in English, Arabic and any language you add.

> **Status: in development.** No release yet. Follow the build plan in
> [`docs/superpowers/plans`](docs/superpowers/plans) and the design in
> [`docs/superpowers/specs`](docs/superpowers/specs).

- Everything stays on your computer. No account.
- Bring your own AI key (Groq for voice and text; optionally Gemini, OpenAI or OpenRouter for text).
- Tailored CV per job, in a clean ATS template or in your own design.
- Cover letters in seven layouts (left-to-right and right-to-left).
- Warns you when generated text contains something that isn't in your CV.

## Development

```bash
npm install
node node_modules/electron/install.js   # if npm skipped Electron's download script
npm run dev
```

```bash
npm run typecheck
npm test
npm run build:win   # Windows installer in release/
```

Pushing a tag like `v1.0.0` builds the Windows and macOS installers on GitHub Actions
and attaches them to a draft release.

## License

MIT
