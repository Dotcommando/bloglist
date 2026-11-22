import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { source } from '../support/publication.js';

describe('MODX-shaped composition and loader boundaries', () => {
  it('identifies parameter contract and separator errors without raw source', async () => {
    const composition = new ModxCompositionAdapter();
    const undeclared = source('[[$Card? &title=`private value`]]');

    await expect(composition.prepare({
      ...undeclared,
      templates: undeclared.templates.map((item) => item.kind === TemplateSourceKind.Chunk
        ? { ...item, parameters: [] } : item),
    }, 'page-1')).rejects.toMatchObject({
      diagnostic: { issue: 'UnknownChunkParameter', source: { kind: 'Chunk', key: 'Card' }, parameter: 'title' },
    });
    await expect(composition.prepare(source('[[$Card]]'), 'page-1')).rejects.toMatchObject({
      diagnostic: { issue: 'MissingChunkParameter', source: { kind: 'Chunk', key: 'Card' }, parameter: 'title' },
    });
    await expect(composition.prepare(source('[[$Card &title=`private value`]]'), 'page-1'))
      .rejects.toMatchObject({
        diagnostic: { issue: 'MissingParameterSeparator', source: { kind: 'Template', key: 'Home' } },
        message: 'Template validation failed',
      });
  });
  it('renders a named chunk and its numeric key with the same typed forwarded parameters', async () => {
    const input = source('[[$Date_Chunk? &title=`[[*title]]`]][[$1? &title=`Again`]]');
    const snapshot = {
      ...input,
      templates: input.templates.map((item) => item.kind === TemplateSourceKind.Chunk
        ? { ...item, id: '1', name: 'Date Chunk' } : item),
    };
    const composition = new ModxCompositionAdapter();
    const plan = await composition.prepare(snapshot, 'page-1');
    const rendered = await new RenderDataService(composition, new LoaderExecutionAdapter([])).render(plan, true);

    expect(rendered.html).toContain('<p>' + input.pages[0]!.title + '</p><p>Again</p>');
    await expect(composition.prepare({
      ...snapshot,
      templates: snapshot.templates.map((item) => item.kind === TemplateSourceKind.Chunk
        ? { ...item, html: '[[$Date_Chunk? &title=`[[+title]]`]]' } : item),
    }, 'page-1')).rejects.toThrow('Cyclic');
  });

  it('refuses ambiguous normalized names while keeping keys authoritative', async () => {
    const input = source('[[$Date_Chunk? &title=`Value`]]');
    const chunk = input.templates.find((item) => item.kind === TemplateSourceKind.Chunk)!;
    const templates = [input.templates[0]!, { ...chunk, id: '1', name: 'Date Chunk' },
      { ...chunk, id: '2', name: 'Date_Chunk' }];
    const composition = new ModxCompositionAdapter();

    await expect(composition.prepare({ ...input, templates }, 'page-1')).rejects.toThrow('Ambiguous');
    const byKey = source('[[$1? &title=`By key`]]');
    const plan = await composition.prepare({
      ...byKey,
      templates: [byKey.templates[0]!,
        { ...chunk, id: '1', name: 'Other' }, { ...chunk, id: '2', name: '1' }],
    }, 'page-1');
    const rendered = await new RenderDataService(composition, new LoaderExecutionAdapter([])).render(plan, true);

    expect(rendered.html).toContain('<p>By key</p>');
  });
  it('passes typed array items into repeated chunks and evaluates strict boolean branches', async () => {
    const item = {
      name: 'item',
      kind: ParameterKind.Object,
      required: true,
      properties: [
        { name: 'title', kind: ParameterKind.String, required: true },
        { name: 'visible', kind: ParameterKind.Boolean, required: true },
      ],
    };
    const loader = {
      id: 'Catalog',
      parameters: [],
      output: {
        name: 'items', kind: ParameterKind.Array, required: true, items: item,
      },
      phases: [LoaderPhase.Build],
      read: async () => [
        { title: '<First>', visible: true }, { title: 'Hidden', visible: false },
      ],
    };
    const fixture = source('[[Catalog? &as=`catalog`]]'
      + '[[Each? &items=`[[+catalog]]` &chunk=`Service_Card` &as=`item`]]');
    const composition = new ModxCompositionAdapter([loader]);
    const templates = fixture.templates.map((template) => template.id === 'Card' ? {
      ...template,
      name: 'Service Card',
      parameters: [item],
      html: '[[If? &condition=`[[+item.visible]]` &then=`Display_Title` &title=`[[+item.title]]`]]',
    } : template);

    templates.push({
      id: 'Title',
      name: 'Display Title',
      kind: TemplateSourceKind.Chunk,
      revision: '1',
      parameters: [
        { name: 'title', kind: ParameterKind.String, required: true },
      ],
      html: '<p>[[+title]]</p>',
    });
    const plan = await composition.prepare({ ...fixture, templates }, 'page-1');
    const rendered = await new RenderDataService(composition, new LoaderExecutionAdapter([loader])).render(plan, true);

    expect(rendered.html).toContain('<p>&lt;First&gt;</p>');
    expect(rendered.html).not.toContain('Hidden');
  });
  it('rejects alias cycles and Build-to-Request dependencies before executing any loader', async () => {
    const field = { name: 'text', kind: ParameterKind.String, required: true };
    const read = vi.fn(async () => 'value');
    const build = { id: 'Echo', parameters: [field], output: field, phases: [LoaderPhase.Build], read };
    const live = { id: 'Live', parameters: [], output: field, phases: [LoaderPhase.Request], read };
    const composition = new ModxCompositionAdapter([build, live]);

    await expect(composition.prepare(source(
      '[[Echo? &text=`[[+b]]` &as=`a`]][[Echo? &text=`[[+a]]` &as=`b`]]'), 'page-1'))
      .rejects.toThrow();
    const input = source('[[Echo? &text=`[[+b]]` &as=`a`]][[!Live? &as=`b`]]');

    await expect(composition.prepare({
      ...input,
      pages: input.pages.map((page) => ({
        ...page,
        rendering: { ...page.rendering!, delivery: HtmlDelivery.Request },
      })),
    }, 'page-1')).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it('forwards typed parameters, escapes once and isolates repeated chunk scopes', async () => {
    const composition = new ModxCompositionAdapter();
    const runtime = new RenderDataService(composition, new LoaderExecutionAdapter([]));
    const plan = await composition.prepare(source(
      '[[$Card? &title=`[[*title]]`]][[$Card? &title=`Second`]]'), 'page-1');
    const result = await runtime.render({ ...plan, page: { ...plan.page, title: '<img onerror="x">' } }, true);

    expect(result.html).toContain('<p>&lt;img onerror=&quot;x&quot;&gt;</p><p>Second</p>');
    expect(result.html).not.toContain('<img');
  });
  it('executes declarations topologically, deduplicates reads and does not reinterpret returned tags', async () => {
    const read = vi.fn(async () => '[[*title]]');
    const loader = {
      id: 'Label',
      parameters: [],
      output: { name: 'label', kind: ParameterKind.String, required: true },
      phases: [LoaderPhase.Build],
      read,
    };
    const composition = new ModxCompositionAdapter([loader]);
    const plan = await composition.prepare(source('[[+a]][[Label? &as=`a`]][[Label? &as=`b`]][[+b]]'), 'page-1');
    const result = await new RenderDataService(composition, new LoaderExecutionAdapter([loader])).render(plan, true);

    expect(read).toHaveBeenCalledOnce();
    expect(result.html).toContain('[[*title]][[*title]]');
    expect(result.snippetValues).toEqual({ a: '[[*title]]', b: '[[*title]]' });
  });
  it('rejects cycles, unknown arguments, request tags on static pages and dangerous output contexts', async () => {
    const composition = new ModxCompositionAdapter();

    for (const html of ['[[$Missing]]', '[[$Card? &wrong=`x`]]', '[[!+request.date]]',
      '<a href= [[*title]]>x</a>', '<script>[[*title]]</script>']) {
      await expect(composition.prepare(source(html), 'page-1')).rejects.toThrow();
    }
    await expect(composition.prepare(source('[[$Card? &title=`x`]]', '[[$Card? &title=`x`]]'), 'page-1'))
      .rejects.toThrow();
  });
});
