import { connect } from 'node:net';
import { setTimeout } from 'node:timers/promises';

const socketPath = process.env.ZARYA_RESOURCE_SOCKET;

const seconds = Number(process.env.ZARYA_RESOURCE_WAIT_SECONDS ?? '60');

if (!socketPath || !Number.isFinite(seconds) || seconds <= 0) {
  throw new Error('An explicit resource socket and positive readiness deadline are required');
}

const deadline = Date.now() + seconds * 1000;

while (true) {
  const ready = await new Promise(resolve => {
    const socket = connect(socketPath);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(Math.max(1, Math.min(1000, deadline - Date.now())),
      () => socket.destroy(new Error('Resource helper connection deadline')));
  });

  if (ready) {
    break;
  }
  if (Date.now() >= deadline) {
    throw new Error('Resource helper did not become ready before the startup deadline');
  }
  await setTimeout(Math.min(250, Math.max(1, deadline - Date.now())));
}
