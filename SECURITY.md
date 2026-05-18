# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in playswag, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please report them via GitHub's private vulnerability reporting:

1. Go to the [Security Advisories page](https://github.com/MichalFidor/playswag/security/advisories)
2. Click **"Report a vulnerability"**
3. Fill in the details and submit

Alternatively, you can email **michal.fidor@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Any potential impact assessment

## Response Timeline

- **Acknowledgement**: within 48 hours of receiving the report
- **Initial assessment**: within 5 business days
- **Fix or mitigation**: as soon as practical, typically within 30 days for confirmed issues

## Scope

playswag is a **dev-time testing tool** that runs in CI/CD pipelines and local development
environments. It processes OpenAPI/Swagger specification files and records HTTP traffic during
Playwright test runs. Relevant security concerns include:

- **Spec parsing** — malicious OpenAPI specs could exploit vulnerabilities in the YAML/JSON
  parser or the `$ref` resolver (`@apidevtools/swagger-parser`)
- **Output generation** — HTML reports are self-contained files; XSS in operation names or
  parameter values could be a concern if reports are served publicly
- **Dependency chain** — transitive vulnerabilities in dependencies

Out of scope:

- Vulnerabilities in Playwright itself (report to [Playwright](https://github.com/microsoft/playwright/security))
- Vulnerabilities in the APIs under test
- Issues requiring physical access to the machine running tests

## Remote specs (SSRF)

When `specs` is an `http://` or `https://` URL you **must** set `allowedSpecHosts` in reporter
config. The run fails at parse time if it is missing.

| Control | Behavior |
|--------|----------|
| `allowedSpecHosts` | **Required** for any HTTP spec / `$ref` fetch; supports `*.example.com` |
| Private / loopback | Blocked unless `allowPrivateHosts: true` |
| DNS rebinding | Hostnames resolved; private IPs rejected even when on allowlist |
| Redirects | Each hop validated against the same rules |
| `file://` $refs | Disabled when the root spec is a remote URL |
| Timeouts / size | `specFetchTimeoutMs` (15s), `maxSpecBytes` (5 MiB) per fetch |

Local spec files do not require an allowlist until they dereference an external HTTP URL.

## Coverage reports and CI artifacts

- JSON/HTML reports may contain API paths, parameters, and **redacted** request/response
  snippets. Treat artifacts as **confidential**; do not publish HTML reports to a public URL
  without reviewing contents.
- HTML output escapes dynamic text to reduce XSS risk; prefer private artifact storage in CI.
- Use `captureResponseBody: false` or `redactBody: false` / custom `redactBodyFields` only when
  you understand the data-handling implications.

## Trust model

- OpenAPI specs are treated as **trusted configuration** in dev/CI — only fetch specs from sources
  you control.
- Playswag does not call the APIs under test during spec parsing; it only fetches spec documents.
- Malicious specs cannot override `allowedSpecHosts`; they can only cause parse failures within
  the allowlisted hosts you configure.

## Known limitations

- Recorded hits are held in memory per worker (bounded by `maxHitsPerTest` and attachment size
  limits); extremely large suites may still require tuning those limits.
- Body redaction uses key-name heuristics, not deep secret scanning — disable body capture if
  secrets appear in non-standard field names.

## Security Practices

- Dependencies are monitored via [Dependabot](.github/dependabot.yml)
- CI runs `npm audit --audit-level=high` and CodeQL static analysis
- All PRs require passing CI checks before merge
- Runtime dependencies are kept minimal and monitored via Dependabot (`@apidevtools/swagger-parser`, `chalk`, `cli-table3`, `openapi-types`, `picomatch`)
- HTML output is generated with proper escaping to prevent XSS
