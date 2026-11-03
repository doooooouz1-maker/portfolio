'use strict';

// Repeatable scroll reveal: enter = fade in, leave = fade out.
// Each artboard has a real bounding box, including its positioned HTML text.
(() => {
  const boards = [...document.querySelectorAll('.artboard')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window) || reducedMotion.matches) return;

  let observers = [];
  let resizeTimer;
  document.documentElement.classList.add('reveal-enabled');

  function connectObservers() {
    observers.forEach(observer => observer.disconnect());
    observers = [];
    for (const board of boards) {
      // Keep the threshold reachable for long mobile sections.
      const height = Math.max(board.getBoundingClientRect().height, 1);
      const threshold = Math.min(0.22, window.innerHeight * 0.22 / height);
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const visible = entry.isIntersecting && entry.intersectionRatio >= threshold;
          entry.target.querySelectorAll('.reveal').forEach(element => {
            element.classList.toggle('is-visible', visible);
          });
        }
      }, { threshold: [0, threshold], rootMargin: '0px' });
      observer.observe(board);
      observers.push(observer);
      board.querySelectorAll('.reveal').forEach((element, index) => {
        element.style.setProperty('--reveal-delay', `${index % 5 * 55}ms`);
      });
    }
  }

  connectObservers();
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(connectObservers, 150);
  }, { passive: true });
  reducedMotion.addEventListener('change', event => {
    document.documentElement.classList.toggle('reveal-enabled', !event.matches);
    if (event.matches) observers.forEach(observer => observer.disconnect());
    else connectObservers();
  });
  window.addEventListener('beforeprint', () => {
    document.documentElement.classList.remove('reveal-enabled');
  });
  window.addEventListener('afterprint', () => {
    if (!reducedMotion.matches) {
      document.documentElement.classList.add('reveal-enabled');
      connectObservers();
    }
  });
})();

// Shared accessible side menu.
(() => {
 const toggle = document.querySelector('.menu-toggle');
 const menu = document.querySelector('.site-menu');
 const backdrop = document.querySelector('.menu-backdrop');
 const close = document.querySelector('.menu-close');
 if (!toggle || !menu || !backdrop || !close) return;
 const background = [...document.body.children].filter(el => el !== menu && el !== backdrop);
 let closeTimer;
 function setOpen(open) {
  clearTimeout(closeTimer);
  toggle.setAttribute('aria-expanded', String(open));
  if (open) {
   menu.hidden = false;
   backdrop.hidden = false;
   menu.inert = false;
   document.body.classList.add('menu-open');
   background.forEach(el => el.inert = true);
   void menu.offsetWidth;
   menu.classList.add('is-open');
   backdrop.classList.add('is-open');
   close.focus();
  } else {
   menu.classList.remove('is-open');
   backdrop.classList.remove('is-open');
   menu.inert = true;
   background.forEach(el => el.inert = false);
   toggle.focus();
   closeTimer = setTimeout(() => {
    menu.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove('menu-open');
   }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 380);
  }
 }
 toggle.addEventListener('click', () => setOpen(true));
 close.addEventListener('click', () => setOpen(false));
 backdrop.addEventListener('click', () => setOpen(false));
 document.addEventListener('keydown', event => {
  if (menu.hidden) return;
  if (event.key === 'Escape') setOpen(false);
  if (event.key === 'Tab') {
   const items = [...menu.querySelectorAll('button, a[href]')];
   const first = items[0], last = items[items.length - 1];
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
 });
})();

// Replay the page fade when returning through browser history.
window.addEventListener('pageshow', event => {
 if (!event.persisted) return;
 document.body.classList.remove('menu-open');
 document.querySelectorAll('body > [inert]').forEach(el => el.inert = false);
 document.querySelectorAll('.site-menu, .menu-backdrop').forEach(el => { el.hidden = true; el.classList.remove('is-open'); });
 document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
 if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 document.body.animate([{opacity:0},{opacity:1}], {duration:650,easing:'ease'});
});

// Independent random wheel motion for cover and contents lettering.
(() => {
 const lines = [...document.querySelectorAll('.home-page .cover-word, .contents-page .contents-board h1, .contents-page .contents-project h2 > span, .contents-page .project-four h2, .contents-page .related-works > li')];
 if (!lines.length) return;
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 let resetTimer;
 let active = false;
 let direction = 0;
 let amplitudes = [];
 let progress = 0;
 function reset() {
  active = false;
  progress = 0;
  lines.forEach(line => line.style.setProperty('--line-shift', '0px'));
 }
 window.addEventListener('wheel', event => {
  if (reduced.matches || document.body.classList.contains('menu-open') || !event.deltaY || event.ctrlKey) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
  const nextDirection = -Math.sign(delta);
  if (!active || nextDirection !== direction) {
   amplitudes = lines.map(() => 4 + Math.random() * 14);
   progress = 0;
  }
  active = true;
  direction = nextDirection;
  progress = Math.min(1, progress + Math.abs(delta) / 100);
  lines.forEach((line, index) => {
   line.style.setProperty('--line-shift', `${direction * amplitudes[index] * progress}px`);
  });
  clearTimeout(resetTimer);
  resetTimer = setTimeout(reset, 30);
 }, {passive:true});
 reduced.addEventListener('change', () => { clearTimeout(resetTimer); reset(); });
})();

// Expand artwork from its thumbnail, then return it to the same position.
(() => {
 const viewer = document.querySelector('.fan-lightbox');
 if (!viewer) return;
 const image = viewer.querySelector('img');
 const scrimColor = getComputedStyle(viewer).getPropertyValue('--fan-scrim-color').trim();
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 let source, motion, closing = false;
 function sourceTransform() {
  const box = source.getBoundingClientRect();
  const ratio = source.naturalWidth / source.naturalHeight;
  const width = Math.min(box.width, box.height * ratio);
  const height = width / ratio;
  const target = image.getBoundingClientRect();
  // Inline positioning defines the final frame independently of animation.
  const left = parseFloat(image.style.left), top = parseFloat(image.style.top);
  return `translate(${box.left + (box.width-width)/2-left}px, ${box.top + (box.height-height)/2-top}px) scale(${width/parseFloat(image.style.width)}, ${height/parseFloat(image.style.height)})`;
 }
 function positionImage() {
  const pad = innerWidth <= 700 ? 16 : 48;
  const scale = Math.min((innerWidth-pad*2)/source.naturalWidth, (innerHeight-120)/source.naturalHeight);
  const width = source.naturalWidth*scale, height = source.naturalHeight*scale;
  Object.assign(image.style,{width:width+'px',height:height+'px',left:(innerWidth-width)/2+'px',top:(innerHeight-height)/2+'px'});
 }
 document.querySelectorAll('.fan-photo').forEach(button => {
  button.addEventListener('click', () => {
   source = button.querySelector('img');
   if (!source.naturalWidth || viewer.open) return;
   closing = false;
   image.src = button.dataset.full;
   image.alt = source.alt;
   viewer.showModal();
   document.body.classList.add('fan-viewing');
   positionImage();
   motion = image.animate([{transform:sourceTransform()},{transform:'none'}],{duration:reduced.matches?0:420,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'});
   viewer.animate([{backgroundColor:'rgba(0,0,0,0)'},{backgroundColor:scrimColor}],{duration:reduced.matches?0:420});
  });
 });
 function close() {
  if (!viewer.open || closing) return;
  closing = true;
  const current = getComputedStyle(image).transform;
  motion?.cancel();
  motion = image.animate([{transform:current},{transform:sourceTransform()}],{duration:reduced.matches?0:320,easing:'cubic-bezier(.4,0,.3,1)',fill:'both'});
  viewer.animate([{backgroundColor:scrimColor},{backgroundColor:'rgba(0,0,0,0)'}],{duration:reduced.matches?0:320,fill:'forwards'});
  motion.finished.then(() => { viewer.close(); }).catch(() => {});
 }
 image.addEventListener('click', close);
 image.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); close(); }
 });
 viewer.addEventListener('click', event => { if (event.target === viewer) close(); });
 viewer.addEventListener('cancel', event => { event.preventDefault(); close(); });
 viewer.addEventListener('close', () => {
  motion?.cancel();
  viewer.getAnimations().forEach(animation => animation.cancel());
  document.body.classList.remove('fan-viewing');
  image.removeAttribute('src');
  closing = false;
 });
 window.addEventListener('resize', () => { if (viewer.open) { motion?.cancel(); positionImage(); } });
})();

// Fade galleries as they enter the viewport, matching the portfolio reveal.
(() => {
 const galleries = [...document.querySelectorAll('.fan-gallery')];
 if (!galleries.length || !('IntersectionObserver' in window)) return;
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.target.classList.toggle('is-visible', entry.isIntersecting));
 }, {threshold:0,rootMargin:'0px 0px -24px 0px'});
 function connect() {
  observer.disconnect();
  document.documentElement.classList.toggle('fan-reveal-enabled', !reduced.matches);
  if (!reduced.matches) galleries.forEach(gallery => observer.observe(gallery));
 }
 connect();
 reduced.addEventListener('change', connect);
})();

// Reveal each project artboard without changing its layout or fixed controls.
(() => {
 const boards = [...document.querySelectorAll('.corona-board, .toy-board, .other-board, .drink-board')];
 if (!boards.length || !('IntersectionObserver' in window)) return;
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.target.classList.toggle('is-visible', entry.isIntersecting));
 }, {threshold:0, rootMargin:'0px 0px -24px 0px'});
 function connect() {
  observer.disconnect();
  document.documentElement.classList.toggle('corona-reveal-enabled', !reduced.matches);
  if (!reduced.matches) boards.forEach(board => observer.observe(board));
 }
 connect();
 reduced.addEventListener('change', connect);
})();

// Related-work images open in the same click-to-close viewing pattern.
(() => {
 const viewer = document.querySelector('.project-image-viewer');
 if (!viewer) return;
 const enlarged = viewer.querySelector('img');
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 let source;
 function open(image) {
  source = image;
  enlarged.src = image.getAttribute('href') || image.getAttribute('xlink:href');
  enlarged.alt = image.closest('svg').getAttribute('aria-label') || '作品画像';
  viewer.showModal();
  if (!reduced.matches) viewer.animate([{opacity:0, transform:'scale(.94)'},{opacity:1, transform:'scale(1)'}], {duration:320,easing:'ease-out'});
  enlarged.focus();
 }
 document.querySelectorAll('.other-board image').forEach(image => {
  image.setAttribute('tabindex','0');
  image.setAttribute('role','button');
  image.setAttribute('aria-label','画像を拡大');
  image.addEventListener('click', () => open(image));
  image.addEventListener('keydown', event => {
   if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(image); }
  });
 });
 viewer.addEventListener('click', () => viewer.close());
 enlarged.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); viewer.close(); }
 });
 viewer.addEventListener('close', () => { enlarged.removeAttribute('src'); source?.focus(); });
})();
