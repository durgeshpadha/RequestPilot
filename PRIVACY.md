# RequestPilot Privacy Policy

Last updated: July 23, 2026

RequestPilot is a browser-extension development tool that applies request rules created by the user.

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

## Permissions

- `storage` stores extension configuration and history.
- `declarativeNetRequestWithHostAccess` applies user-created network rules.
- `webRequest` observes request URL, method, and resource type so the extension can maintain local rule-match history. It is not used to block or transmit requests.
- `<all_urls>` is required because users may create rules for any development or testing endpoint.

## Security

Extension API access and complete rule configuration remain in isolated extension contexts. The main-world script used for fetch/XMLHttpRequest mocking submits one concrete URL/method check at a time and receives response data only when that request matches an enabled mock or response-override rule.

## Contact

For privacy questions, open an issue in the RequestPilot source repository or use the support contact listed in the browser-store listing.
