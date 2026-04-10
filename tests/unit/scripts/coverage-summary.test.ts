import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Import the generateSummary function from the script
// Since it's an .mjs file with named export, we can import directly
const { generateSummary } = await import('../../../scripts/ci/coverage-summary.mjs');

function loadFixture(name: string) {
  const path = resolve(import.meta.dirname, '../../fixtures/coverage', name);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('coverage-summary', () => {
  it('parses healthy coverage correctly', () => {
    const data = loadFixture('coverage-summary-healthy.json');
    const summary = generateSummary(data);

    expect(summary).toContain('85.00%');
    expect(summary).toContain('4250/5000');
    expect(summary).toContain('4420/5200');
    expect(summary).toContain('680/800');
    expect(summary).toContain('1020/1200');
  });

  it('parses low coverage correctly', () => {
    const data = loadFixture('coverage-summary-low.json');
    const summary = generateSummary(data);

    expect(summary).toContain('25.00%');
    expect(summary).toContain('20.00%');
    expect(summary).toContain('15.00%');
    expect(summary).toContain('1250/5000');
    expect(summary).toContain('160/800');
  });

  it('handles missing coverage file gracefully', () => {
    const summary = generateSummary(undefined);
    expect(summary).toBe('No coverage data found.');
  });

  it('handles malformed JSON gracefully', () => {
    const summary = generateSummary({});
    expect(summary).toBe('No coverage data found.');
  });

  it('handles partial coverage data (missing metrics)', () => {
    const data = loadFixture('coverage-summary-partial.json');
    const summary = generateSummary(data);

    // Should include lines and branches
    expect(summary).toContain('lines');
    expect(summary).toContain('branches');
    expect(summary).toContain('80.00%');
    // Should NOT include statements or functions (missing from partial fixture)
    expect(summary).not.toContain('statements');
    expect(summary).not.toContain('functions');
  });

  it('generates valid Markdown table format', () => {
    const data = loadFixture('coverage-summary-healthy.json');
    const summary = generateSummary(data);

    const lines = summary.split('\n');
    expect(lines[0]).toBe('## Coverage Summary');
    expect(lines[2]).toBe('| Metric | Coverage | Covered/Total |');
    expect(lines[3]).toBe('|--------|----------|---------------|');
    // 4 metric rows
    expect(lines.length).toBe(8);
    for (let i = 4; i < 8; i++) {
      expect(lines[i]).toMatch(/^\| \w+ \| [\d.]+% \| \d+\/\d+ \|$/);
    }
  });
});
