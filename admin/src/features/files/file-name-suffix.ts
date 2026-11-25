const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function fileNameSuffix(name: string): string {
  const dot = name.lastIndexOf('.');
  const stemEnd = dot > 0 && dot < name.length - 1 ? name.slice(0, dot).replace(/\.+$/u, '').length : name.length;
  const tail = Array.from(graphemes.segment(name.slice(0, stemEnd)), ({ segment }) => segment).slice(-3).join('');

  return name.slice(stemEnd - tail.length);
}
