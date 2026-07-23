import { Icons } from '../utils/icons.js';

export function renderHowToUsePage(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fade-in';
  el.innerHTML = CSS_BLOCK + LAYOUT_OPEN + TOC + ARTICLE_OPEN
    + SECTION_OVERVIEW
    + SECTION_GETTING_STARTED
    + SECTION_HEADER_RULES
    + SECTION_REDIRECT_RULES
    + SECTION_QUERY_PARAMS
    + SECTION_MOCK_API
    + SECTION_RESPONSE_OVERRIDE
    + SECTION_COOKIES
    + SECTION_ENVIRONMENTS
    + SECTION_URL_PATTERNS
    + SECTION_EXPECTATIONS
    + SECTION_FAQ
    + ARTICLE_CLOSE + LAYOUT_CLOSE;

  // Collapsible FAQ
  el.querySelectorAll('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.faq-item')?.classList.toggle('open');
    });
  });

  // TOC smooth scroll
  el.querySelectorAll('.htu-toc-list a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = (a as HTMLAnchorElement).hash.slice(1);
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  return el;
}

// ── helpers ──────────────────────────────────────────────────

function h2(icon: string, text: string): string {
  return `<h2 class="htu-h2">${icon} ${text}</h2>`;
}
function p(text: string): string {
  return `<p class="htu-p">${text}</p>`;
}
function callout(type: 'info'|'warn'|'tip', icon: string, html: string): string {
  return `<div class="htu-callout ${type}"><span class="htu-callout-icon">${icon}</span><span>${html}</span></div>`;
}
function example(label: string, iconHtml: string, body: string): string {
  return `<div class="htu-example"><div class="htu-example-header">${iconHtml}${label}</div><div class="htu-example-body">${body}</div></div>`;
}
function step(n: number, title: string, desc: string): string {
  return `<div class="htu-step"><div class="htu-step-num">${n}</div><div class="htu-step-body"><div class="htu-step-title">${title}</div><div class="htu-step-desc">${desc}</div></div></div>`;
}
function faq(q: string, a: string): string {
  return `<div class="faq-item"><button class="faq-question">${q}<span class="faq-chevron">${Icons.chevronDown({ size: 14 })}</span></button><div class="faq-answer">${a}</div></div>`;
}
function c(text: string): string { return `<code class="inline">${text}</code>`; }
function fieldTable(rows: [string, string, string][]): string {
  return `<table class="htu-field-table"><thead><tr><th>Field</th><th>Required</th><th>Description</th></tr></thead><tbody>
${rows.map(([f, r, d]) => `<tr><td>${f}</td><td>${r}</td><td>${d}</td></tr>`).join('')}
</tbody></table>`;
}

// ── structural constants ──────────────────────────────────────

const LAYOUT_OPEN  = `<div class="htu-layout">`;
const LAYOUT_CLOSE = `</div>`;
const ARTICLE_OPEN  = `<article class="htu-content">`;
const ARTICLE_CLOSE = `</article>`;

// ── TOC ──────────────────────────────────────────────────────

const TOC = `
<nav class="htu-toc" aria-label="Table of contents">
  <div class="htu-toc-title">On this page</div>
  <ul class="htu-toc-list">
    <li><a href="#overview">Overview</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#header-rules">Header Rules</a></li>
    <li><a href="#redirect-rules">URL Redirect</a></li>
    <li><a href="#query-params">Query Parameters</a></li>
    <li><a href="#mock-api">Mock API</a></li>
    <li><a href="#response-override">Response Override</a></li>
    <li><a href="#cookies">Cookie Rules</a></li>
    <li><a href="#environments">Environments</a></li>
    <li><a href="#url-patterns">URL Patterns</a></li>
    <li><a href="#expectations">Expectations</a></li>
    <li><a href="#faq">FAQ</a></li>
  </ul>
</nav>`;

// ── Sections ──────────────────────────────────────────────────

const SECTION_OVERVIEW = `
<section class="htu-section" id="overview">
  ${h2(Icons.logo({ size: 22 }), 'What is RequestPilot?')}
  ${p('RequestPilot is a Microsoft Edge (Chromium) extension that intercepts and modifies HTTP traffic in real time — no code changes needed. Built for developers and QA engineers to test, debug, and simulate network conditions.')}
  <div class="limitation-grid">
    <div class="limitation-card can">
      <div class="limitation-card-title">${Icons.checkCircle({ size: 15 })} What it can do</div>
      <ul>
        <li>Add / modify / remove request &amp; response headers</li>
        <li>Redirect URLs to different endpoints</li>
        <li>Add / modify / remove URL query parameters</li>
        <li>Return synthetic API responses (Mock API)</li>
        <li>Replace response bodies with custom content</li>
        <li>Inject or remove cookies</li>
        <li>Use ${c('{{VARIABLE}}')} placeholders via Environments</li>
        <li>Enable / disable rules instantly without deleting them</li>
      </ul>
    </div>
    <div class="limitation-card cannot">
      <div class="limitation-card-title">${Icons.xCircle({ size: 15 })} Current limitations</div>
      <ul>
        <li>Cannot intercept requests made by extension pages</li>
        <li>Mock API intercepts ${c('fetch')} + ${c('XHR')} only — not WebSocket or SSE</li>
        <li>Removing a single cookie removes the entire Cookie header</li>
        <li>Rules don't sync across browser profiles</li>
        <li>History is local to this device only</li>
        <li>${c('declarativeNetRequest')} has a 30 000 dynamic rule limit</li>
      </ul>
    </div>
  </div>
</section>`;

const SECTION_GETTING_STARTED = `
<section class="htu-section" id="getting-started">
  ${h2(Icons.zap({ size: 22 }), 'Getting Started')}
  <div class="htu-steps">
    ${step(1, 'Navigate to a rule page', 'Use the left sidebar. Start with <strong>Header Rules</strong> if you want to add or modify HTTP headers.')}
    ${step(2, 'Click "Add Rule"', 'The blue <strong>Add Rule</strong> button is in the top-right of every rule page. A drawer slides in from the right.')}
    ${step(3, 'Fill in the form', 'Give the rule a name, set the URL pattern it should match, configure the modification, then click <strong>Save</strong>.')}
    ${step(4, 'Verify it is enabled', 'The toggle on the left side of the rule card must be <strong>on</strong> (blue). Rules are enabled by default when created.')}
    ${step(5, 'Make a request and check History', 'Browse any matching URL, then open <strong>History</strong> in the sidebar to confirm the rule fired.')}
  </div>
  ${callout('tip', Icons.command({ size: 16 }), `<strong>Ctrl+K</strong> opens the command palette for instant navigation. <strong>Ctrl+N</strong> opens a new rule editor on any rule page. <strong>Escape</strong> closes any drawer or modal.`)}
</section>`;

const SECTION_HEADER_RULES = `
<section class="htu-section" id="header-rules">
  ${h2(Icons.headers({ size: 22 }), 'Header Rules')}
  ${p('Header rules add, replace, or remove HTTP headers on matching requests or responses. They are applied via the browser\'s declarativeNetRequest API — meaning they work at the network level before the page even receives the response.')}
  ${fieldTable([
    ['Rule Name',     'Yes', 'Human-readable label shown on the card and in History.'],
    ['Match URL',     'Yes', `URL pattern. Use ${c('*')} to match everything. See URL Patterns section for syntax.`],
    ['Target',        'Yes', `${c('Request')} — modifies outgoing headers. ${c('Response')} — modifies incoming response headers.`],
    ['Header Name',   'Yes', 'The exact HTTP header name, e.g. Authorization, X-Api-Key, Content-Type.'],
    ['Header Value',  'Cond.', `Required for Set / Append operations. Leave empty for Remove. Supports ${c('{{VAR}}')} placeholders.`],
    ['Operation',     'Yes', `${c('set')} replaces or creates the header. ${c('append')} adds another value. ${c('remove')} deletes it.`],
    ['Priority',      'No',  'Lower number = applied first when multiple rules match the same request.'],
  ])}
  <h3 class="htu-h3">Example — Add an Authorization header to every API request</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Rule Name : Add Auth Header
Match URL : https://api.example.com/*
Target    : Request
Header    : Authorization
Value     : Bearer eyJhbGciOiJIUzI1NiJ9...
Operation : Set`)}
  ${example('What happens in the browser', Icons.activity({ size: 12 }), `Before : GET https://api.example.com/users
         → No Authorization header

After  : GET https://api.example.com/users
         → Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...`)}
  <h3 class="htu-h3">Example — Remove the Cookie header for clean API testing</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Match URL : *
Target    : Request
Header    : Cookie
Operation : Remove`)}
  ${callout('info', Icons.info({ size: 16 }), 'You can add multiple header operations in a single rule. Click <strong>+ Add Header</strong> inside the rule editor drawer to add more rows.')}
</section>`;

const SECTION_REDIRECT_RULES = `
<section class="htu-section" id="redirect-rules">
  ${h2(Icons.redirect({ size: 22 }), 'URL Redirect Rules')}
  ${p('Redirect rules intercept matching requests and send them to a different URL. Useful for pointing staging traffic to a local server, or swapping one API version for another.')}
  ${fieldTable([
    ['Match URL',      'Yes', 'The URL to intercept. Supports glob patterns and regex.'],
    ['Destination URL','Yes', `The URL to redirect to. Can be absolute or use ${c('{{VAR}}')} placeholders.`],
  ])}
  <h3 class="htu-h3">Example — Redirect all staging API calls to local dev server</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Rule Name  : Staging → Local
Match URL  : https://api.staging.example.com/*
Destination: http://localhost:3000/`)}
  ${example('What happens', Icons.activity({ size: 12 }), `Browser requests : https://api.staging.example.com/users/1
Extension redirects to: http://localhost:3000/users/1`)}
  ${callout('warn', Icons.alertTriangle({ size: 16 }), 'Redirect rules only work on requests from web pages — they cannot redirect requests initiated by the extension itself. HTTPS → HTTP redirects may be blocked by the browser\'s mixed-content policy.')}
</section>`;

const SECTION_QUERY_PARAMS = `
<section class="htu-section" id="query-params">
  ${h2(Icons.queryParam({ size: 22 }), 'Query Parameter Rules')}
  ${p('Query param rules add, replace, or remove URL query string parameters on matching requests — without touching the page\'s JavaScript.')}
  ${fieldTable([
    ['Key',       'Yes', 'The query parameter name, e.g. debug, version, locale.'],
    ['Value',     'Cond.', `Required for Set. Supports ${c('{{VAR}}')} placeholders.`],
    ['Operation', 'Yes', `${c('set')} creates or replaces the param. ${c('remove')} deletes the param.`],
  ])}
  <h3 class="htu-h3">Example — Always set ?debug=true on API calls</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Match URL : https://api.example.com/*
Key       : debug
Value     : true
Operation : Set`)}
  ${example('What happens', Icons.activity({ size: 12 }), `Original URL   : https://api.example.com/orders
Modified URL   : https://api.example.com/orders?debug=true

Original URL   : https://api.example.com/orders?page=2
Modified URL   : https://api.example.com/orders?page=2&debug=true`)}
</section>`;

const SECTION_MOCK_API = `
<section class="htu-section" id="mock-api">
  ${h2(Icons.mock({ size: 22 }), 'Mock API')}
  ${p('Mock API rules intercept matching requests and return a completely synthetic response — the real server is never contacted. The interception happens via a content script that wraps the page\'s native fetch and XMLHttpRequest.')}
  ${fieldTable([
    ['Match URL',      'Yes', 'URL pattern to intercept.'],
    ['HTTP Method',    'No',  `Filter by method: GET, POST, etc. Leave as ${c('*')} to match any.`],
    ['Status Code',    'Yes', 'HTTP status code to return, e.g. 200, 404, 500.'],
    ['Response Body',  'No',  'The response body text. JSON, HTML, plain text — whatever the page expects.'],
    ['Response Headers','No', 'Additional headers on the fake response, e.g. Content-Type: application/json.'],
    ['Delay (ms)',     'No',  'Artificial latency in milliseconds. Useful for testing loading states.'],
  ])}
  <h3 class="htu-h3">Example — Mock a login endpoint</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Match URL     : https://api.example.com/auth/login
Method        : POST
Status Code   : 200
Response Body :
{
  "token": "mock-jwt-token-xyz",
  "user": { "id": 1, "email": "dev@example.com" }
}
Content-Type  : application/json
Delay         : 300`)}
  ${example('What the page sees', Icons.activity({ size: 12 }), `fetch('https://api.example.com/auth/login', { method: 'POST', ... })
  .then(r => r.json())  // → { token: 'mock-jwt-token-xyz', user: { ... } }
  // Real server was never contacted. Response arrived in 300ms.`)}
  ${callout('warn', Icons.alertTriangle({ size: 16 }), `<strong>Important:</strong> Mock API only intercepts ${c('fetch')} and ${c('XMLHttpRequest')} made by page scripts. It does not intercept WebSocket connections, Server-Sent Events, or requests made by browser extensions. The page must be loaded <em>after</em> the rule is enabled — already-open tabs are covered once they make their next request.`)}
  <h3 class="htu-h3">Example — Simulate a 429 rate-limit error</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Match URL     : https://api.example.com/*
Status Code   : 429
Response Body : { "error": "Too Many Requests", "retryAfter": 60 }
Content-Type  : application/json`)}
</section>`;

const SECTION_RESPONSE_OVERRIDE = `
<section class="htu-section" id="response-override">
  ${h2(Icons.responseOverride({ size: 22 }), 'Response Override')}
  ${p('Response Override lets the real request reach the server normally, then replaces the response body (and optionally the status code) before the page sees it. This is useful when you want to preserve the real network request but change specific data in the response.')}
  ${fieldTable([
    ['Match URL',        'Yes', 'URL to intercept after the real response arrives.'],
    ['Override Body',    'Yes', 'The text to replace the real response body with.'],
    ['Override Status',  'No',  'Optional: replace the HTTP status code too.'],
  ])}
  <h3 class="htu-h3">Example — Replace user data in an API response</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Match URL     : https://api.example.com/user/me
Override Body :
{
  "id": 999,
  "name": "Test User",
  "role": "admin",
  "email": "test@example.com"
}`)}
  ${callout('info', Icons.info({ size: 16 }), 'The real HTTP request is still made to the server. Only the response body that the page JavaScript sees is replaced. Network tab in DevTools will still show the original response.')}
</section>`;

const SECTION_COOKIES = `
<section class="htu-section" id="cookies">
  ${h2(Icons.cookies({ size: 22 }), 'Cookie Rules')}
  ${p('Cookie rules add or remove cookies on matching requests. Setting a cookie appends it to the outgoing Cookie request header.')}
  ${fieldTable([
    ['Cookie Name',  'Yes', 'The name of the cookie.'],
    ['Cookie Value', 'Cond.', `Required for Set. Supports ${c('{{VAR}}')} placeholders.`],
    ['Operation',    'Yes', `${c('set')} appends name=value to the Cookie header. ${c('remove')} strips the entire Cookie header.`],
  ])}
  <h3 class="htu-h3">Example — Inject a session cookie for testing</h3>
  ${example('Rule configuration', Icons.edit({ size: 12 }), `Match URL    : https://app.example.com/*
Cookie Name  : session_id
Cookie Value : mock-session-abc123
Operation    : Set`)}
  ${callout('warn', Icons.alertTriangle({ size: 16 }), `The ${c('remove')} operation removes the <em>entire</em> Cookie header from the request, not just a single cookie. This is a limitation of the declarativeNetRequest API.`)}
</section>`;

const SECTION_ENVIRONMENTS = `
<section class="htu-section" id="environments">
  ${h2(Icons.environment({ size: 22 }), 'Environments &amp; Variables')}
  ${p('Environments let you define named sets of key/value variables that can be referenced in any rule field using the <code class="inline">{{KEY}}</code> syntax — similar to Postman environments.')}
  <h3 class="htu-h3">How to use variables</h3>
  <div class="htu-steps">
    ${step(1, 'Go to Environments in the sidebar', 'Create an environment (e.g. Development) and add variables like BASE_URL and AUTH_TOKEN.')}
    ${step(2, 'Set the environment as Active', 'Click "Set Active" on the environment. Only one environment is active at a time.')}
    ${step(3, 'Use {{KEY}} in rule fields', 'In any rule\'s URL, header value, or destination URL, type {{BASE_URL}} or {{AUTH_TOKEN}}. The extension resolves the value automatically.')}
    ${step(4, 'Choose where the rule applies', 'Use “Applies to environments” in the rule editor to target all environments or only selected ones.')}
  </div>
  ${example('Environment variables', Icons.environment({ size: 12 }), `Environment: Development
  BASE_URL   = https://api.dev.example.com
  AUTH_TOKEN = dev-token-abc123
  API_VER    = v2`)}
  ${example('Rule using variables', Icons.edit({ size: 12 }), `Match URL : {{BASE_URL}}/{{API_VER}}/*
Header    : Authorization
Value     : Bearer {{AUTH_TOKEN}}
Operation : Set

Resolved at runtime:
Match URL : https://api.dev.example.com/v2/*
Value     : Bearer dev-token-abc123`)}
  ${callout('tip', Icons.info({ size: 16 }), 'Switch from Development to Production in one click. All rules using {{BASE_URL}} immediately resolve to the production URL — no rule editing needed.')}
  ${callout('warn', Icons.alertTriangle({ size: 16 }), `If a ${c('{{KEY}}')} placeholder has no value in an environment where the rule applies, RequestPilot skips that rule and reports an unresolved-variable warning.`)}
</section>`;

const SECTION_URL_PATTERNS = `
<section class="htu-section" id="url-patterns">
  ${h2(Icons.globe({ size: 22 }), 'URL Pattern Guide')}
  ${p('URL patterns control which requests a rule applies to. RequestPilot supports two modes: glob patterns (default) and regular expressions.')}
  <h3 class="htu-h3">Glob Patterns (default)</h3>
  <table class="htu-field-table">
    <thead><tr><th>Pattern</th><th>Matches</th></tr></thead>
    <tbody>
      <tr><td>*</td><td>Every URL (use with caution)</td></tr>
      <tr><td>https://api.example.com/*</td><td>Any path on api.example.com over HTTPS</td></tr>
      <tr><td>https://api.example.com/v2/*</td><td>Any path under /v2/ only</td></tr>
      <tr><td>*://api.example.com/*</td><td>Any scheme (http + https)</td></tr>
      <tr><td>https://*.example.com/*</td><td>Any subdomain of example.com</td></tr>
      <tr><td>https://api.example.com/auth/login</td><td>Exact path only</td></tr>
    </tbody>
  </table>
  <h3 class="htu-h3">Regex Patterns</h3>
  ${p('Enable the "Use Regular Expression" checkbox in the rule editor to use a regex instead. The pattern is tested against the full URL.')}
  <table class="htu-field-table">
    <thead><tr><th>Pattern</th><th>Matches</th></tr></thead>
    <tbody>
      <tr><td>https://api\\.example\\.com/users/\\d+</td><td>Any user by numeric ID</td></tr>
      <tr><td>https://(dev|staging)\\.example\\.com/.*</td><td>dev.example.com or staging.example.com</td></tr>
      <tr><td>.*\\.json$</td><td>Any URL ending in .json</td></tr>
    </tbody>
  </table>
  ${callout('warn', Icons.alertTriangle({ size: 16 }), 'Regex patterns are matched against the full URL including query string. Escape dots with a backslash: use ' + c('\\.') + ' to match a literal dot, not any character.')}
</section>`;

const SECTION_EXPECTATIONS = `
<section class="htu-section" id="expectations">
  ${h2(Icons.activity({ size: 22 }), 'Working Expectations')}
  ${p('Here is exactly what happens at each stage when a rule is enabled and a matching request is made.')}

  <h3 class="htu-h3">Header / Redirect / Query Param / Cookie Rules</h3>
  <div class="htu-steps">
    ${step(1, 'Rule saved in extension', 'When you click Save, the rule is stored in chrome.storage.local.')}
    ${step(2, 'Service worker applies DNR rules', 'The background service worker converts your rules to declarativeNetRequest dynamic rules. This happens within milliseconds of saving.')}
    ${step(3, 'Browser intercepts the request', 'Before the request reaches the server, the browser network stack applies the DNR modification — headers are changed, URL is redirected, or query params are transformed.')}
    ${step(4, 'Server receives modified request', 'The server sees the modified headers / URL / params. From its perspective, those values came from the browser normally.')}
    ${step(5, 'History is updated', 'A read-only webRequest observer records the matched rule locally, with sensitive query values redacted by default.')}
  </div>

  <h3 class="htu-h3">Mock API / Response Override Rules</h3>
  <div class="htu-steps">
    ${step(1, 'Content scripts are injected', 'An isolated extension bridge loads validated configuration and a minimal main-world interceptor wraps fetch/XHR at document_start.')}
    ${step(2, 'fetch and XHR are wrapped', 'The content script replaces window.fetch and window.XMLHttpRequest with intercepted versions that check rules before making network calls.')}
    ${step(3, 'Matching request is caught', 'When page JavaScript calls fetch() or new XMLHttpRequest(), the interceptor checks if any Mock API rule matches the URL and method.')}
    ${step(4, 'Mock: synthetic response returned', 'For Mock API rules, the real network request is never made. A Response object with your configured body, status, and headers is returned directly.')}
    ${step(5, 'Override: real request + replaced body', 'For Response Override rules, the real request is made, and the response body is replaced after it arrives.')}
  </div>

  ${callout('info', Icons.info({ size: 16 }), '<strong>Rule changes take effect immediately</strong> for new requests. Any request already in-flight when you save a rule will not be affected. Reload the page to ensure a fresh request goes through the new rules.')}
  ${callout('warn', Icons.alertTriangle({ size: 16 }), '<strong>DevTools Network tab:</strong> a Mock API rule prevents the real request, so no corresponding network entry appears. A Response Override still makes the request, and DevTools shows the server’s original response; page JavaScript receives the overridden body. Use RequestPilot History or your application code to verify the applied rule.')}
</section>`;

const SECTION_FAQ = `
<section class="htu-section" id="faq">
  ${h2(Icons.info({ size: 22 }), 'Frequently Asked Questions')}
  ${faq('I added a header rule but I don\'t see the header in DevTools.',
    'Make sure: (1) The rule toggle is ON (blue). (2) The URL pattern actually matches the request URL — check the History page to see if the rule fired. (3) The extension\'s master toggle in the popup is enabled. (4) For response headers on CORS requests, the browser may strip certain headers before the page can read them (e.g. Access-Control-* headers are controlled by CORS policy).')}
  ${faq('My Mock API rule doesn\'t seem to intercept the request.',
    `Mock rules only work for requests made via ${c('fetch')} or ${c('XMLHttpRequest')} in the page. They do not intercept: service worker requests, requests from browser extensions, WebSocket connections, or requests made from Web Workers. Also ensure the rule is enabled and the URL pattern matches exactly (check with a test in the History page).`)}
  ${faq('Do I need to create an Environment to use rules?',
    `No. Environments are optional. They are only needed if you use ${c('{{VARIABLE}}')} placeholders in rule fields. If you type a plain URL or value with no placeholders, the rule works without any environment.`)}
  ${faq('The History page shows no entries — why?',
    'Open Settings and confirm Request History is enabled. History is stored locally and sensitive token-like query values are redacted by default. Rule cards marked Invalid are not activated.')}
  ${faq('Can I use RequestPilot to test HTTPS APIs on localhost?',
    'Yes. Redirect rules can send staging URLs to localhost. Note that redirecting HTTPS → HTTP may be blocked by the browser\'s mixed-content policy on secure pages. Use localhost with HTTPS (self-signed cert) or test on HTTP pages.')}
  ${faq('How do I share my rules with a teammate?',
    'Go to Import / Export in the sidebar and click Export All Rules. This downloads a JSON file with all your rules and environments. Your teammate can import this file in their copy of RequestPilot using the Import button.')}
  ${faq('Will my rules slow down browsing?',
    'No measurable impact. Header / Redirect / Query / Cookie rules run in the browser\'s network stack via declarativeNetRequest — a highly optimized native API. Mock API rules add a tiny JavaScript check on each fetch/XHR call, which is negligible.')}
  ${faq('Why do I see the old response in DevTools when a Mock rule is active?',
    'This is expected. The content script intercepts the JavaScript-level call and never makes a real network request. DevTools only shows actual network activity, so nothing appears in the Network tab for a mocked request. The page\'s JavaScript receives the mock response normally.')}
</section>`;

// ── CSS ───────────────────────────────────────────────────────

const CSS_BLOCK = `<style>
.htu-layout{display:grid;grid-template-columns:200px 1fr;gap:var(--space-8);align-items:start}
.htu-toc{position:sticky;top:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-4);font-size:var(--text-sm)}
.htu-toc-title{font-size:var(--text-xs);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:.06em;color:var(--color-text-tertiary);margin-bottom:var(--space-3)}
.htu-toc-list{list-style:none;display:flex;flex-direction:column;gap:2px}
.htu-toc-list a{display:block;padding:4px var(--space-2);color:var(--color-text-secondary);border-radius:var(--radius-sm);text-decoration:none;transition:background var(--duration-fast),color var(--duration-fast);font-size:var(--text-sm)}
.htu-toc-list a:hover{background:var(--color-primary-light);color:var(--color-primary)}
.htu-content{min-width:0}
.htu-section{margin-bottom:var(--space-10);scroll-margin-top:var(--space-6)}
.htu-h2{font-size:var(--text-2xl);font-weight:var(--font-bold);color:var(--color-text-primary);margin-bottom:var(--space-3);padding-bottom:var(--space-3);border-bottom:2px solid var(--color-border);display:flex;align-items:center;gap:var(--space-3)}
.htu-h3{font-size:var(--text-lg);font-weight:var(--font-semibold);color:var(--color-text-primary);margin:var(--space-5) 0 var(--space-3)}
.htu-p{font-size:var(--text-sm);color:var(--color-text-secondary);line-height:1.7;margin-bottom:var(--space-3)}
.htu-callout{display:flex;gap:var(--space-3);padding:var(--space-4);border-radius:var(--radius-md);margin-bottom:var(--space-4);font-size:var(--text-sm);line-height:1.6}
.htu-callout.info{background:var(--color-info-light);border-left:3px solid var(--color-info);color:var(--color-text-primary)}
.htu-callout.warn{background:var(--color-warning-light);border-left:3px solid var(--color-warning);color:var(--color-text-primary)}
.htu-callout.tip{background:var(--color-success-light);border-left:3px solid var(--color-success);color:var(--color-text-primary)}
.htu-callout-icon{flex-shrink:0;margin-top:1px}
.htu-example{background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;margin-bottom:var(--space-4)}
.htu-example-header{background:var(--color-surface);border-bottom:1px solid var(--color-border);padding:var(--space-2) var(--space-4);font-size:var(--text-xs);font-weight:var(--font-semibold);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:.05em;display:flex;align-items:center;gap:var(--space-2)}
.htu-example-body{padding:var(--space-4);font-size:var(--text-sm);font-family:var(--font-mono);color:var(--color-text-primary);white-space:pre-wrap;line-height:1.6}
.htu-field-table{width:100%;border-collapse:collapse;margin-bottom:var(--space-4);font-size:var(--text-sm)}
.htu-field-table th{text-align:left;padding:var(--space-2) var(--space-3);font-size:var(--text-xs);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-secondary);background:var(--color-bg);border-bottom:1px solid var(--color-border)}
.htu-field-table td{padding:var(--space-3);border-bottom:1px solid var(--color-border);vertical-align:top;color:var(--color-text-primary);line-height:1.5}
.htu-field-table td:first-child{font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-primary);white-space:nowrap;font-weight:var(--font-semibold)}
.htu-field-table tr:last-child td{border-bottom:none}
code.inline{background:var(--color-bg);border:1px solid var(--color-border);border-radius:4px;padding:1px 6px;font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-primary)}
.htu-steps{display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-4)}
.htu-step{display:flex;gap:var(--space-4);align-items:flex-start;padding:var(--space-4);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md)}
.htu-step-num{width:28px;height:28px;background:var(--color-primary);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:var(--text-sm);font-weight:var(--font-bold);flex-shrink:0}
.htu-step-body{flex:1;min-width:0}
.htu-step-title{font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:4px}
.htu-step-desc{font-size:var(--text-sm);color:var(--color-text-secondary);line-height:1.6}
.faq-item{border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:var(--space-2);overflow:hidden}
.faq-question{width:100%;background:var(--color-surface);border:none;padding:var(--space-4);text-align:left;font-size:var(--text-sm);font-weight:var(--font-medium);color:var(--color-text-primary);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:var(--space-3)}
.faq-question:hover{background:var(--color-bg)}
.faq-chevron{transition:transform var(--duration-base);flex-shrink:0;color:var(--color-text-tertiary)}
.faq-item.open .faq-chevron{transform:rotate(180deg)}
.faq-answer{display:none;padding:0 var(--space-4) var(--space-4);font-size:var(--text-sm);color:var(--color-text-secondary);line-height:1.7;background:var(--color-surface)}
.faq-item.open .faq-answer{display:block}
.limitation-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-4)}
.limitation-card{padding:var(--space-4);border-radius:var(--radius-md);border:1px solid var(--color-border);font-size:var(--text-sm)}
.limitation-card.can{border-color:var(--color-success);background:var(--color-success-light)}
.limitation-card.cannot{border-color:var(--color-error);background:var(--color-error-light)}
.limitation-card-title{font-weight:var(--font-semibold);margin-bottom:var(--space-2);display:flex;align-items:center;gap:var(--space-2)}
.limitation-card.can .limitation-card-title{color:var(--color-success)}
.limitation-card.cannot .limitation-card-title{color:var(--color-error)}
.limitation-card ul{list-style:none;display:flex;flex-direction:column;gap:4px;padding-left:var(--space-2)}
.limitation-card li{color:var(--color-text-primary);line-height:1.5}
@media(max-width:900px){.htu-layout{grid-template-columns:1fr}.htu-toc{display:none}.limitation-grid{grid-template-columns:1fr}}
</style>`;
