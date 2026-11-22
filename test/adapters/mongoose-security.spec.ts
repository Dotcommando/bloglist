import { spawnSync } from 'node:child_process';

it('keeps inherited built-ins intact when Mongoose processes dotted Mixed input', () => {
  // Isolate the vulnerable dependency: poisoning a built-in must not contaminate
  // Vitest itself or other application tests. No database or network is used.
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import mongoose from 'mongoose';
    const Item = mongoose.model('SecurityFixture', new mongoose.Schema({ meta: {} }));
    new Item(JSON.parse('{"meta.toString.call":1}'));
    process.stdout.write(typeof Object.prototype.toString.call);
  `], { encoding: 'utf8', timeout: 10000 });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe('function');
});
