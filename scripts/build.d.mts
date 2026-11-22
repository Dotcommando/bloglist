interface IBuildOptions {
  readonly run?: (args: readonly string[]) => Promise<void>;
  readonly now?: () => number;
  readonly report?: (line: string) => void;
}

export function runBuild(options?: IBuildOptions): Promise<void>;
