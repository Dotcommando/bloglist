import './shared/styles/auth.css';

import { mount } from 'svelte';

import App from './app/App.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Missing administration root');
}

mount(App, { target });
