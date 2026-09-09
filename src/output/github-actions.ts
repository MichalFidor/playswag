import { appendFile, readFile } from 'node:fs/promises';
import type { CoverageResult, CoverageDimension, GitHubActionsOutputConfig } from '../types.js';
import type { ThresholdViolation } from './console.js';
import type { CoverageDelta } from './history.js';
import { log } from '../log.js';
import {
  activeDimensions,
  badgeEmoji,
  pct,
  deltaStr,
  sanitizeWorkflowMessage,
  escapeMarkdownBackticks,
} from './dimensions.js';

/** Hidden marker used to find and update an existing PR comment. */
export const PR_COMMENT_MARKER = '<!-- playswag-coverage-report -->';

/**
 * Whether the current process is running inside GitHub Actions.
 */
export function isGitHubActions(): boolean {
  return process.env['GITHUB_ACTIONS'] === 'true';
}

/**
 * Resolve the pull request number from the GitHub Actions event payload.
 * Returns `undefined` on push/workflow_dispatch runs or when the payload is unavailable.
 */
export async function getPullRequestNumber(): Promise<number | undefined> {
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (!eventPath) return undefined;

  try {
    const raw = await readFile(eventPath, 'utf8');
    const payload = JSON.parse(raw) as {
      pull_request?: { number?: number };
      issue?: { number?: number };
    };
    const number = payload.pull_request?.number ?? payload.issue?.number;
    return typeof number === 'number' && number > 0 ? number : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a PR comment should be posted for the current run.
 * Defaults to `true` on `pull_request` events when a PR number is available.
 */
export async function shouldPostPullRequestComment(
  config: GitHubActionsOutputConfig = {},
): Promise<boolean> {
  if (config.postPullRequestComment === false) return false;
  if (config.postPullRequestComment === true) return true;
  if (process.env['GITHUB_EVENT_NAME'] !== 'pull_request') return false;
  return (await getPullRequestNumber()) !== undefined;
}

/**
 * Build the Markdown body shared by the step summary and PR comment.
 */
export function buildGitHubSummaryMarkdown(
  result: CoverageResult,
  violations: ThresholdViolation[],
  config: GitHubActionsOutputConfig = {},
  delta?: CoverageDelta,
  excludeDimensions?: CoverageDimension[],
): string {
  const { summary } = result;
  const dimensions = activeDimensions(excludeDimensions);

  const lines: string[] = [
    '## playswag — API Coverage Report',
    '',
    `| Dimension | Covered | Total | % |`,
    `|-----------|--------:|------:|---|`,
  ];

  for (const { key, label, dim } of dimensions) {
    const s = summary[key];
    const d = delta?.[dim as keyof CoverageDelta];
    lines.push(`| ${label} | ${s.covered} | ${s.total} | ${badgeEmoji(s.percentage)} ${pct(s.percentage)}${deltaStr(d)} |`);
  }

  lines.push('');

  const tags = Object.entries(result.tagCoverage).filter(([t]) => t !== '(untagged)');
  if (tags.length > 0) {
    const tagCols = dimensions;
    lines.push('### Coverage by Tag');
    lines.push('');
    lines.push(`| Tag | ${tagCols.map((c) => c.short).join(' | ')} |`);
    lines.push(`|-----|${tagCols.map(() => '---:').join('|')}|`);
    for (const [tag, tc] of tags) {
      const cells = tagCols.map((c) => `${badgeEmoji(tc[c.key].percentage)} ${pct(tc[c.key].percentage)}`);
      lines.push(`| \`${escapeMarkdownBackticks(tag)}\` | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  if (violations.length > 0) {
    lines.push('### Threshold Violations');
    lines.push('');
    for (const v of violations) {
      const icon = v.fail ? '❌' : '⚠️';
      lines.push(`- ${icon} ${v.message}`);
    }
    lines.push('');
  }

  if (config.showUncoveredOperations && result.uncoveredOperations.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Uncovered operations (${result.uncoveredOperations.length})</summary>`);
    lines.push('');
    lines.push('| Method | Path |');
    lines.push('|--------|------|');
    for (const op of result.uncoveredOperations) {
      lines.push(`| \`${op.method.toUpperCase()}\` | \`${escapeMarkdownBackticks(op.path)}\` |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (config.showUnmatchedHits && result.unmatchedHits.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Unmatched API calls (${result.unmatchedHits.length})</summary>`);
    lines.push('');
    lines.push('| Method | URL | Status |');
    lines.push('|--------|-----|--------|');
    for (const hit of result.unmatchedHits) {
      lines.push(`| \`${hit.method.toUpperCase()}\` | \`${escapeMarkdownBackticks(hit.url)}\` | ${hit.statusCode} |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

function buildPullRequestCommentBody(summaryMarkdown: string): string {
  const server = process.env['GITHUB_SERVER_URL'] ?? 'https://github.com';
  const repo = process.env['GITHUB_REPOSITORY'];
  const runId = process.env['GITHUB_RUN_ID'];
  const footer = repo && runId
    ? `\n\n---\n_${PR_COMMENT_MARKER} · [View workflow run](${server}/${repo}/actions/runs/${runId})_`
    : `\n\n---\n_${PR_COMMENT_MARKER}_`;

  return `${summaryMarkdown}${footer}`;
}

interface GitHubIssueComment {
  id: number;
  body?: string;
}

/**
 * Emit GitHub Actions workflow commands for threshold violations.
 *
 * Violations with `fail: true` are emitted as `::error::`, others as `::warning::`.
 * This causes them to appear as annotations on PR files in the Actions UI.
 */
export function emitAnnotations(violations: ThresholdViolation[]): void {
  for (const v of violations) {
    const level = v.fail ? 'error' : 'warning';
    const message = sanitizeWorkflowMessage(v.message);
    process.stdout.write(`::${level}::[playswag] ${message}\n`);
  }
}

/**
 * Write a Markdown coverage summary to the GitHub Actions Job Summary
 * (`$GITHUB_STEP_SUMMARY` environment variable), if defined.
 */
export async function writeStepSummary(
  result: CoverageResult,
  violations: ThresholdViolation[],
  config: GitHubActionsOutputConfig = {},
  delta?: CoverageDelta,
  excludeDimensions?: CoverageDimension[],
): Promise<void> {
  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (!summaryPath) return;

  const content = buildGitHubSummaryMarkdown(result, violations, config, delta, excludeDimensions);

  try {
    await appendFile(summaryPath, content, 'utf8');
  } catch (err) {
    log.warn(`Could not write to $GITHUB_STEP_SUMMARY: ${(err as Error).message}`);
  }
}

/**
 * Post or update a pull request comment with the coverage summary.
 * Requires `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and a pull request event payload.
 */
export async function writePullRequestComment(
  result: CoverageResult,
  violations: ThresholdViolation[],
  config: GitHubActionsOutputConfig = {},
  delta?: CoverageDelta,
  excludeDimensions?: CoverageDimension[],
): Promise<void> {
  if (!(await shouldPostPullRequestComment(config))) return;

  const prNumber = await getPullRequestNumber();
  if (!prNumber) return;

  const token = process.env['GITHUB_TOKEN'];
  const repository = process.env['GITHUB_REPOSITORY'];
  if (!token || !repository) {
    log.warn('Cannot post PR comment: GITHUB_TOKEN or GITHUB_REPOSITORY is not set');
    return;
  }

  const apiBase = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const body = buildPullRequestCommentBody(
    buildGitHubSummaryMarkdown(result, violations, config, delta, excludeDimensions),
  );

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  try {
    const listUrl = `${apiBase}/repos/${repository}/issues/${prNumber}/comments?per_page=100`;
    const listRes = await fetch(listUrl, { headers });
    if (!listRes.ok) {
      log.warn(`Could not list PR comments (${listRes.status}): ${await listRes.text()}`);
      return;
    }

    const comments = (await listRes.json()) as GitHubIssueComment[];
    const existing = comments.find((c) => c.body?.includes(PR_COMMENT_MARKER));

    if (existing) {
      const patchUrl = `${apiBase}/repos/${repository}/issues/comments/${existing.id}`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ body }),
      });
      if (!patchRes.ok) {
        log.warn(`Could not update PR comment (${patchRes.status}): ${await patchRes.text()}`);
        return;
      }
      log.info(`Updated API coverage comment on PR #${prNumber}`);
      return;
    }

    const createUrl = `${apiBase}/repos/${repository}/issues/${prNumber}/comments`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body }),
    });
    if (!createRes.ok) {
      log.warn(`Could not create PR comment (${createRes.status}): ${await createRes.text()}`);
      return;
    }
    log.info(`Posted API coverage comment on PR #${prNumber}`);
  } catch (err) {
    log.warn(`Could not post PR comment: ${(err as Error).message}`);
  }
}
