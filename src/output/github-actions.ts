import { appendFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

export function pullRequestCommentMarker(key?: string): string {
  return key === undefined ? PR_COMMENT_MARKER
    : `<!-- playswag-coverage-report:${createHash('sha256').update(key).digest('hex')} -->`;
}

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
    return Number.isSafeInteger(number) && number! > 0 ? number : undefined;
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
    `## playswag — API Coverage Report${config.reportName ? ` · ${config.reportName.replace(/[\r\n<>`]/g, ' ')}` : ''}`,
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

function buildPullRequestCommentBody(summaryMarkdown: string, marker: string): string {
  const server = process.env['GITHUB_SERVER_URL'] ?? 'https://github.com';
  const repo = process.env['GITHUB_REPOSITORY'];
  const runId = process.env['GITHUB_RUN_ID'];
  const footer = repo && runId
    ? `\n\n---\n${marker}\n[View workflow run](${server}/${repo}/actions/runs/${runId})`
    : `\n\n---\n${marker}`;

  // Stay below GitHub's 65,536 character limit while retaining the update marker.
  const budget = 60_000 - footer.length;
  const summary = summaryMarkdown.length > budget
    ? `${summaryMarkdown.slice(0, budget - 100)}\n\n_Report truncated; see the complete workflow artifacts._`
    : summaryMarkdown;
  return `${summary}${footer}`;
}

interface GitHubIssueComment {
  id: number;
  body?: string;
  user?: { login?: string };
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
    await appendFile(summaryPath, `${content}\n\n`, 'utf8');
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
  const marker = pullRequestCommentMarker(config.commentKey);
  const body = buildPullRequestCommentBody(
    buildGitHubSummaryMarkdown(result, violations, config, delta, excludeDimensions),
    marker,
  );

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const timeoutMs = config.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    log.warn('GitHub comment timeoutMs must be positive and no greater than 2147483647');
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const request = (url: string, init: RequestInit = {}) => fetch(url, {
    ...init, headers, signal: controller.signal, redirect: 'error',
  });
  try {
    let existing: GitHubIssueComment | undefined;
    for (let page = 1; page <= 100; page++) {
      const listUrl = `${apiBase}/repos/${repository}/issues/${prNumber}/comments?per_page=100${page > 1 ? `&page=${page}` : ''}`;
      const listRes = await request(listUrl);
      if (!listRes.ok) {
        log.warn(`Could not list PR comments (HTTP ${listRes.status})`);
        return;
      }
      const comments: unknown = await listRes.json();
      if (!Array.isArray(comments)) throw new Error('Invalid GitHub comments response');
      existing = (comments as GitHubIssueComment[]).find((c) =>
        c && Number.isSafeInteger(c.id) && c.id > 0 && typeof c.body === 'string'
        && c.body.includes(marker) && c.user?.login === (config.commentAuthor ?? 'github-actions[bot]'));
      if (existing || comments.length < 100) break;
      if (page === 100) throw new Error('PR comment pagination limit exceeded');
    }

    if (existing) {
      const patchUrl = `${apiBase}/repos/${repository}/issues/comments/${existing.id}`;
      const patchRes = await request(patchUrl, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      });
      if (!patchRes.ok) {
        log.warn(`Could not update PR comment (HTTP ${patchRes.status})`);
        return;
      }
      await patchRes.body?.cancel();
      log.info(`Updated API coverage comment on PR #${prNumber}`);
      return;
    }

    const createUrl = `${apiBase}/repos/${repository}/issues/${prNumber}/comments`;
    const createRes = await request(createUrl, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
    if (!createRes.ok) {
      log.warn(`Could not create PR comment (HTTP ${createRes.status})`);
      return;
    }
    await createRes.body?.cancel();
    log.info(`Posted API coverage comment on PR #${prNumber}`);
  } catch (err) {
    log.warn(`Could not post PR comment: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
    // Cancel any unread error response body as well as its underlying connection.
    controller.abort();
  }
}
