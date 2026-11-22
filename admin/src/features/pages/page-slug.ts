export const russianTransliteration: Readonly<Record<string, string>> = Object.freeze({
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
});

export function pageSlug(title: string): string {
  return Array.from(title.normalize('NFC').toLowerCase(), (letter) => russianTransliteration[letter] ?? letter)
    .join('').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function suggestedPagePath(title: string, state: {
  path: string;
  first: boolean;
  existing: boolean;
  manual: boolean;
  parentPath?: string;
}): string {
  if (state.first || state.existing || state.manual) {
    return state.path;
  }

  const slug = pageSlug(title);
  const prefix = pagePathPrefix(state.parentPath);

  return slug ? prefix + slug + '/' : prefix;
}

export function pagePathPrefix(path?: string | null): string {
  return path ? path.endsWith('/') ? path : path + '/' : '/';
}

export function suggestedPageMark(path: string, fallback: string, occupied: readonly string[]): string {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
    return fallback;
  }

  let segment: string;

  try {
    segment = decodeURIComponent(path.split('/').filter(Boolean).at(-1) ?? '');
  } catch {
    return fallback;
  }
  const slug = pageSlug(segment);
  const words = slug.split('-').filter(Boolean);
  const readable = words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join('');
  const candidate = path === '/' ? 'index'
    : !readable ? fallback : /^[A-Za-z]/.test(readable) ? readable : 'Page' + readable;

  return occupied.some((mark) => mark.toLowerCase() === candidate.toLowerCase()) ? fallback : candidate;
}
