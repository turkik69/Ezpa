/* Ezba UI v2 enhancer — visual semantics only. No business logic changes. */
(() => {
  const icon = (name) => {
    const icons = {
      members:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      tournament:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4ZM7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      stats:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      friendly:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.5 8.5 4 4m11.5 4.5L20 4M7 14l-3 3m13-3 3 3M12 3v4m0 10v4M7.8 12h8.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="2"/></svg>'
    };
    return icons[name] || '';
  };

  function detectView() {
    const active = document.querySelector('.tab-btn.active');
    const text = (active?.textContent || '').trim();
    let view = 'members';
    if (text.includes('البطولة')) view = 'tournament';
    else if (text.includes('التصنيفات')) view = 'stats';
    else if (text.includes('ودية')) view = 'friendly';
    else if (document.querySelector('.card .add-member-label') && !active) view = 'profile';
    document.body.dataset.ezbaView = view;
  }

  function enhanceTabs() {
    // Icons are now rendered purely with CSS masks so every render is stable.
    // Keeping this no-op avoids a second DOM mutation/layout pass.
  }

  const cleanedLogoCache = new Map();

  function cleanClubLogo(img) {
    if (!img || img.dataset.cleanedLogo === '1') return;
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('data:image/')) {
      img.dataset.cleanedLogo = '1';
      return;
    }
    const apply = () => {
      try {
        if (cleanedLogoCache.has(src)) {
          img.src = cleanedLogoCache.get(src);
          img.dataset.cleanedLogo = '1';
          return;
        }
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const image = ctx.getImageData(0, 0, w, h);
        const d = image.data;
        const seen = new Uint8Array(w * h);
        const stack = [];
        const isBg = (p) => {
          const i = p * 4;
          const a = d[i + 3];
          if (a < 8) return true;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          return r >= 246 && g >= 246 && b >= 246 && Math.max(r,g,b)-Math.min(r,g,b) <= 7;
        };
        const push = (x,y) => {
          if (x < 0 || x >= w || y < 0 || y >= h) return;
          const p = y*w+x;
          if (seen[p] || !isBg(p)) return;
          seen[p] = 1; stack.push(p);
        };
        for (let x=0;x<w;x++){ push(x,0); push(x,h-1); }
        for (let y=0;y<h;y++){ push(0,y); push(w-1,y); }
        while (stack.length) {
          const p = stack.pop(), x=p%w, y=(p/w)|0, i=p*4;
          d[i+3]=0;
          push(x-1,y); push(x+1,y); push(x,y-1); push(x,y+1);
        }
        ctx.putImageData(image,0,0);
        const cleaned = canvas.toDataURL('image/png');
        cleanedLogoCache.set(src,cleaned);
        img.src = cleaned;
        img.dataset.cleanedLogo = '1';
      } catch (e) {
        img.dataset.cleanedLogo = '1';
      }
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once:true });
  }

  function enhanceA11y() {
    document.querySelectorAll('button').forEach(b => {
      if (!b.getAttribute('type')) b.setAttribute('type','button');
    });
    document.querySelectorAll('.club-logo').forEach(img => {
      img.loading = 'lazy';
      img.decoding = 'async';
      cleanClubLogo(img);
    });
  }

  function apply() {
    detectView();
    enhanceTabs();
    enhanceA11y();
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; apply(); });
  };

  const observer = new MutationObserver(schedule);
  const start = () => {
    apply();
    observer.observe(document.getElementById('app') || document.body,{childList:true,subtree:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();