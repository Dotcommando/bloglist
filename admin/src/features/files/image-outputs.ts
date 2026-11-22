import type { IFileOutput } from './files.types.js';

export function imageOutputs(outputs: readonly IFileOutput[]): readonly IFileOutput[] {
  return outputs.filter((output) => output.mimeType.startsWith('image/')).toSorted((a, b) =>
    (a.dimensions?.width ?? 0) - (b.dimensions?.width ?? 0)
    || (a.dimensions?.height ?? 0) - (b.dimensions?.height ?? 0));
}

export function defaultImageOutput(outputs: readonly IFileOutput[]): IFileOutput | undefined {
  const images = imageOutputs(outputs);
  const sized = images.filter((output) => output.dimensions);
  const prepared = sized.filter((output) => output.dimensions!.width <= 1200);

  return prepared.at(-1) ?? sized[0] ?? images[0];
}
