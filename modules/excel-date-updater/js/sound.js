/*
 * sound.js: soft water-drop sounds made with the Web Audio API.
 * No audio files: each "drop" is a short sine tone whose pitch slides up quickly,
 * which is what makes a droplet sound like a droplet. Volumes are kept very low.
 * The on/off choice is remembered in localStorage.
 */
(function (global) {
  'use strict';

  const KEY = (global.DATESTAMP_CONFIG && global.DATESTAMP_CONFIG.soundKey) || 'datestamp-sound';
  let ctx = null;
  let master = null;
  let enabled = true;
  function readSetting() {
    try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* storage unavailable */ }
  }
  readSetting();

  function audio() {
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const lp = ctx.createBiquadFilter(); // takes the edge off, keeps it "watery"
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      master.connect(lp);
      lp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** One droplet. f0 -> f1 is the pitch slide; vol is peak gain (keep under ~0.08). */
  function drop(o) {
    const c = audio();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const dur = o.dur || 0.09;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur * 0.55);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.05, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const sounds = {
    tap:     function () { drop({ f0: 720, f1: 1500, dur: 0.07, vol: 0.035 }); },
    select:  function () { drop({ f0: 540, f1: 1180, dur: 0.09, vol: 0.045 }); },
    add:     function () {
      drop({ f0: 420, f1: 900, dur: 0.1, vol: 0.045 });
      drop({ f0: 680, f1: 1450, dur: 0.08, vol: 0.04, delay: 0.075 });
    },
    remove:  function () { drop({ f0: 950, f1: 380, dur: 0.13, vol: 0.04 }); },
    success: function () {
      drop({ f0: 520, f1: 1040, dur: 0.1, vol: 0.045 });
      drop({ f0: 700, f1: 1400, dur: 0.1, vol: 0.04, delay: 0.09 });
      drop({ f0: 940, f1: 1880, dur: 0.12, vol: 0.035, delay: 0.18 });
    },
    error:   function () {
      drop({ f0: 340, f1: 200, dur: 0.16, vol: 0.05 });
      drop({ f0: 300, f1: 170, dur: 0.18, vol: 0.04, delay: 0.12 });
    },
    micOn:   function () { drop({ f0: 600, f1: 1600, dur: 0.12, vol: 0.04 }); },
    micOff:  function () { drop({ f0: 1300, f1: 520, dur: 0.12, vol: 0.035 }); }
  };

  global.Sound = {
    key: KEY,
    refresh: readSetting,
    play: function (name) {
      if (!enabled || !sounds[name]) return;
      try { sounds[name](); } catch (e) { /* audio not available */ }
    },
    isEnabled: function () { return enabled; },
    setEnabled: function (on) {
      enabled = !!on;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
    }
  };
})(window);
