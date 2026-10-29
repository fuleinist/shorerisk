export class UsageError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export class DataError extends Error {
  readonly exitCode = 3;
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

export class RuntimeError extends Error {
  readonly exitCode = 1;
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.level.toUpperCase()} ${issue.path}: ${issue.message}`)
    .join('\n');
}