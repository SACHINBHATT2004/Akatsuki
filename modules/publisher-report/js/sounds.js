(function () {
  'use strict';

  const STORAGE_KEY = 'publisherReportSoundEnabled';
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let enabled = safeStorageGet(STORAGE_KEY) !== 'false';
  let audioContext = null;
  let userActivated = false;
  let lastHoverAt = 0;
  let lastHoverTarget = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const soundToggle = document.getElementById('soundToggle');
    updateSoundButton(soundToggle);

    document.addEventListener('pointerdown', activateAudio, { capture: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') activateAudio();
    }, { capture: true });

    if (soundToggle) {
      soundToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        activateAudio();
        if (enabled) {
          playSound('mute');
          enabled = false;
        } else {
          enabled = true;
          playSound('unmute');
        }
        safeStorageSet(STORAGE_KEY, String(enabled));
        updateSoundButton(soundToggle);
      });
    }

    document.addEventListener('click', (event) => {
      const target = event.target.closest('button, summary, select, input[type="checkbox"]');
      if (!target || target.id === 'soundToggle' || target.disabled) return;
      if (target.id === 'themeToggle') playSound('theme');
      else if (target.id === 'downloadExcelButton' || target.id === 'downloadTemplateButton') playSound('download');
      else if (target.id === 'generateButton') playSound('generate');
      else playSound('click');
    });

    document.addEventListener('pointerover', (event) => {
      if (!userActivated || !enabled) return;
      const target = event.target.closest('.button, .icon-button, .upload-zone, .mapping-item, .metric-card, .logic-item, summary, .text-button');
      if (!target || target === lastHoverTarget || target.disabled) return;
      const now = performance.now();
      if (now - lastHoverAt < 95) return;
      lastHoverAt = now;
      lastHoverTarget = target;
      playSound('hover');
    });

    document.addEventListener('pointerout', (event) => {
      if (lastHoverTarget && !lastHoverTarget.contains(event.relatedTarget)) lastHoverTarget = null;
    });

    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
      uploadZone.addEventListener('dragenter', () => playSound('drag'));
      uploadZone.addEventListener('drop', () => playSound('drop'));
    }

    const toastRegion = document.getElementById('toastRegion');
    if (toastRegion) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement) || !node.classList.contains('toast')) return;
            if (node.classList.contains('error')) playSound('error');
            else if (node.classList.contains('success')) playSound('success');
            else playSound('notice');
          });
        });
      });
      observer.observe(toastRegion, { childList: true });
    }
  }


  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      // Sound still works when browser storage is unavailable.
    }
  }

  function updateSoundButton(button) {
    if (!button) return;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Mute sounds' : 'Enable sounds');
    button.title = enabled ? 'Sound effects on' : 'Sound effects off';
  }

  function activateAudio() {
    userActivated = true;
    const context = getAudioContext();
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  function getAudioContext() {
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    return audioContext;
  }

  function playSound(name) {
    if (!enabled || !userActivated) return;
    const context = getAudioContext();
    if (!context) return;
    if (context.state === 'suspended') context.resume().catch(() => {});

    switch (name) {
      case 'hover':
        tone(680, 0.022, 0, 'sine', 0.012, 760);
        break;
      case 'click':
        tone(430, 0.045, 0, 'triangle', 0.022, 520);
        tone(650, 0.035, 0.025, 'sine', 0.011, 720);
        break;
      case 'theme':
        tone(390, 0.07, 0, 'sine', 0.018, 620);
        tone(620, 0.08, 0.045, 'triangle', 0.014, 820);
        break;
      case 'generate':
        tone(330, 0.06, 0, 'triangle', 0.02, 430);
        tone(490, 0.07, 0.055, 'triangle', 0.019, 620);
        tone(690, 0.09, 0.11, 'sine', 0.015, 820);
        break;
      case 'download':
        tone(760, 0.055, 0, 'sine', 0.018, 620);
        tone(560, 0.07, 0.05, 'triangle', 0.018, 420);
        break;
      case 'success':
        tone(523.25, 0.11, 0, 'sine', 0.019, 560);
        tone(659.25, 0.12, 0.07, 'sine', 0.018, 700);
        tone(783.99, 0.17, 0.14, 'triangle', 0.017, 840);
        break;
      case 'error':
        tone(260, 0.11, 0, 'sawtooth', 0.018, 205);
        tone(190, 0.14, 0.08, 'triangle', 0.02, 145);
        break;
      case 'notice':
        tone(520, 0.07, 0, 'sine', 0.014, 590);
        break;
      case 'drag':
        tone(350, 0.08, 0, 'sine', 0.012, 540);
        break;
      case 'drop':
        tone(540, 0.07, 0, 'triangle', 0.018, 680);
        tone(760, 0.1, 0.055, 'sine', 0.015, 860);
        break;
      case 'mute':
        tone(500, 0.06, 0, 'triangle', 0.015, 350);
        tone(320, 0.08, 0.045, 'sine', 0.013, 230);
        break;
      case 'unmute':
        tone(360, 0.06, 0, 'triangle', 0.018, 510);
        tone(620, 0.11, 0.055, 'sine', 0.016, 760);
        break;
      default:
        break;
    }
  }

  function tone(startFrequency, duration, delay, waveType, volume, endFrequency) {
    const context = getAudioContext();
    if (!context || context.state === 'closed') return;

    const startAt = context.currentTime + Math.max(0, delay || 0);
    const stopAt = startAt + Math.max(.015, duration || .05);
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = waveType || 'sine';
    oscillator.frequency.setValueAtTime(startFrequency, startAt);
    if (endFrequency && endFrequency !== startFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), stopAt);
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume || .015), startAt + .008);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt + .01);
  }
}());
