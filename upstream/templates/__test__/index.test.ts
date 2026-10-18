import { describe, expect, it } from 'vitest';
import { getTemplateById, getTemplatesByCategory, templates } from '../src';

describe('templates', () => {
  it('exports valid template definitions', () => {
    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.pages.length).toBeGreaterThan(0);
      expect(template.pages[0].elements.length).toBeGreaterThan(0);
    }
  });

  it('can query templates by id and category', () => {
    expect(getTemplateById('template-modern')?.name).toBe('现代商务');
    expect(getTemplatesByCategory('modern').some((template) => template.id === 'template-modern')).toBe(true);
  });
});
