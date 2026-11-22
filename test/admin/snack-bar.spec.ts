import { get } from 'svelte/store';

import { dismissSnackBar, showSnackBar, snackBar, SnackBarVariant } from '../../admin/src/shared/ui/snack-bar.js';

describe('shared snack bar notifications', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    dismissSnackBar();
    vi.useRealTimers();
  });

  it('defaults to a regular notification and expires after its duration', () => {
    showSnackBar('Information');
    expect(get(snackBar)).toEqual({ message: 'Information', variant: SnackBarVariant.Regular });
    vi.advanceTimersByTime(2999);
    expect(get(snackBar)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(get(snackBar)).toBeNull();
  });

  it.each([SnackBarVariant.Failure, SnackBarVariant.Success])('supports %s and refreshes messages', (variant) => {
    showSnackBar('Copy result', variant, 2000);
    vi.advanceTimersByTime(1500);
    showSnackBar('Copy result', variant, 2000);
    vi.advanceTimersByTime(1999);
    expect(get(snackBar)).toEqual({ message: 'Copy result', variant });
    vi.advanceTimersByTime(1);
    expect(get(snackBar)).toBeNull();
  });
});
