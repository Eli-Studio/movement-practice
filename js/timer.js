// ============================================================
// timer.js — Rest timer with pause/resume/skip
// ============================================================

import { playTimerComplete } from './audio.js';

let _interval   = null;
let _remaining  = 0;
let _paused     = false;
let _onComplete = null;
let _audioEnabled = true;

export function startTimer(seconds, onTick, onComplete, audioEnabled = true) {
  stopTimer();

  _remaining    = seconds;
  _onComplete   = onComplete;
  _paused       = false;
  _audioEnabled = audioEnabled;

  if (onTick) onTick(_remaining);

  _interval = setInterval(() => {
    if (_paused) return;

    _remaining--;

    if (onTick) onTick(_remaining);

    if (_remaining <= 0) {
      clearInterval(_interval);
      _interval = null;
      playTimerComplete(_audioEnabled);
      if (_onComplete) _onComplete();
    }
  }, 1000);
}

export function stopTimer() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
  _remaining  = 0;
  _paused     = false;
  _onComplete = null;
}

export function pauseTimer()  { _paused = true;  }
export function resumeTimer() { _paused = false; }
export function isTimerPaused()    { return _paused;    }

export function skipTimer() {
  const cb = _onComplete;
  stopTimer();
  if (cb) cb();
}
