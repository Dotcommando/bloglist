import cssnano from 'cssnano';
import postcss, { type ChildNode, type Root } from 'postcss';
import valueParser from 'postcss-value-parser';

import { requireCondition } from '../../../../domain/shared/validation.js';

const visual = new Set(['color', 'background-color', 'background-image', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'fill', 'stroke']);

export function cssCouplings(sources: readonly string[]): readonly string[] {
  const blocked = new Set<string>();

  for (const css of sources) {
    postcss.parse(css).walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase();

      if (property === 'all') {
        for (const name of visual) {
          blocked.add(name);
        }
      }
      if (/^border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/.test(property)) {
        for (const name of visual) {
          if (name.startsWith('border')) {
            blocked.add(name);
          }
        }
      }
      if (property === 'background') {
        blocked.add('background-color');
        blocked.add('background-image');
      }
      if (property === 'outline') {
        blocked.add('outline-color');
      }
      if (property === 'text-decoration') {
        blocked.add('text-decoration-color');
      }
    });
  }

  return [...blocked];
}

function validate(css: Root): void {
  css.walkAtRules((rule) => {
    requireCondition(rule.name.toLowerCase() !== 'import', 'CSS @import must be resolved before publication');

    if (rule.name.toLowerCase() === 'media') {
      valueParser(rule.params).walk((node) => {
        if (node.type !== 'word') {
          return;
        }

        const dimension = valueParser.unit(node.value);

        if (dimension && dimension.unit === 'px') {
          requireCondition([576, 768, 992, 1200].includes(Number(dimension.number)), 'Unsupported layout breakpoint');
        }
      });
      requireCondition(!/max-width/.test(rule.params), 'Use shared upward layout thresholds');
    }
  });
  css.walkDecls((declaration) => {
    valueParser(declaration.value).walk((node) => {
      if (node.type === 'function' && ['url', 'env'].includes(node.value)) {
        return false;
      }
      if (node.type !== 'word') {
        return;
      }

      const dimension = valueParser.unit(node.value);

      if (
        dimension
        && dimension.unit
        && !['px', '%', 'vh', 'vw', 'fr', 'ms', 's', 'deg', 'rad',
          'grad', 'turn', 'dpi', 'dppx'].includes(dimension.unit)
      ) {
        throw declaration.error(`Unsupported CSS unit: ${dimension.unit}`);
      }
    });
  });
}

function prune(node: Root | ChildNode, structural: boolean): void {
  if ('nodes' in node && node.nodes) {
    for (const child of [...node.nodes]) {
      prune(child, structural);
    }

    if (
      node.type !== 'root'
      && !node.nodes.length
      && !(node.type === 'atrule'
&& node.name === 'layer' && structural)
    ) {
      node.remove();
    }
  }
}

export async function splitCss(css: string, blocked: readonly string[]): Promise<{ reflow: string; repaint: string }> {
  const original = postcss.parse(css);

  validate(original);
  const coupled = new Set([...blocked, ...cssCouplings([css])]);
  const groups: string[] = [];

  for (const structural of [true, false]) {
    const root = original.clone();

    root.walkDecls((declaration) => {
      let forced = false;
      let parent = declaration.parent;

      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && ['font-face', 'keyframes', '-webkit-keyframes'].includes(parent.name)) {
          forced = true;
        }
        parent = parent.parent;
      }
      const isVisual = !forced && visual.has(declaration.prop.toLowerCase()) && !coupled.has(
        declaration.prop.toLowerCase());

      if (isVisual === structural) {
        declaration.remove();
      }
    });

    if (!structural) {
      root.walkAtRules('charset', (rule) => {
        rule.remove();
      });
    }
    prune(root, structural);
    groups.push((await postcss([cssnano({ preset: ['default', { normalizeUrl: false }] })])
      .process(root, { from: undefined })).css);
  }

  return { reflow: groups[0]!, repaint: groups[1]! };
}
