import { readAdminUserCredentials } from '../../src/adapters/inbound/cli/admin-users/admin-user-credentials.parser.js';
import { createAdminUserFromConsole } from '../../src/adapters/inbound/cli/admin-users/create-admin-user.cli.js';
import { account } from '../support/admin-users.js';

async function* bytes(value: string): AsyncGenerator<Uint8Array> {
  yield Buffer.from(value);
}

describe('private console credential input', () => {
  it('reads exactly two lines and preserves password whitespace without echoing it', async () => {
    expect(await readAdminUserCredentials(bytes('admin@example.test\n  synthetic password  \n')))
      .toEqual({ email: 'admin@example.test', password: '  synthetic password  ' });
  });
  it('assigns SiteAdmin to the requested site with the same credential input', async () => {
    const execute = vi.fn(async () => account().profile());

    await createAdminUserFromConsole({ execute }, 'operator', bytes('admin@example.test\nsynthetic password\n'),
      'site-one');

    expect(execute).toHaveBeenCalledExactlyOnceWith({
      actorId: 'operator',
      email: 'admin@example.test',
      password: 'synthetic password',
      assignment: { roleId: 'cms.system.site-admin', siteId: 'site-one' },
    });
  });

  it('rejects extra lines, missing lines and oversized input', async () => {
    await expect(readAdminUserCredentials(bytes('one-line'))).rejects.toThrow();
    await expect(readAdminUserCredentials(bytes('email\npassword\nextra\n'))).rejects.toThrow();
    await expect(readAdminUserCredentials(bytes('x'.repeat(8193)))).rejects.toThrow();
  });
});
