/* Separate qualification draw for exact group-stage ties. */
(() => {
  function completedHeadToHead(matches, idA, idB) {
    const m = (matches || []).find(x =>
      x.scoreA != null && x.scoreB != null &&
      ((x.a?.id === idA && x.b?.id === idB) || (x.a?.id === idB && x.b?.id === idA))
    );
    if (!m) return { result: 'draw', match: null };
    if (m.scoreA === m.scoreB) return { result: 'draw', match: m };
    const winnerId = m.scoreA > m.scoreB ? m.a.id : m.b.id;
    return { result: winnerId === idA ? 'a' : 'b', match: m };
  }

  function enrichTable(players, matches) {
    const byId = new Map((players || []).map(p => [p.id, p]));
    const table = standingsFor(players || [], matches || [], null).map(row => ({
      ...row,
      club: byId.get(row.id)?.club || '',
    }));

    table.sort((a, b) =>
      (b.pts - a.pts) ||
      (b.gd - a.gd) ||
      (b.gf - a.gf) ||
      (a.ga - b.ga)
    );

    // If two adjacent players are otherwise identical, use their direct meeting.
    // If that meeting was also a draw, their order remains neutral and the
    // qualification-boundary draw below decides the promoted side explicitly.
    for (let i = 0; i < table.length - 1; i++) {
      const a = table[i], b = table[i + 1];
      if (!sameEverything(a, b)) continue;
      const h2h = completedHeadToHead(matches, a.id, b.id);
      if (h2h.result === 'b') {
        table[i] = b;
        table[i + 1] = a;
      }
    }
    return table;
  }

  function sameEverything(a, b) {
    return !!a && !!b &&
      a.pts === b.pts &&
      a.gf === b.gf &&
      a.ga === b.ga &&
      a.gd === b.gd;
  }

  function qualificationBoundaryTie(groupKey, players, matches) {
    const table = enrichTable(players, matches);
    if (table.length < 3) return { table, tie: null };
    const second = table[1];
    const third = table[2];
    if (!sameEverything(second, third)) return { table, tie: null };

    const h2h = completedHeadToHead(matches, second.id, third.id);
    if (h2h.result === 'a') return { table, tie: null };
    if (h2h.result === 'b') {
      table[1] = third;
      table[2] = second;
      return { table, tie: null };
    }

    return {
      table,
      tie: {
        id: uid(),
        group: groupKey,
        label: groupKey === 'A' ? 'المجموعة الأولى' : 'المجموعة الثانية',
        playerA: second,
        playerB: third,
        winnerId: null,
        createdAt: Date.now(),
      },
    };
  }

  function finalizeKnockoutFromGroups(cur, tableA, tableB, drawWinners) {
    function applyDraw(table, groupKey) {
      const winnerId = drawWinners?.[groupKey];
      if (!winnerId || table.length < 3) return table;
      const copy = table.slice();
      const i = copy.findIndex(x => x.id === winnerId);
      if (i > 1) {
        const winner = copy[i];
        copy.splice(i, 1);
        copy.splice(1, 0, winner);
      }
      return copy;
    }

    const finalTableA = applyDraw(tableA, 'A');
    const finalTableB = applyDraw(tableB, 'B');
    const a1 = finalTableA[0], a2 = finalTableA[1];
    const b1 = finalTableB[0], b2 = finalTableB[1];
    const promotedNames = [a1?.name, a2?.name, b1?.name, b2?.name].filter(Boolean);

    updateCurrent({
      stage: 'knockout',
      groupTiebreaks: null,
      groupTiebreakTables: null,
      semis: {
        m1: { id:uid(), label:'نصف النهائي 1', a:a1, b:b2, scoreA:null, scoreB:null, penA:null, penB:null },
        m2: { id:uid(), label:'نصف النهائي 2', a:b1, b:a2, scoreA:null, scoreB:null, penA:null, penB:null },
      },
      tiebreakLog: [
        ...(cur.tiebreakLog || []),
        ...Object.entries(drawWinners || {}).map(([group, winnerId]) => ({
          id: uid(), type: 'qualification-draw', group, winnerId,
          winner: [...finalTableA, ...finalTableB].find(x => x.id === winnerId)?.name || '',
        })),
      ],
      fullStandings: [...finalTableA, ...finalTableB],
      promotedNames,
      promotedGroupA: [a1?.name, a2?.name].filter(Boolean),
      promotedGroupB: [b1?.name, b2?.name].filter(Boolean),
    });

    sendPushNotification(`🥊 بدأت الأدوار الإقصائية!${cur.isOfficial ? '' : ' (ودية)'}`, `📺 MAX 1: ${a1?.name} ضد ${b2?.name}\n📺 MAX 2: ${b1?.name} ضد ${a2?.name}`);
    notifyIfBrothersClash(a1?.name, b2?.name, 'نصف النهائي');
    notifyIfBrothersClash(b1?.name, a2?.name, 'نصف النهائي');
    notifyIfYahyaFahadClash(a1?.name, b2?.name, 'نصف النهائي');
    notifyIfYahyaFahadClash(b1?.name, a2?.name, 'نصف النهائي');
    notifyGeneralMatchupJoke(a1?.name, b2?.name, 'نصف النهائي');
    notifyGeneralMatchupJoke(b1?.name, a2?.name, 'نصف النهائي');
  }

  function beginQualificationCheck() {
    const cur = appState.current;
    if (!cur || cur.stage !== 'groups') return;

    const a = qualificationBoundaryTie('A', cur.groupA, cur.matchesA);
    const b = qualificationBoundaryTie('B', cur.groupB, cur.matchesB);
    const pending = [a.tie, b.tie].filter(Boolean);

    if (!pending.length) {
      finalizeKnockoutFromGroups(cur, a.table, b.table, {});
      return;
    }

    updateCurrent({
      stage: 'groupTiebreak',
      groupTiebreaks: pending,
      groupTiebreakTables: { A: a.table, B: b.table },
    });
  }

  window.goToKnockout = function() {
    requirePermission('admin', beginQualificationCheck);
  };

  window.runQualificationDraw = function(tieId) {
    requirePermission('admin', () => {
      const cur = appState.current;
      if (!cur || cur.stage !== 'groupTiebreak') return;
      const ties = (cur.groupTiebreaks || []).map(t => ({ ...t }));
      const tie = ties.find(t => t.id === tieId);
      if (!tie || tie.winnerId) return;

      const candidates = [tie.playerA, tie.playerB];
      const winner = candidates[Math.floor(Math.random() * candidates.length)];
      tie.winnerId = winner.id;
      tie.winnerName = winner.name;
      tie.resolvedAt = Date.now();
      updateCurrent({ groupTiebreaks: ties });
      try { playLandThud(); } catch (_) {}
      sendPushNotification('🎲 قرعة تحديد المتأهل', `${tie.label}: القرعة منحت بطاقة التأهل لـ ${winner.name}`);
    });
  };

  window.completeQualificationDraws = function() {
    requirePermission('admin', () => {
      const cur = appState.current;
      if (!cur || cur.stage !== 'groupTiebreak') return;
      const ties = cur.groupTiebreaks || [];
      if (!ties.length || ties.some(t => !t.winnerId)) return;
      const winners = {};
      ties.forEach(t => { winners[t.group] = t.winnerId; });
      const tables = cur.groupTiebreakTables || {};
      finalizeKnockoutFromGroups(cur, tables.A || [], tables.B || [], winners);
    });
  };

  function playerCard(player, isWinner) {
    const logo = player?.club ? clubLogoHtml(player.club, 'club-logo-lg') : '';
    return `<div class="qt-player ${isWinner ? 'qt-winner' : ''}">
      <div class="qt-club">${logo}</div>
      <strong>${player ? coloredNameHtml(player.name, '', true) : '—'}</strong>
      <small>${escapeHtml(player?.club || '')}</small>
      ${isWinner ? '<span class="qt-qualified">المتأهل</span>' : ''}
    </div>`;
  }

  function groupTiebreakStageHtml() {
    const cur = appState.current;
    const ties = cur?.groupTiebreaks || [];
    const allDone = ties.length > 0 && ties.every(t => t.winnerId);
    const cards = ties.map(t => {
      const winnerA = t.winnerId === t.playerA.id;
      const winnerB = t.winnerId === t.playerB.id;
      return `<div class="qt-card ${t.winnerId ? 'resolved' : ''}">
        <div class="qt-card-head">
          <div><span class="group-letter">${t.group}</span><strong>${escapeHtml(t.label)}</strong></div>
          <span class="qt-status">${t.winnerId ? 'حُسمت بالقرعة' : 'تعادل كامل'}</span>
        </div>
        <p>تساوى اللاعبان في النقاط، الأهداف له وعليه، وفارق الأهداف، وانتهت مواجهتهما المباشرة بالتعادل. يتم تحديد بطاقة الصعود بقرعة مستقلة.</p>
        <div class="qt-versus">
          ${playerCard(t.playerA, winnerA)}
          <div class="qt-vs">VS</div>
          ${playerCard(t.playerB, winnerB)}
        </div>
        ${t.winnerId
          ? `<div class="qt-result">🎟️ بطاقة التأهل: <strong>${coloredNameHtml(t.winnerName || (winnerA ? t.playerA.name : t.playerB.name))}</strong></div>`
          : `<button class="cta-btn qt-draw-btn" onclick="runQualificationDraw('${t.id}')"><span class="qt-dice">◆</span> إجراء قرعة تحديد المتأهل</button>`}
      </div>`;
    }).join('');

    return `<div class="card theme-knockout qt-page">
      <div class="qt-hero">
        <div>
          <div class="tournament-badge"><span class="badge-trophy-3d" aria-hidden="true"></span>${escapeHtml(cur.name)}</div>
          <div class="section-icon-title"><span class="icon ui-icon ui-wheel" aria-hidden="true"></span>قرعة فاصلة للتأهل</div>
          <p class="hint">تظهر هذه القرعة فقط عندما يكون التعادل كاملاً بين لاعبين يتنافسان على بطاقة الصعود.</p>
        </div>
        <div class="qt-orb"><strong>${ties.length}</strong><span>قرعة</span></div>
      </div>
      <div class="qt-list">${cards}</div>
      ${allDone ? `<div class="qt-continue-panel"><div><strong>اكتملت القرعة الفاصلة</strong><span>تم تحديد المتأهلين ويمكن الآن الانتقال لنصف النهائي.</span></div><button class="cta-btn" onclick="completeQualificationDraws()">اعتماد المتأهلين والانتقال ←</button></div>` : ''}
    </div>`;
  }

  const originalTournamentFlowHtml = window.tournamentFlowHtml;
  if (typeof originalTournamentFlowHtml === 'function') {
    window.tournamentFlowHtml = function patchedTournamentFlowHtml() {
      if (appState.current?.stage === 'groupTiebreak') {
        return groupTiebreakStageHtml();
      }
      return originalTournamentFlowHtml();
    };
  }

  const style = document.createElement('style');
  style.id = 'ezbaQualificationTiebreakV19';
  style.textContent = `
    .qt-page{overflow:hidden!important}.qt-hero{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px;margin:-3px -2px 15px;border-radius:20px;background:radial-gradient(circle at 88% 10%,rgba(255,204,72,.15),transparent 32%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.014));border:1px solid rgba(255,210,83,.15)}
    .qt-orb{width:70px;height:70px;border-radius:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 70px;background:linear-gradient(145deg,#3a2f18,#17150f);border:1px solid rgba(255,212,92,.18);box-shadow:0 12px 25px rgba(0,0,0,.22)}.qt-orb strong{font-size:22px;color:#f8d878}.qt-orb span{font-size:8px;color:#927f52;margin-top:3px}
    .qt-list{display:flex;flex-direction:column;gap:12px}.qt-card{padding:14px;border-radius:17px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.014));border:1px solid rgba(255,255,255,.065)}.qt-card.resolved{border-color:rgba(50,213,131,.16);background:radial-gradient(circle at 100% 0,rgba(50,213,131,.08),transparent 35%),linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.014))}
    .qt-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.qt-card-head>div{display:flex;align-items:center;gap:7px}.qt-card-head strong{font-size:11px}.qt-status{font-size:7px;padding:4px 7px;border-radius:999px;background:rgba(255,205,70,.08);color:#d8b65d;border:1px solid rgba(255,205,70,.12)}.qt-card p{font-size:8.5px;line-height:1.65;color:#8193a8;margin-bottom:11px}
    .qt-versus{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}.qt-player{position:relative;min-height:112px;padding:10px 6px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.055)}.qt-player.qt-winner{border-color:rgba(50,213,131,.22);background:linear-gradient(145deg,rgba(50,213,131,.10),rgba(255,255,255,.015));box-shadow:0 0 22px rgba(50,213,131,.07)}.qt-club{height:48px;display:grid;place-items:center;margin-bottom:5px}.qt-club .club-logo{width:46px!important;height:46px!important}.qt-player strong{font-size:11px}.qt-player small{font-size:7px;color:#77899f;margin-top:3px}.qt-vs{width:31px;height:24px;border-radius:999px;display:grid;place-items:center;background:#172a42;color:#8da1b8;font-size:7px;font-weight:900}.qt-qualified{position:absolute;top:6px;left:6px;font-size:6.5px;padding:3px 5px;border-radius:999px;color:#74e5ac;background:rgba(50,213,131,.08);border:1px solid rgba(50,213,131,.14)}
    .qt-draw-btn{min-height:45px!important;margin-top:11px!important;border-radius:13px!important}.qt-dice{width:17px;height:17px;display:grid;place-items:center;transform:rotate(45deg);font-size:9px}.qt-result{margin-top:10px;padding:9px;border-radius:11px;text-align:center;background:rgba(50,213,131,.055);border:1px solid rgba(50,213,131,.10);color:#72dca7;font-size:9px}.qt-continue-panel{margin-top:14px;padding:13px;border-radius:16px;background:linear-gradient(145deg,rgba(50,213,131,.06),rgba(255,255,255,.012));border:1px solid rgba(50,213,131,.11)}.qt-continue-panel>div{display:flex;flex-direction:column;gap:3px;margin-bottom:9px}.qt-continue-panel strong{font-size:11px}.qt-continue-panel span{font-size:8px;color:#7e9d8d}
    @media(max-width:600px){.qt-hero{padding:14px}.qt-orb{width:60px;height:60px;flex-basis:60px}.qt-player{min-height:100px}.qt-club .club-logo{width:40px!important;height:40px!important}}
  `;
  document.head.appendChild(style);
})();
