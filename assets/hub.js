(function(){
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const themeKey = 'akatsuki_hub_theme';
  const soundKey = 'akatsuki_hub_sound';

  const moduleMap = Object.freeze({
    'smart-excel-toolkit': {
      title: 'Smart Excel Toolkit',
      subtitle: 'Excel breaker, merger, finder and VLOOKUP suite',
      path: './modules/smart-excel-toolkit/index.html',
      logo: './assets/logos/smart-excel-toolkit.svg'
    },
    'publisher-report': {
      title: 'Publisher Report Builder',
      subtitle: 'Publisher and counsellor report workflow',
      path: './modules/publisher-report/index.html',
      logo: './assets/logos/publisher-report.svg'
    },
    'cgs-data-loader': {
      title: 'CGS & Data Loader',
      subtitle: 'Data lookup and upload module',
      path: './modules/cgs-data-loader/index.html',
      logo: './assets/logos/cgs-data-loader.svg'
    },
    'centerly': {
      title: 'Centerly',
      subtitle: 'Counsellor center finder',
      path: './modules/centerly/index.html',
      logo: './assets/logos/centerly.svg'
    },
    'coupon-generator': {
      title: 'Crowd Coupon Generator',
      subtitle: 'Generate and manage counter coupons',
      path: './modules/coupon-generator/index.html',
      logo: './assets/logos/coupon-generator.svg'
    },
    'scholarship-calculator': {
      title: 'GEU Scholarship Calculator',
      subtitle: 'Scholarship and marks calculator',
      path: './modules/scholarship-calculator/index.html',
      logo: './assets/logos/scholarship-calculator.svg'
    }
  });

  function setTheme(theme){
    const safeTheme = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', safeTheme);
    localStorage.setItem(themeKey, safeTheme);
    const button = document.getElementById('themeToggle');
    if (button) button.textContent = safeTheme === 'dark' ? '☀️' : '🌙';
  }

  function soundEnabled(){
    return localStorage.getItem(soundKey) !== 'off';
  }

  function syncSound(){
    body.classList.toggle('sound-off', !soundEnabled());
  }

  function play(type){
    if (!soundEnabled()) return;
    try{
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const settings = {
        click:[390,.045,'triangle'],
        hover:[510,.028,'sine'],
        open:[330,.075,'triangle']
      }[type] || [390,.04,'sine'];

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.type = settings[2];
      oscillator.frequency.setValueAtTime(settings[0],context.currentTime);
      gain.gain.setValueAtTime(.001,context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.055,context.currentTime+.008);
      gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+settings[1]);
      oscillator.start();
      oscillator.stop(context.currentTime+settings[1]+.015);
    }catch(error){
      // Sound is optional; browser restrictions must never affect module use.
    }
  }

  function initControls(){
    setTheme(localStorage.getItem(themeKey) || 'dark');
    syncSound();

    document.getElementById('themeToggle')?.addEventListener('click',function(){
      play('click');
      setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('soundToggle')?.addEventListener('click',function(){
      const next = soundEnabled() ? 'off' : 'on';
      localStorage.setItem(soundKey,next);
      syncSound();
      if (next === 'on') play('click');
    });

    document.querySelectorAll('[data-sound="hover"]').forEach(function(element){
      element.addEventListener('mouseenter',function(){ play('hover'); });
      element.addEventListener('click',function(){ play('open'); });
    });

    document.querySelectorAll('button,a:not([data-sound="hover"])').forEach(function(element){
      element.addEventListener('click',function(){ play('click'); });
    });
  }

  function initViewer(){
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('module');
    const selected = moduleMap[slug];

    if (!selected){
      window.location.replace('./index.html');
      return;
    }

    document.title = selected.title + ' · AKATSUKI';
    const title = document.getElementById('moduleTitle');
    const subtitle = document.getElementById('moduleSubtitle');
    const logo = document.getElementById('moduleLogoWrap');
    const directLink = document.getElementById('openModuleDirect');
    const frame = document.getElementById('moduleFrame');
    const loader = document.getElementById('frameLoader');

    title.textContent = selected.title;
    subtitle.textContent = selected.subtitle;
    logo.innerHTML = '<img src="'+selected.logo+'" alt="">';
    directLink.href = selected.path;
    frame.src = selected.path;

    frame.addEventListener('load',function(){
      loader.classList.add('hidden');
    },{once:true});

    window.setTimeout(function(){
      loader.classList.add('hidden');
    },5000);
  }

  initControls();
  if (body.dataset.page === 'viewer') initViewer();
})();
