import './styles/jetons.css';
import './styles/base.css';
import { mount } from 'svelte';
import App from './App.svelte';
import Galerie from './composants/base/Galerie.svelte';
import { dansTauri } from './lib/plateforme';

const cible = document.getElementById('app');
if (!cible) {
  throw new Error('Élément #app introuvable');
}

// La galerie des fondations visuelles n'existe que dans l'aperçu navigateur.
const galerie = !dansTauri() && new URLSearchParams(location.search).has('galerie');

export default mount(galerie ? Galerie : App, { target: cible });
