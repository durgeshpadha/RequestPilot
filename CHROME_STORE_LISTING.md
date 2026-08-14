# Chrome Web Store submission copy

Use this document as the source of truth when completing the RequestPilot item in the Chrome Web Store Developer Dashboard.

## Distribution

- Visibility: **Public** for a searchable listing, or **Unlisted** for link-only distribution.
- Regions: **All regions** unless the publisher has a specific distribution restriction.
- Category: **Developer Tools**.
- Language: **English (United States)**.

## Store listing

### Extension name

RequestPilot

### Summary

Create and manage HTTP header, redirect, query, cookie, API mock, and response rules.

### Detailed description

RequestPilot is a network request and API testing tool for developers, QA engineers, and support teams. Create rules that modify request or response headers, redirect matching URLs, set or remove query parameters, inject or remove cookies, return mock API responses, and override response bodies without changing application code.

Organize rules with groups and tags, select HTTP methods and resource types, set priorities, and test URL matchers before enabling a rule. Environment variables make it easy to reuse rules across development, staging, and production configurations. Rule sets can be imported or exported as JSON for team collaboration.

Privacy disclosure: when an enabled user-created rule matches a request, RequestPilot processes its URL and HTTP method. If local history is enabled, the match is stored in the extension's private browser storage so the user can review rule activity. User-entered rules, headers, cookies, variables, and mock or override bodies are processed only to apply configured features. RequestPilot does not send this information to the developer or third parties.

RequestPilot has no analytics, advertising, telemetry, remote backend, or remotely hosted executable code. Users can disable or clear history, configure sensitive-query redaction and retention, and reset all extension data.

### Official URL fields

- Homepage: `https://github.com/vishnoiakash/RequestPilot`
- Support: `https://github.com/vishnoiakash/RequestPilot/issues`
- Privacy policy: use the public HTTPS page hosting the current `PRIVACY.md`.

## Graphic assets

- Store icon: `assets/icons/icon128.png` — 128 × 128 PNG.
- Small promo tile: `store-assets/requestpilot-small-tile-440x280.png` — 440 × 280 PNG.
- Marquee promo tile: `store-assets/requestpilot-large-tile-1400x560.png` — 1400 × 560 PNG (optional).
- Screenshots (all 1280 × 800 JPEG):
  1. `store-assets/chrome-dashboard-1280x800.jpg`
  2. `store-assets/chrome-header-rules-1280x800.jpg`
  3. `store-assets/chrome-rule-editor-1280x800.jpg`
  4. `store-assets/chrome-environments-1280x800.jpg`
  5. `store-assets/chrome-history-1280x800.jpg`

Do not use private customer URLs, credentials, tokens, or other real browsing data in screenshots. Use clearly fictional development endpoints and values.

## Privacy practices

### Single purpose

RequestPilot helps developers and testers create, manage, and apply user-defined HTTP request and response rules for API testing and debugging.

### Permission justifications

`storage`

Stores user-created rules, environments, settings, local rule-match history, usage counts, and recoverable configuration backups.

`declarativeNetRequestWithHostAccess`

Applies enabled user-created header, redirect, query-parameter, and cookie rules through Chrome's Manifest V3 declarative network API.

`webRequest`

Observes the URL, method, and resource type of requests so RequestPilot can determine whether an enabled user-created rule matched and record optional local rule-match history. It does not transmit browsing data or use `webRequest` to block or modify traffic.

`<all_urls>` host access

Users can create testing rules for arbitrary development, staging, local, or production endpoints. Broad host access is necessary to apply only the rules the user explicitly creates and enables, including page-level fetch and XMLHttpRequest mocks.

### Remote code

Select **No, I am not using remote code**. All executable JavaScript is included in the submitted ZIP.

### Data disclosures

Chrome considers locally processed information to be handled data. Select every dashboard category that corresponds to the behavior of the uploaded version. For version 1.2.3, disclose at least:

- **Web history / browsing activity** — request URLs and HTTP methods for requests matched by enabled user-created rules; retained locally only when history is enabled.
- **Authentication information** — user-entered header, cookie, or environment-variable values may contain authentication values and are processed locally to apply configured rules.
- **Website content** — user-entered mock response and response-override bodies are processed locally to return the configured content.
- **User-provided content** or the closest available category — rule definitions, environments, tags, and descriptions created by the user.

If the dashboard groups or renames these categories, use the closest accurate categories and do not select **No data collected** merely because processing is local.

For every disclosed category, state:

- Used only for the extension's single purpose and user-facing features.
- Not sold to third parties.
- Not used or transferred for purposes unrelated to the item's single purpose.
- Not used or transferred for creditworthiness or lending.
- Not used for personalized advertising.
- Not transmitted to the developer or third parties; it remains in Chrome extension storage unless the user explicitly exports a JSON file.

Certify compliance with the Chrome Web Store User Data Policy and Limited Use requirements only while the uploaded package, store answers, and public privacy policy remain consistent.

## Reviewer instructions

RequestPilot does not require an account, publisher-owned credentials, payment, or an external service.

Suggested verification:

1. Open RequestPilot Options and create an enabled Request Header rule.
2. Use URL pattern `https://httpbin.org/anything*`, method `GET`, resource `Fetch / XHR`, and set `X-RequestPilot-Test` to `enabled`.
3. Make a GET request to `https://httpbin.org/anything` from a normal webpage. The returned request headers should include `X-RequestPilot-Test: enabled`.
4. Create a Mock API rule for `https://example.com/requestpilot-test`, select `Fetch / XHR`, status `200`, and body `{"source":"RequestPilot"}`.
5. A page-level fetch to that URL should receive the configured body without making the real network request.
6. The History page displays rule matches stored in local extension storage. History can be disabled and cleared in Settings.
7. No remote code, analytics, advertising, telemetry, or publisher backend is used.

Additional rule types and complete usage guidance are available on the extension's **How to Use** page.

## Submission

- Upload `release/requestpilot-v1.2.3.zip`.
- Choose deferred publishing if the item should not become public immediately after approval.
- Submit for review only after every required listing and privacy field shows as complete and the public privacy-policy URL reflects the uploaded version.
