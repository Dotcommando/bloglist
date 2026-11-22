import { writable } from 'svelte/store';

export enum SnackBarVariant {
  Regular = 'regular',
  Failure = 'failure',
  Success = 'success',
}

export interface ISnackBarNotification {
  readonly message: string;
  readonly variant: SnackBarVariant;
}

const notification = writable<ISnackBarNotification | null>(null);

let timeout: ReturnType<typeof setTimeout> | undefined;

export const snackBar = { subscribe: notification.subscribe };

export function dismissSnackBar(): void {
  clearTimeout(timeout);
  timeout = undefined;
  notification.set(null);
}

export function showSnackBar(message: string, variant = SnackBarVariant.Regular, duration = 3000): void {
  clearTimeout(timeout);
  notification.set({ message, variant });
  timeout = setTimeout(dismissSnackBar, duration);
}
