'use strict';

const movie = document.querySelector('#movie');
const player = document.querySelector('#player');
const watch = document.querySelector('#watch');
const play = document.querySelector('#play');
const mute = document.querySelector('#mute');
const fullscreen = document.querySelector('#fullscreen');
const seek = document.querySelector('#seek');
const cover = document.querySelector('#cover');
const endActions = document.querySelector('#end-actions');
const error = document.querySelector('#error');
const chapters = [...document.querySelectorAll('.chapter')];
const chapterIndex = document.querySelector('#chapter-index');
const clock = document.querySelector('#clock-now');
const portrait = matchMedia('(max-width: 600px)');
const duration = 32;
let frame = 0;
let nextPosition = null;
let activeScene = -1;
let variant = '';

function setControl(button, icon, label) {
  button.querySelector('use').setAttribute('href', '#i-' + icon);
  button.setAttribute('aria-label', label);
  button.title = label;
}

function drawTime() {
  const time = nextPosition ?? movie.currentTime;
  const seconds = Math.min(duration, Math.floor(time));
  const index = Math.min(3, Math.floor(time / 8));
  clock.textContent = '00:' + String(seconds).padStart(2, '0');
  seek.value = time;
  seek.setAttribute('aria-valuetext', seconds + ' секунд из 32');
  seek.parentNode.style.setProperty('--played', (time / duration * 100) + '%');
  if (index !== activeScene) {
    chapterIndex.textContent = String(index + 1).padStart(2, '0');
    chapters.forEach((chapter, i) => {
      if (i === index) chapter.setAttribute('aria-current', 'true');
      else chapter.removeAttribute('aria-current');
    });
    activeScene = index;
  }
}

function refresh() {
  const atStart = (nextPosition ?? movie.currentTime) < .05 && movie.paused;
  watch.hidden = !atStart || !!movie.error;
  cover.hidden = !atStart || !!movie.error;
  endActions.hidden = !movie.ended;
  if (movie.ended) setControl(play, 'replay', 'Посмотреть снова');
  else if (movie.paused) setControl(play, 'play', 'Воспроизвести');
  else setControl(play, 'pause', 'Приостановить');
  drawTime();
}

function tick() {
  drawTime();
  if (!movie.paused && !movie.ended) frame = requestAnimationFrame(tick);
}

function jump(time) {
  nextPosition = Math.max(0, Math.min(duration, time));
  if (movie.readyState >= HTMLMediaElement.HAVE_METADATA) {
    movie.currentTime = nextPosition;
    nextPosition = null;
  }
  refresh();
}

async function start() {
  if (movie.ended) jump(0);
  try {
    await movie.play();
    error.hidden = true;
  } catch (reason) {
    // A rapid second click or a source change can interrupt a pending play.
    if (reason.name !== 'AbortError') error.hidden = false;
    refresh();
  }
}

function togglePlay() {
  if (movie.paused || movie.ended) start();
  else movie.pause();
}

function changeVariant() {
  const tag = portrait.matches ? 'portrait' : 'wide';
  if (tag === variant) return;
  const resume = !movie.paused;
  const time = nextPosition ?? movie.currentTime;
  variant = tag;
  player.dataset.variant = tag;
  const download = document.querySelector('.download');
  download.href = 'assets/film-' + tag + '.mp4';
  download.download = 'SportApp-' + tag + '.mp4';
  movie.poster = 'assets/poster-' + tag + '.webp';
  const url = new URL('assets/film-' + tag + '.mp4', document.baseURI).href;
  if ((movie.currentSrc || movie.src) !== url) {
    nextPosition = time;
    movie.src = url;
    movie.load();
    if (resume) start();
  }
  refresh();
}

function toggleMute() {
  movie.muted = !movie.muted;
}

function inFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement ||
    movie.webkitDisplayingFullscreen || player.classList.contains('immersive'));
}

function updateFullscreenButton() {
  const on = inFullscreen();
  setControl(fullscreen, on ? 'shrink' : 'expand', on ? 'Свернуть экран' : 'На весь экран');
}

async function toggleFullscreen() {
  try {
    if (player.classList.contains('immersive')) player.classList.remove('immersive');
    else if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
    else if (player.requestFullscreen) await player.requestFullscreen();
    else if (player.webkitRequestFullscreen) player.webkitRequestFullscreen();
    else if (movie.webkitEnterFullscreen) movie.webkitEnterFullscreen();
    else player.classList.add('immersive');
  } catch {
    player.classList.toggle('immersive');
  }
  updateFullscreenButton();
}

movie.controls = false;
watch.addEventListener('click', start);
play.addEventListener('click', togglePlay);
movie.addEventListener('click', togglePlay);
mute.addEventListener('click', toggleMute);
fullscreen.addEventListener('click', toggleFullscreen);
seek.addEventListener('input', () => jump(Number(seek.value)));
movie.addEventListener('volumechange', () => {
  setControl(mute, movie.muted ? 'mute' : 'volume', movie.muted ? 'Включить звук' : 'Выключить звук');
});
movie.addEventListener('play', () => {
  cancelAnimationFrame(frame);
  refresh();
  tick();
});
movie.addEventListener('pause', () => { cancelAnimationFrame(frame); refresh(); });
movie.addEventListener('ended', refresh);
movie.addEventListener('seeked', refresh);
movie.addEventListener('timeupdate', drawTime);
movie.addEventListener('loadedmetadata', () => {
  if (nextPosition !== null) jump(nextPosition);
  refresh();
});
movie.addEventListener('error', () => {
  error.hidden = false;
  watch.hidden = true;
});
chapters.forEach(chapter => chapter.addEventListener('click', () => {
  jump(Number(chapter.dataset.start));
  start();
  if (player.getBoundingClientRect().bottom < window.innerHeight * .4) {
    player.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
}));
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
movie.addEventListener('webkitendfullscreen', updateFullscreenButton);
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.key === 'Escape' && player.classList.contains('immersive')) {
    toggleFullscreen();
    return;
  }
  if (event.target.closest('button, a, input, textarea, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (key === ' ' || key === 'k') { event.preventDefault(); togglePlay(); }
  else if (key === 'm') toggleMute();
  else if (key === 'f') toggleFullscreen();
  else if (key === 'arrowleft' || key === 'arrowright') {
    event.preventDefault();
    jump(movie.currentTime + (key === 'arrowright' ? 5 : -5));
  }
});
portrait.addEventListener('change', changeVariant);
changeVariant();
