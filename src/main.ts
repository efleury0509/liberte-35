import './styles/jetons.css';
import './styles/base.css';
import { mount } from 'svelte';
import App from './App.svelte';

const cible = document.getElementById('app');
if (!cible) {
  throw new Error('Élément #app introuvable');
}

export default mount(App, { target: cible });
