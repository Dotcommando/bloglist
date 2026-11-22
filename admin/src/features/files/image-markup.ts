import type { IFileDimensions, IFileOutput, ISiteFile } from './files.types.js';

function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function imageMarkup(file: ISiteFile, picture: boolean, sizes: string, alt: string): string {
  const images = file.outputs.filter((output): output is IFileOutput & { dimensions: IFileDimensions } =>
    output.dimensions !== null);
  const outputs = [...new Map([...images].sort((a, b) => a.dimensions.width - b.dimensions.width)
    .map((output) => [output.dimensions.width, output])).values()];
  const largest = outputs.at(-1);

  if (!largest) {
    throw new Error('No public image output');
  }
  if (file.hasVariants && !sizes.trim()) {
    throw new Error('Declare image layout sizes');
  }

  const srcset = outputs.map((output) => attribute(output.url) + ' ' + output.dimensions.width + 'w').join(', ');
  const responsive = file.hasVariants ? ' srcset="' + srcset + '" sizes="' + attribute(sizes.trim()) + '"' : '';
  const image = '<img src="' + attribute(largest.url) + '" width="' + largest.dimensions.width
    + '" height="' + largest.dimensions.height + '" alt="' + attribute(alt) + '"' + (picture ? '' : responsive) + '>';

  return picture ? '<picture>\n' + (file.hasVariants ? '  <source type="' + attribute(largest.mimeType)
    + '"' + responsive + '>\n' : '') + '  ' + image + '\n</picture>' : image;
}
