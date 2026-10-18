import { describe, expect, it } from 'vitest';
import { templates } from '@resume-editor/templates';

describe('official template render baseline', () => {
  it('keeps the six representative page structures stable', () => {
    const baseline = templates.map((template) => ({
      id: template.id,
      pageCount: template.pages.length,
      pageElementCounts: template.pages.map((page) => page.elements.length),
      elementTypes: template.pages.map((page) =>
        page.elements.reduce<Record<string, number>>((counts, element) => {
          counts[element.type] = (counts[element.type] ?? 0) + 1;
          return counts;
        }, {})
      ),
      representativeText: template.pages[0].elements
        .filter((element) => element.type === 'text')
        .slice(0, 4)
        .map((element) => element.content),
    }));

    expect(baseline).toMatchSnapshot();
  });
});
