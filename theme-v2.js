/* Ezba UI v2 enhancer — visuals + reliability guards for the live shared app. */
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
    let detected = 'members';
    if (text.includes('البطولة')) detected = 'tournament';
    else if (text.includes('التصنيفات')) detected = 'stats';
    else if (text.includes('ودية')) detected = 'friendly';
    else if (document.querySelector('.profile-page-card') && !active) detected = 'profile';
    document.body.dataset.ezbaView = detected;
  }

  function enhanceTabs() {
    // Icons are rendered with CSS masks; keep this DOM pass mutation-free.
  }

  const cleanedLogoCache = new Map();

  function cleanClubLogo(img) {
    if (!img || img.dataset.cleanedLogo === '1') return;

    const clubName = (img.dataset.club || '').trim();
    if (clubName === 'السد' || clubName === 'العين') {
      img.dataset.cleanedLogo = '1';
      return;
    }

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

  // -----------------------------------------------------------------------
  // Live-sync reliability layer
  // -----------------------------------------------------------------------

  // Ignore out-of-order state responses. On slow mobile networks two polling
  // requests can overlap; without this guard an older response can arrive
  // after a newer one and visually roll the page backwards for one frame.
  if (typeof window.fetchState === 'function') {
    let newestStateStamp = 0;
    let newestStateData = null;
    window.fetchState = async function stableFetchState() {
      const res = await fetch(REST_URL + '?id=eq.' + STATE_ROW_ID + '&select=data,updated_at', {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      const rows = await res.json();
      if (!rows.length) return null;
      const row = rows[0];
      const stamp = Date.parse(row.updated_at || '') || 0;
      if (stamp && stamp < newestStateStamp && newestStateData) return newestStateData;
      if (stamp >= newestStateStamp) {
        newestStateStamp = stamp;
        newestStateData = row.data;
      }
      return row.data;
    };
  }

  // Skip truly identical re-renders and preserve page position across real
  // live updates. This removes the occasional iPhone/PWA flash caused by a
  // full DOM rebuild while the user is looking at the fixtures.
  if (typeof window.render === 'function') {
    const originalRender = window.render;
    let lastSignature = '';
    window.render = function stableRender() {
      let signature = '';
      try {
        signature = JSON.stringify({
          loaded,
          view,
          state: appState,
          members,
          wheel: wheelUi,
          loginModal,
          profileModal,
          messageModal,
          celebration,
          backupsListState,
          mode: window.__selectedGroupMode || null,
          seeding: window.__useSeeding,
        });
      } catch (_) {}
      if (signature && signature === lastSignature) return;
      lastSignature = signature;

      const bodyScroll = document.body.scrollTop || document.documentElement.scrollTop || 0;
      originalRender();
      if (bodyScroll > 0) {
        requestAnimationFrame(() => {
          document.body.scrollTop = bodyScroll;
          document.documentElement.scrollTop = bodyScroll;
        });
      }
    };
  }

  // Score changes are written through a PostgreSQL RPC that locks the one
  // shared league-state row and patches only the requested score field.
  // This prevents two admins/phones saving different matches at nearly the
  // same time from overwriting each other's results.
  let scoreWriteChain = Promise.resolve();

  function parseScore(value) {
    return value === '' ? null : Math.max(0, parseInt(value, 10) || 0);
  }

  function enqueueScoreWrite(task) {
    scoreWriteChain = scoreWriteChain.then(task, task);
    return scoreWriteChain;
  }

  async function atomicScoreWrite(scope, matchId, field, value) {
    const tournamentId = appState.current && appState.current.id;
    if (!tournamentId) return null;
    pendingWrites++;
    syncBadge.textContent = 'جارِ حفظ النتيجة...';
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/ezba_patch_current_score', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_tournament_id: tournamentId,
          p_scope: scope,
          p_match_id: matchId || '',
          p_field: field,
          p_value: parseScore(value),
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error('atomic score save failed: ' + res.status + ' ' + detail);
      }
      const nextState = await res.json();
      if (nextState && typeof nextState === 'object') appState = nextState;
      render();
      syncBadge.textContent = 'متصل ✓ تم حفظ النتيجة للجميع';
      return nextState;
    } catch (e) {
      console.error(e);
      syncBadge.textContent = 'تعذر حفظ النتيجة، حاول مرة ثانية';
      // Pull the server truth back immediately so this device never remains
      // on a result that failed to persist.
      try {
        const latest = await fetchState();
        if (latest) appState = latest;
        render();
      } catch (_) {}
      return null;
    } finally {
      pendingWrites--;
    }
  }

  window.updateMatchField = function(which, matchId, field, value) {
    requirePermission('admin', () => enqueueScoreWrite(() => atomicScoreWrite(which, matchId, field, value)));
  };

  window.updateSemiField = function(key, field, value) {
    requirePermission('admin', () => {
      const matchId = appState.current?.semis?.[key]?.id || '';
      enqueueScoreWrite(() => atomicScoreWrite('SEMI:' + key, matchId, field, value));
    });
  };

  window.updateFinalField = function(field, value) {
    requirePermission('admin', () => enqueueScoreWrite(() => atomicScoreWrite('FINAL', '', field, value)));
  };

  window.updateCupField = function(matchId, field, value) {
    requirePermission('admin', () => enqueueScoreWrite(() => atomicScoreWrite('CUP', matchId, field, value)));
  };

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