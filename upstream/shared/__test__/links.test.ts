import { describe, expect, it } from 'vitest';
import { normalizeElementLinkUrl } from '../src';

describe('normalizeElementLinkUrl', () => {
  it('keeps supported URL schemes', () => {
    expect(normalizeElementLinkUrl('https://github.com/openai')).toBe('https://github.com/openai');
    expect(normalizeElementLinkUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
    expect(normalizeElementLinkUrl('tel:+123456789')).toBe('tel:+123456789');
  });

  it('adds https scheme for domain-like URLs', () => {
    expect(normalizeElementLinkUrl('github.com/user')).toBe('https://github.com/user');
  });

  it('rejects empty and unsafe URLs', () => {
    expect(normalizeElementLinkUrl('')).toBeNull();
    expect(normalizeElementLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeElementLinkUrl('data:text/html,hi')).toBeNull();
  });
});
