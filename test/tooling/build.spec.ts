import { runBuild } from '../../scripts/build.mjs';

describe('complete build timing', () => {
  it('reports the elapsed time of every build stage together, after the admin build', async () => {
    let time = 1000;
    const events: string[] = [];
    const report = vi.fn((line: string) => {
      events.push(line);
    });

    await runBuild({
      now: () => time,
      run: async (args) => {
        events.push(args.join(' '));
        time += 2000;
      },
      report,
    });
    expect(events.slice(0, 3)).toEqual([
      'build:server', 'build:runtime-addons', 'build --workspace @zarya/admin',
    ]);
    expect(events.at(-1)).toBe('Zarya build completed in 6.00 s.');
    expect(report).toHaveBeenCalledOnce();
  });

  it('stops after a failed stage and never prints a successful build summary', async () => {
    const report = vi.fn();
    const run = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'build:runtime-addons') {
        throw new Error('Runtime package build failed');
      }
    });

    await expect(runBuild({ run, report, now: () => 0 })).rejects.toThrow('Runtime package build failed');
    expect(run).toHaveBeenCalledTimes(2);
    expect(report).not.toHaveBeenCalled();
  });
});
