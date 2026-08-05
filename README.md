# RequestPilot

A Microsoft Edge (Chromium) browser extension for intercepting and modifying HTTP requests and responses in real time — built with TypeScript and Manifest V3.

![RequestPilot](assets/logo/request_pilot_logo.png)

---

## Features

- **Header Rules** — Add, modify, or remove request and response headers
- **URL Redirect** — Redirect matching requests to a different URL
- **Query Parameters** — Add, modify, or remove URL query parameters
- **Mock API** — Intercept requests and return synthetic responses (no server needed)
- **Response Override** — Replace response bodies with custom content
- **Cookie Rules** — Inject or remove cookies on matching requests
- **Environments** — Define variable sets (`{{BASE_URL}}`, `{{AUTH_TOKEN}}`) and switch between Development / Staging / Production in one click
- **History** — Live log of every request modification
- **Import / Export** — Share rule sets as JSON files
- **Light & Dark theme** — Follows system preference or manually selectable
- **Command Palette** — `Ctrl+K` for instant navigation

---

## Installation (Developer / Unpacked)

> The extension is not yet published to the Edge Add-ons store. Load it manually:

1. Clone the repository
   ```bash
   git clone https://github.com/vishnoiakash/RequestPilot.git
   cd RequestPilot
   ```

2. Install dependencies and build
   ```bash
   npm install
   npm run build
   ```

3. Load in Microsoft Edge
   - Open `edge://extensions/`
   - Enable **Developer mode** (toggle, top-right)
   - Click **Load unpacked**
   - Select the `RequestPilot` folder (the root — where `manifest.json` lives)

4. Click the RequestPilot icon in the toolbar to open the popup, or right-click → **Options** for the full UI

---

## Development

```bash
# One-time build
npm run build

# Watch mode (recompiles TypeScript on save)
npm run watch

# Build and run automated checks
npm run check

# Create a clean store upload ZIP
npm run package
```

After any change, go to `edge://extensions/` and click the **reload** icon on the RequestPilot card.

### Project Structure

```
RequestPilot/
├── src/
│   ├── background/        # Service worker + DNR rule engine + history manager
│   ├── content/           # fetch/XHR interceptor for Mock API & Response Override
│   ├── options/           # Full-page options UI (HTML + app bootstrap)
│   ├── popup/             # Toolbar popup
│   ├── pages/             # One file per UI page
│   ├── components/        # Reusable UI components (Drawer, Toast, Modal, etc.)
│   ├── models/            # TypeScript interfaces and type definitions
│   ├── storage/           # chrome.storage abstraction layer
│   ├── utils/             # Helpers, icons, theme
│   └── assets/css/        # Design system CSS (light + dark theme)
├── assets/
│   ├── icons/             # Extension icons (PNG, all sizes)
│   └── logo/              # Source logo
├── scripts/
│   ├── copy-assets.cjs    # Post-build asset copy script
│   └── package-release.cjs # Store ZIP creator
├── dist/                  # Compiled output (generated — do not edit)
├── manifest.json
├── package.json
└── tsconfig.json
```

---

## How It Works

### Header / Redirect / Query Param / Cookie Rules
These use the browser's native [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/) API. Rules are compiled and applied as dynamic DNR rules every time you save or toggle a rule. No page reload required — changes take effect on the next matching request.

### Mock API & Response Override
These use a two-part content-script architecture. An isolated-world bridge keeps validated configuration private and answers one URL/method match request at a time. A `MAIN`-world interceptor wraps `window.fetch` and asynchronous `window.XMLHttpRequest`, receiving only the response data for the concrete request that matched. The page never receives extension API access or the complete rule configuration.

### Environment Variables
Use `{{KEY}}` placeholders in any rule field. The active environment's variables are resolved before rules are applied. Switch environments from the popup or the Environments page.

---

## Permissions Used

| Permission | Why |
|---|---|
| `storage` | Persist rules, settings, environments, history |
| `declarativeNetRequestWithHostAccess` | Apply dynamic rules to all URLs |
| `webRequest` | Observe request metadata for local history in packaged/store builds; it never blocks or changes requests |
| `<all_urls>` host permission | Apply user-created rules on the sites selected by the user |

---

## Tech Stack

- **TypeScript** — strict mode, ES2020 target
- **Manifest V3** — service worker background, declarativeNetRequest
- **Zero runtime dependencies** — no frameworks, no bundler
- **Lucide-style inline SVG icons**
- **CSS custom properties** — full light/dark design system

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and build: `npm run build`
4. Commit: `git commit -m "feat: add my feature"`
5. Push: `git push origin feature/my-feature`
6. Open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE)

## Privacy

RequestPilot does not transmit request data or configurations to a remote service. See [PRIVACY.md](PRIVACY.md) for the complete disclosure used for store submission.
