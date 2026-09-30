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
| DNS rebinding | Each connection uses only its validated DNS addresses; Host and TLS SNI retain the original hostname |
| Redirects | Each hop validated against the same rules |
| Local references | Remote documents cannot reference local files, including in a local → remote → local chain |
| Timeouts / size | One 15s deadline covers DNS, redirects and body; 5 MiB limits both wire and decompressed bytes while streaming |
| HTTP reference graph | Per parse: at most 1,024 HTTP documents, 64 MiB decoded bytes in total, and eight concurrent reads; budget exhaustion aborts active reads and rejects queued references |

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
- JSON body redaction uses key-name heuristics, not deep secret scanning. Serialized JSON strings and Buffers are decoded before redaction; opaque payload values are hidden. Disable response capture if secrets appear in non-standard field names.
- URL userinfo and fragments are removed, and all query values are redacted while parameter names remain available for coverage. Cookie values are hidden while cookie names are retained. API paths and non-sensitive JSON values remain visible.
- The fixture retains at most 500 hits by default and at most 10 MiB of serialized hits per test. Excess data is skipped with a warning. The reporter independently validates and bounds attachment reads.
- Schema normalization and analysis have explicit visit/depth/property budgets; a budget failure is a coverage error, governed by `failOnSpecError`. This does not make arbitrary third-party specifications safe to trust.

## Security Practices

- Dependencies are monitored via [Dependabot](.github/dependabot.yml)
- CI audits both the repository dependency tree and an isolated packed consumer. CodeQL is enabled separately through GitHub default setup.
- Release validation reuses CI. Publishing uses the validated tarball, job-scoped permissions and npm OIDC with provenance; failures do not fall back to a long-lived npm token.
- All PRs require passing CI checks before merge
- Runtime dependencies are kept minimal and monitored via Dependabot (`@apidevtools/swagger-parser`, `chalk`, `cli-table3`, `js-yaml`, `openapi-types`, `picomatch`)
- HTML output is generated with proper escaping to prevent XSS
