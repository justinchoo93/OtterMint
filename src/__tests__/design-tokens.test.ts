// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guardrail for the design system (docs/design-system.md): every text token
// must stay readable on every surface, and chart marks must stay visible on
// the card surface. Values are read straight from globals.css so a token
// change that breaks contrast fails here.

const css = readFileSync(
  path.resolve(__dirname, "../app/globals.css"),
  "utf8"
);
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("@theme inline {"));

function rawToken(name: string): string {
  const match = rootBlock.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} not found in :root`);
  const value = match[1].trim();
  const alias = value.match(/^var\(--([a-z0-9-]+)\)$/);
  return alias ? rawToken(alias[1]) : value;
}

function hexToken(name: string): string {
  const value = rawToken(name);
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`token --${name} is not a 6-digit hex color: ${value}`);
  }
  return value;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["bg-primary", "bg-secondary", "bg-tertiary", "bg-hover"];
const TEXT = ["text-primary", "text-secondary", "text-muted", "delta-up", "delta-down"];
const MARKS = ["accent-mint", "series-income", "series-spending", "series-saved"];

describe("design tokens", () => {
  for (const text of TEXT) {
    for (const surface of SURFACES) {
      it(`--${text} reaches 4.5:1 on --${surface}`, () => {
        expect(contrast(hexToken(text), hexToken(surface))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const mark of MARKS) {
    it(`--${mark} reaches 3:1 on the card surface`, () => {
      expect(contrast(hexToken(mark), hexToken("bg-secondary"))).toBeGreaterThanOrEqual(3);
    });
  }

  for (const text of ["text-primary", "text-secondary"]) {
    it(`--${text} reaches 4.5:1 on the selected-segment fill --bg-active`, () => {
      expect(contrast(hexToken(text), hexToken("bg-active"))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("dark ink on the mint accent reaches 4.5:1", () => {
    expect(contrast(hexToken("bg-primary"), hexToken("accent-mint"))).toBeGreaterThanOrEqual(4.5);
  });

  it("maps every semantic color utility to a raw token that exists", () => {
    const theme = css.slice(css.indexOf("@theme inline {"));
    const refs = [...theme.matchAll(/--color-[a-z-]+:\s*var\(--([a-z0-9-]+)\)/g)].map(
      (m) => m[1]
    );
    expect(refs.length).toBeGreaterThan(15);
    for (const ref of refs) expect(() => rawToken(ref)).not.toThrow();
  });
});
