/**
 * Types related to data export functionality
 */

/**
 * Available export formats for request data
 */
export type ExportFormat = 'junit' | 'json' | 'csv';

/**
 * Options for exporting request data
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Path to export file */
  filePath: string;
  /** Whether to include headers in CSV export */
  includeHeaders?: boolean;
  /** Test suite name for JUnit export */
  testSuiteName?: string;
}
