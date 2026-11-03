/**
 * Helper utilities for the TS benchmark fixture.
 * Contains unsafe + safe counterparts for eval/DOM usage.
 */

export function evaluate(input: string): unknown {
  // VULNERABLE: eval on caller-provided input
  return eval(input);
}

export function evaluateSafe(input: string): unknown {
  // SAFE: JSON parsing only
  return JSON.parse(input) as unknown;
}

export function renderReport(container: HTMLElement | null, html: string): void {
  // VULNERABLE: assignment of unsanitised HTML to innerHTML
  if (container !== null) {
    container.innerHTML = html;
  }
}

export function renderReportSafe(container: HTMLElement | null, text: string): void {
  // SAFE: textContent never parses HTML
  if (container !== null) {
    container.textContent = text;
  }
}
