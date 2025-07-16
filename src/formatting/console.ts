/**
 * Console formatting utilities for better output presentation
 */

/**
 * Gets an emoji for HTTP methods
 */
export function getMethodEmoji(method: string): string {
  const emojis: Record<string, string> = {
    'GET': '🔍',
    'POST': '➕',
    'PUT': '✏️',
    'PATCH': '🔧',
    'DELETE': '🗑️',
    'HEAD': '👀',
    'OPTIONS': '⚙️'
  };
  return emojis[method.toUpperCase()] || '❓';
}

/**
 * Gets status emoji based on status code
 */
export function getStatusEmoji(status: string): string {
  if (status.startsWith('2')) return '✅';
  if (status.startsWith('3')) return '🔄';
  if (status.startsWith('4')) return '⚠️';
  if (status.startsWith('5')) return '❌';
  return '❓';
}

/**
 * Gets coverage emoji based on percentage
 */
export function getCoverageEmoji(percentage: number): string {
  if (percentage >= 80) return '🟢';
  if (percentage >= 60) return '🟡';
  return '🔴';
}

/**
 * Creates a visual progress bar
 */
export function createProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.ceil((percentage / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Formats a table separator line
 */
export function createTableSeparator(columnWidths: number[]): string {
  const parts = columnWidths.map(width => '-'.repeat(width + 2));
  return `+${parts.join('+')}+`;
}

/**
 * Formats a table row
 */
export function formatTableRow(columns: string[], columnWidths: number[]): string {
  const paddedColumns = columns.map((col, i) => 
    col.padEnd(columnWidths[i])
  );
  return `| ${paddedColumns.join(' | ')} |`;
}
