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

## Security Practices

- Dependencies are monitored via [Dependabot](.github/dependabot.yml)
- All PRs require passing CI checks before merge
- The package ships with zero runtime dependencies where possible
- HTML output is generated with proper escaping to prevent XSS
