import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { parseElementParameters } from '../../src/domain/rendering/parameter-contract.policy.js';
import { RenderingElement } from '../../src/domain/rendering/rendering-element.js';
import { elementFixture } from '../support/rendering.js';

describe('rendering entity parameter invariants', () => {
  it('accepts canonical ordinals and legacy keys, and validates display names independently', () => {
    for (const key of ['1', '9223372036854775807', 'ZaryaBasic', 'new']) {
      expect(new RenderingElement(elementFixture({ key, name: 'Главная страница' })).toState().key).toBe(key);
    }

    for (const key of ['0', '01', '1abc', '9223372036854775808', '../1']) {
      expect(() => new RenderingElement(elementFixture({ key }))).toThrow('Invalid element identity');
    }

    for (const name of ['', '  ', 'a'.repeat(201), 'Header\nFooter']) {
      expect(() => new RenderingElement(elementFixture({ name }))).toThrow('Invalid element name');
    }
  });
  it('preserves missing, empty, false, zero and nullable defaults and permits the registry key new', () => {
    const parameters = parseElementParameters([
      { name: 'empty', kind: 'String', required: false, defaultValue: '' },
      { name: 'enabled', kind: 'Boolean', required: false, defaultValue: false },
      { name: 'count', kind: 'Number', required: false, defaultValue: 0 },
      { name: 'optional', kind: 'String', required: false },
      { name: 'nullable', kind: 'String', required: false, nullable: true, defaultValue: null },
      {
        name: 'context',
        kind: 'Object',
        required: false,
        properties: [{ name: 'site', kind: 'String', required: true }],
        defaultValue: { site: 'Public context' },
      },
    ]);
    const entity = new RenderingElement(elementFixture({ key: 'new', parameters }));

    expect(entity.toState().parameters).toEqual(parameters);
    expect(Object.hasOwn(entity.toState().parameters[3]!, 'defaultValue')).toBe(false);
  });
  it('rejects wrong defaults, duplicate/unsafe parameters and unknown schema fields', () => {
    expect(() => new RenderingElement(elementFixture({
      parameters: [{
        name: 'amount', kind: ParameterKind.Number, required: false, defaultValue: 'not a number',
      }],
    }))).toThrow('Default value');
    expect(() => new RenderingElement(elementFixture({
      parameters: [
        { name: 'title', kind: ParameterKind.String, required: false },
        { name: 'title', kind: ParameterKind.String, required: false },
      ],
    }))).toThrow('Duplicate');
    expect(() => new RenderingElement(elementFixture({
      parameters: [{
        name: 'constructor', kind: ParameterKind.String, required: false,
      }],
    }))).toThrow('Invalid parameter');
    expect(() => parseElementParameters([{ name: 'title', kind: 'String', required: false, execute: 'server code' }]))
      .toThrow('Invalid parameter contract');
  });
});
