// ============================================================
// audio.js — iOS-safe audio management
//
// iOS WebKit blocks any .play() call that isn't directly inside
// a user-gesture handler — INCLUDING calls triggered by the
// `ended` event of a previous audio element.
//
// Fix: pre-create ALL Audio elements at module load, then
// play+pause every one of them inside unlockAudio() (which is
// called on the very first user tap). Once an element has been
// touched by a gesture, iOS allows it to be resumed/restarted
// programmatically for the rest of the session.
// ============================================================

import { AUDIO_FILES, MEDITATION_TRACKS } from './config.js';

// ---- Pre-create elements at module load --------------------
// Do NOT create new Audio() objects later — reuse these.

const _chime       = new Audio(AUDIO_FILES.timerComplete);
const _session     = new Audio(AUDIO_FILES.sessionComplete);
const _buttonClick = new Audio(AUDIO_FILES.buttonClick);
const _med         = MEDITATION_TRACKS.map(src => new Audio(src));

[_chime, _session, _buttonClick, ..._med].forEach(a => { a.preload = 'auto'; });

let _unlocked         = false;
let _meditationActive = false;
let _medIdx           = 0;
let _lastButtonClickAt = 0;

// ---- Unlock (call on every early user tap) -----------------

export function unlockAudio() {
  if (_unlocked) return;
  _unlocked = true;

  // Touch every audio element inside this gesture handler so
  // iOS grants permission for future programmatic .play() calls.
  [_chime, _session, _buttonClick, ..._med].forEach(audio => {
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
    } else {
      try { audio.pause(); audio.currentTime = 0; } catch (_) {}
    }
  });
}

// ---- Chime sounds ------------------------------------------

export function playTimerComplete(audioEnabled) {
  if (!audioEnabled) return;
  _chime.currentTime = 0;
  _chime.play().catch(() => {});
}

export function playSessionComplete(audioEnabled) {
  if (!audioEnabled) return;
  _session.currentTime = 0;
  _session.play().catch(() => {});
}

// ---- Button click --------------------------------------------
// Lightweight UI tap sound. Uses the same pre-created/unlocked
// element as everything else above — never `new Audio()` here,
// that's exactly the pattern that fails silently on iOS after
// the first tap. Small cooldown prevents rapid-tap sound spam.

export function playButtonClick(audioEnabled) {
  if (!audioEnabled) return;
  const now = Date.now();
  if (now - _lastButtonClickAt < 80) return;
  _lastButtonClickAt = now;

  _buttonClick.currentTime = 0;
  _buttonClick.play().catch(() => {
    // Ignore — browser autoplay restrictions or file not yet unlocked.
  });
}

// ---- Meditation loop ---------------------------------------
// Alternates through MEDITATION_TRACKS indefinitely until
// stopMeditation() is called externally (by the timer or the
// End button). The initial call to _playNext() happens directly
// inside the user-gesture handler (the "5 min" / "10 min" tap
// in app.js), so iOS permits it.

export function playMeditation(minutes, audioEnabled) {
  if (!audioEnabled) return;
  stopMeditation();
  _meditationActive = true;
  _medIdx = 0;
  _playNext();
}

function _playNext() {
  if (!_meditationActive) return;

  const audio = _med[_medIdx % _med.length];
  _medIdx++;

  // Clear any previous ended handler
  audio.onended = null;
  audio.currentTime = 0;

  // Wire next track BEFORE playing, so the handler is in place
  // when the track ends.
  audio.onended = () => {
    if (_meditationActive) _playNext();
  };

  audio.play().catch(err => {
    // Shouldn't happen after unlock, but guard anyway.
    // If iOS still blocks (e.g. audio never unlocked), fail silently.
    console.warn('Meditation audio blocked:', err.name, err.message);
  });
}

export function stopMeditation() {
  _meditationActive = false;
  _med.forEach(a => {
    a.onended = null;
    a.pause();
    a.currentTime = 0;
  });
}
