# RequestPilot Privacy Policy

Last updated: August 13, 2026

RequestPilot is a Chrome and Edge browser-extension development tool that applies request rules created by the user.

## Prominent data-use disclosure

When an enabled user-created rule matches a request, RequestPilot processes the request URL and HTTP method and, when history is enabled, stores that match locally so the user can review rule activity. RequestPilot also processes user-entered rules, headers, cookies, environment variables, mock responses, and response overrides solely to apply the features the user configures. This information is not sent to the developer or to third parties.

## Data processed

RequestPilot may process request URLs, HTTP methods, configured headers, mock response data, environment variables, and rule-match history solely to provide its extension features.

## Storage

- Rules, environments, backups, and history are stored locally in the browser extension's private storage.
- Appearance and behavior settings use the browser's synchronized extension storage when browser synchronization is enabled.
- Sensitive query-string values with names such as `token`, `password`, `secret`, `session`, and `api_key` are redacted from history by default.
- Users can disable history, clear it, change its retention limit, export their configuration, or reset all data from the extension UI.

## Data sharing

RequestPilot does not sell, transmit, or share browsing data, request history, rules, environment variables, or credentials with the developer or third parties. The extension has no analytics, advertising, telemetry, or remote backend.

Exported JSON files are created only after a user action and remain under the user's control. Users should review exported environment variables before sharing a file with teammates.

## Chrome Web Store Limited Use

RequestPilot's use of information received through Chrome extension APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. The information is used only to provide RequestPilot's disclosed request-rule and API-testing features. It is not used for advertising, profiling, credit decisions, or any unrelated purpose, and the developer does not permit humans to read it.

## Permissions

- `storage` stores extension configuration and history.
- `declarativeNetRequestWithHostAccess` applies user-created network rules.
- `webRequest` observes request URL, method, and resource type so the extension can maintain local rule-match history. It is not used to block or transmit requests.
- `<all_urls>` is required because users may create rules for any development or testing endpoint.

## Security

Extension API access and the bulk rule configuration remain in isolated extension contexts. The main-world script used for fetch/XMLHttpRequest mocking submits one concrete URL/method check at a time and receives response data only when that request matches an enabled mock or response-override rule.

This request broker communicates over `window.postMessage`. Scripts running on the page can observe or forge those messages, including the response data returned for a matched request. The broker reduces bulk exposure but is not an authentication or confidentiality boundary. Environment variables referenced by mock or response-override payloads must not be used to store passwords, access tokens, or other secrets.

## Contact

For privacy questions, open an issue at https://github.com/vishnoiakash/RequestPilot/issues or use the support contact listed in the browser-store listing.
