/* 다인에듀 B2B 견적 — 화면·계산 로직 */
(function () {
  "use strict";
  const P = window.PRICING, PROGS = window.PROGRAMS, PKGS = window.PACKAGES;
  const LANGS = window.LANGS, FIELDS = window.FIELDS;
  const byId = Object.fromEntries(PROGS.map(p => [p.id, p]));
  const pkgById = Object.fromEntries(PKGS.map(p => [p.id, p]));
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const won = n => Math.round(n).toLocaleString("ko-KR") + "원";
  const pct = d => Math.round(d * 100) + "%";
  const siteUrl = repo => "https://yalli2.github.io/" + repo + "/";
  const tierOf = (tiers, n) => tiers.reduce((a, t) => (n >= t.min ? t : a), tiers[0]);
  const termOf = id => P.terms.find(t => t.id === id) || P.terms[0];
  const modeOf = id => P.modes.find(m => m.id === id) || P.modes[0];
  const priceOf = p => p.price || P.fieldPrice[p.field];
  const ICON_TXT = { es: "ES", en: "EN", zh: "中", ja: "日", fr: "FR", ru: "RU", it: "IT", ar: "ع", pt: "PT", ca: "CA", la: "LA" };
  const FIELD_ICON = { hr: "HR", prod: "GO", mind: "♡", fin: "₩", ai: "AI", insight: "IN", youth: "Y", lang: "Aa", exam: "EX", job: "현장" };
  const icon = p => `<span class="ico" style="background:${FIELDS[p.field].color}">${esc(p.lang !== "ko" ? ICON_TXT[p.lang] : FIELD_ICON[p.field])}</span>`;

  /* ---------------- state ---------------- */
  const blank = () => ({
    seats: 20, term: "m12", mode: "self", lines: [],
    info: { company: "", contact: "", phone: "", email: "", memo: "" }
  });
  let S = blank();
  const ui = { pkgGroup: "lang", progGroup: "lang", lang: "all", field: "all", q: "" };

  function save() {
    try {
      const raw = JSON.stringify({ s: S.seats, t: S.term, m: S.mode, l: S.lines.map(l => [l.t, l.id, l.seats || 0]), i: S.info });
      const enc = btoa(unescape(encodeURIComponent(raw)));
      history.replaceState(null, "", "#q=" + enc);
      try { localStorage.setItem("dainedu_rfq", enc); } catch (e) { /* storage unavailable */ }
    } catch (e) { /* ignore */ }
  }
  function load() {
    let enc = null;
    const m = location.hash.match(/#q=([^&]+)/);
    if (m) enc = m[1];
    else { try { enc = localStorage.getItem("dainedu_rfq"); } catch (e) { enc = null; } }
    if (!enc) return;
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(enc))));
      S.seats = Math.max(1, +o.s || 20);
      S.term = termOf(o.t).id;
      S.mode = modeOf(o.m).id;
      S.lines = (o.l || []).filter(x => (x[0] === "pkg" ? pkgById[x[1]] : byId[x[1]]))
        .map(x => ({ t: x[0], id: x[1], seats: x[2] || null }));
      S.info = Object.assign(blank().info, o.i || {});
    } catch (e) { /* bad hash */ }
  }

  /* ---------------- pricing engine ---------------- */
  function calc(st, termId) {
    const term = termOf(termId || st.term), mode = modeOf(st.mode);
    const pkgLines = st.lines.filter(l => l.t === "pkg");
    const inPkg = new Set();
    pkgLines.forEach(l => pkgById[l.id].programs.forEach(id => inPkg.add(id)));
    const indiv = st.lines.filter(l => l.t === "prog" && !inPkg.has(l.id));
    const countTier = indiv.length ? tierOf(P.countTiers, indiv.length) : P.countTiers[0];
    const covered = new Set();
    const rows = [];

    st.lines.forEach(l => {
      const seats = l.seats || st.seats;
      let name, kind, progIds, unit, bundle, bundleLabel, note = "";
      if (l.t === "pkg") {
        const pk = pkgById[l.id];
        progIds = pk.programs.filter(id => !covered.has(id));
        const dup = pk.programs.length - progIds.length;
        progIds.forEach(id => covered.add(id));
        name = pk.name; kind = "패키지";
        unit = progIds.reduce((s, id) => s + priceOf(byId[id]), 0);
        bundle = pk.disc; bundleLabel = "패키지 " + pct(pk.disc);
        if (dup) note = `다른 패키지와 겹치는 ${dup}개 제외`;
      } else {
        const p = byId[l.id];
        name = p.name; kind = "프로그램";
        if (inPkg.has(l.id)) {
          rows.push({ key: l.t + l.id, line: l, kind, name, progIds: [l.id], seats, included: true, listM: 0, netM: 0, volAmt: 0, bundleAmt: 0, termAmt: 0, capAmt: 0, opList: 0, opNet: 0, classes: 0, unit: priceOf(p) });
          return;
        }
        progIds = [l.id];
        unit = priceOf(p);
        bundle = countTier.disc; bundleLabel = countTier.disc ? `다과목 ${indiv.length}개 ${pct(countTier.disc)}` : "";
      }
      const vol = tierOf(P.seatTiers, seats).disc;
      const listM = unit * seats;
      const volAmt = Math.round(listM * vol);
      const bundleAmt = Math.round((listM - volAmt) * bundle);
      const licTermAmt = Math.round((listM - volAmt - bundleAmt) * term.disc);
      let licNet = listM - volAmt - bundleAmt - licTermAmt;
      const floor = Math.round(listM * (1 - P.maxDiscount));
      const capAmt = licNet < floor ? floor - licNet : 0;
      licNet += capAmt;
      const classes = mode.fee && progIds.length ? Math.ceil(seats / P.classSize) : 0;
      const opList = mode.fee * classes;
      const opTermAmt = Math.round(opList * term.disc);
      const opNet = opList - opTermAmt;
      rows.push({
        key: l.t + l.id, line: l, kind, name, progIds, seats, unit, note,
        vol, volAmt, bundle, bundleLabel, bundleAmt, termAmt: licTermAmt + opTermAmt, capAmt,
        listM, licNet, classes, opList, opNet, netM: licNet + opNet
      });
    });

    const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const listM = sum("listM"), opList = sum("opList");
    const netM = sum("netM");
    const contract = netM * term.months;
    const vat = Math.round(contract * P.vatRate);
    const listContract = (listM + opList) * term.months;
    return {
      term, mode, rows, countTier, indivCount: indiv.length,
      listM, opList, volAmt: sum("volAmt"), bundleAmt: sum("bundleAmt"), termAmt: sum("termAmt"), capAmt: sum("capAmt"),
      netM, contract, vat, grand: contract + vat, listContract,
      saveRate: listContract ? 1 - contract / listContract : 0,
      allGlobal: rows.every(r => !r.line.seats)
    };
  }

  /* ---------------- hero ---------------- */
  function renderHero() {
    const repos = new Set(); PROGS.forEach(p => p.repos.forEach(r => repos.add(r)));
    $("#heroSites").textContent = repos.size;
    $("#heroProgs").textContent = PROGS.length;
    const sample = ["es", "ai", "zh", "hr", "en", "fin", "ja", "mind", "fr", "prod", "ru", "youth", "it", "insight", "ar", "job", "pt", "exam", "la", "ca"];
    const cells = [];
    for (let i = 0; i < 24; i++) {
      if ([0, 5, 18, 23].includes(i)) { cells.push('<div class="t blank"></div>'); continue; }
      const k = sample[(i - [0, 5, 18].filter(x => x < i).length) % sample.length];
      const isLang = !!ICON_TXT[k];
      const p = isLang ? PROGS.find(x => x.lang === k) : PROGS.find(x => x.field === k);
      const color = FIELDS[p.field].color;
      cells.push(`<div class="t" style="background:${color}">${esc(isLang ? ICON_TXT[k] : FIELD_ICON[k])}</div>`);
    }
    $("#tileCloud").innerHTML = cells.join("");
  }

  /* ---------------- plan cards ---------------- */
  function renderTermPill() {
    $("#termPill").innerHTML = P.terms.map(t =>
      `<button data-t="${t.id}" class="${t.id === S.term ? "on" : ""}">${t.label}${t.disc ? `<span class="off">-${pct(t.disc)}</span>` : ""}</button>`).join("");
  }
  function renderPlans() {
    const term = termOf(S.term);
    const list = PKGS.filter(p => p.group === ui.pkgGroup);
    $("#planNote").textContent = `${term.label} 계약(${term.sub}) 기준 가격${term.disc ? ` · 계약 기간 할인 ${pct(term.disc)} 반영` : ""}`;
    $("#planGrid").innerHTML = list.map(pk => {
      const progs = pk.programs.map(id => byId[id]);
      const listUnit = progs.reduce((s, p) => s + priceOf(p), 0);
      const net = Math.round(listUnit * (1 - pk.disc) * (1 - term.disc) / 10) * 10;
      const save = 1 - net / listUnit;
      const added = S.lines.some(l => l.t === "pkg" && l.id === pk.id);
      const langs = [...new Set(progs.map(p => p.lang).filter(l => l !== "ko"))].map(l => LANGS[l].label);
      const fields = [...new Set(progs.map(p => FIELDS[p.field].label))];
      const months = Math.max(...progs.map(p => p.months));
      const rec = !!pk.tag;
      return `<article class="plan ${rec ? "rec" : ""} ${added ? "added" : ""}">
        <div class="ribbon">${rec ? (pk.tag === "인기" ? "가장 인기 있음" : "권장 사항") : "&nbsp;"}</div>
        <div class="plan-body">
          <h3>${esc(pk.name)}</h3>
          <p class="target">${esc(pk.target)}</p>
          <div class="price"><strong>${won(net)}</strong><s>${won(listUnit)}</s></div>
          <div class="per">사용자/월, ${term.label} 계약</div>
          <div class="vat">(부가세 별도 · 인원 할인 별도)</div>
          <span class="save">정가 대비 ${pct(save)} 절약</span>
          <div class="cta">
            <button class="btn ${added ? "added" : "primary"}" data-pkg="${pk.id}">${added ? "✓ 견적에 담김" : "견적에 담기"}</button>
          </div>
          <hr>
          <h5>패키지 핵심 사항</h5>
          <ul class="key">
            <li>프로그램 ${progs.length}개 · 패키지 할인 ${pct(pk.disc)}</li>
            <li>${langs.length ? esc(langs.join(" · ")) : "한국어 진행"} · ${esc(fields.join(" · "))}</li>
            <li>권장 학습 기간 최대 ${months}개월 · 인터랙티브 사이트 ${progs.reduce((s, p) => s + p.repos.length, 0)}개 제공</li>
          </ul>
          <h5>포함된 프로그램</h5>
          <ul class="apps">${progs.map(p => `<li>${icon(p)}<div><b><a href="${siteUrl(p.repos[0])}" target="_blank" rel="noopener">${esc(p.name)}</a></b><span>${esc(p.level)} · ${esc(p.units)}</span></div></li>`).join("")}</ul>
          <a class="more" href="#calc" data-go-calc>견적 계산기에서 자세히 보기 ›</a>
        </div>
      </article>`;
    }).join("");
  }

  /* ---------------- compare table ---------------- */
  const FEATURES = [
    { g: "학습 콘텐츠" },
    { n: "인터랙티브 학습 사이트 (프로그램별)", v: ["y", "y", "y", "y"] },
    { n: "원어민 음성 · 모바일 학습", v: ["y", "y", "y", "y"] },
    { n: "온라인 레벨테스트", v: ["y", "y", "y", "y"] },
    { g: "관리" },
    { n: "수강생별 사이트 접속 계정 발급·관리", v: ["y", "y", "y", "y"] },
    { n: "반 편성 (최대 " + P.classSize + "명)", v: ["", "y", "y", "y"] },
    { g: "강사 운영" },
    { n: "실시간 화상 특강", v: ["", "월 2회 · 60분", "", ""] },
    { n: "정규 실시간 화상 수업", v: ["", "", "주 1회 · 90분", ""] },
    { n: "기업 방문 수업 (출강)", v: ["", "", "", "주 1회 · 90분"] },
    { n: "질의응답 · 과제 피드백", v: ["", "특강 시간", "y", "y"] }
  ];
  function renderCompare() {
    const head = `<thead><tr><th></th>${P.modes.map(m => `<th class="${m.id === S.mode ? "sel" : ""}">
      <h4>${esc(m.label)}</h4>
      <div class="p">${m.fee ? won(m.fee) : "추가 비용 없음"}</div>
      <div class="pu">${m.fee ? "반/월 · 견적 줄별" : "프로그램 이용료만"}</div>
      <button class="btn ${m.id === S.mode ? "added" : "dark"}" data-mode="${m.id}">${m.id === S.mode ? "✓ 선택됨" : "선택"}</button>
    </th>`).join("")}</tr></thead>`;
    const body = FEATURES.map(f => f.g
      ? `<tr class="grp"><td colspan="${P.modes.length + 1}">${esc(f.g)}</td></tr>`
      : `<tr><td>${esc(f.n)}</td>${f.v.map((v, i) => `<td class="${P.modes[i] && P.modes[i].id === S.mode ? "sel" : ""}">${v === "y" ? '<span class="chk" aria-label="포함"></span>' : v ? `<span class="txt">${esc(v)}</span>` : ""}</td>`).join("")}</tr>`).join("");
    $("#cmpTable").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  /* ---------------- calculator inputs ---------------- */
  function renderConditions() {
    $("#seatInput").value = S.seats;
    $("#seatRange").value = Math.min(300, Math.max(5, S.seats));
    const cur = tierOf(P.seatTiers, S.seats);
    $("#seatTiers").innerHTML = P.seatTiers.map(t => `<div class="${t === cur ? "on" : ""}"><b>${t.disc ? "-" + pct(t.disc) : "기본"}</b>${t.label}</div>`).join("");
    $("#termCards").innerHTML = P.terms.map(t => `<button data-t="${t.id}" class="${t.id === S.term ? "on" : ""}">${t.label}<small>${t.sub}</small><span class="d">${t.disc ? "-" + pct(t.disc) : "기본가"}</span></button>`).join("");
    $("#modeSelect").innerHTML = P.modes.map(m => `<option value="${m.id}" ${m.id === S.mode ? "selected" : ""}>${esc(m.label)}${m.fee ? " (+" + won(m.fee) + " /반·월)" : ""}</option>`).join("");
    $("#modeDesc").textContent = modeOf(S.mode).desc;
  }
  function renderChips() {
    const langs = ["all", ...Object.keys(LANGS).filter(k => PROGS.some(p => p.lang === k))];
    const fields = ["all", ...Object.keys(FIELDS)];
    $("#langChips").innerHTML = langs.map(k => `<button data-lang="${k}" class="${ui.lang === k ? "on" : ""}">${k === "all" ? "전체 언어" : LANGS[k].flag + " " + LANGS[k].label}</button>`).join("");
    $("#fieldChips").innerHTML = fields.map(k => `<button data-field="${k}" class="${ui.field === k ? "on" : ""}">${k === "all" ? "전체 분야" : FIELDS[k].label}</button>`).join("");
  }
  function renderProgList() {
    const inPkg = new Set();
    S.lines.filter(l => l.t === "pkg").forEach(l => pkgById[l.id].programs.forEach(id => inPkg.add(id)));
    const q = ui.q.trim().toLowerCase();
    const list = PROGS.filter(p =>
      (ui.lang === "all" || p.lang === ui.lang) &&
      (ui.field === "all" || p.field === ui.field) &&
      (!q || (p.name + p.desc + p.units + p.repos.join(" ") + FIELDS[p.field].label + LANGS[p.lang].label).toLowerCase().includes(q)));
    if (!list.length) { $("#progList").innerHTML = '<div class="empty">조건에 맞는 프로그램이 없습니다.</div>'; return; }
    const keyOf = p => ui.progGroup === "lang" ? p.lang : p.field;
    const order = ui.progGroup === "lang" ? Object.keys(LANGS) : Object.keys(FIELDS);
    const labelOf = k => ui.progGroup === "lang" ? LANGS[k].flag + " " + LANGS[k].label : FIELDS[k].label;
    $("#progList").innerHTML = order.filter(k => list.some(p => keyOf(p) === k)).map(k => {
      const items = list.filter(p => keyOf(p) === k);
      return `<div class="prog-group"><h4>${esc(labelOf(k))}<small>${items.length}개</small></h4>${items.map(p => {
        const on = S.lines.some(l => l.t === "prog" && l.id === p.id);
        const pk = inPkg.has(p.id);
        return `<div class="prog">${icon(p)}
          <div class="meta"><b>${esc(p.name)}</b><span>${esc(FIELDS[p.field].label)} · ${esc(p.level)} · ${esc(p.units)} · 권장 ${p.months}개월</span><br>
            <span>${esc(p.desc)}</span> <a class="repo" href="${siteUrl(p.repos[0])}" target="_blank" rel="noopener">사이트 보기 ›</a></div>
          <div class="pp">${won(priceOf(p))}<small>1명/월</small></div>
          ${pk && !on ? '<button class="add inpkg" disabled>패키지 포함</button>' : `<button class="add ${on ? "on" : ""}" data-prog="${p.id}">${on ? "✓ 담김" : "담기"}</button>`}
        </div>`;
      }).join("")}</div>`;
    }).join("");
  }

  /* ---------------- summary ---------------- */
  function renderSummary() {
    const Q = calc(S);
    $("#navCount").textContent = S.lines.length;
    if (!Q.rows.length) {
      $("#sumLines").innerHTML = '<div class="empty-sum">아직 담은 항목이 없습니다.<br>패키지나 프로그램을 담아 보세요.</div>';
    } else {
      $("#sumLines").innerHTML = Q.rows.map(r => {
        const tags = [];
        if (r.included) tags.push('<span class="warn">담은 패키지에 이미 포함 — 0원</span>');
        else {
          if (r.vol) tags.push(`<span>인원 -${pct(r.vol)}</span>`);
          if (r.bundleLabel) tags.push(`<span>${esc(r.bundleLabel)}</span>`);
          if (Q.term.disc) tags.push(`<span>${Q.term.label} -${pct(Q.term.disc)}</span>`);
          if (r.capAmt) tags.push('<span class="warn">할인 한도 적용</span>');
          if (r.classes) tags.push(`<span class="op">강사 ${r.classes}반</span>`);
          if (r.note) tags.push(`<span class="warn">${esc(r.note)}</span>`);
        }
        return `<div class="line">
          <div class="line-top"><div><span class="kind">${r.kind}${r.kind === "패키지" ? " · " + r.progIds.length + "개 프로그램" : ""}</span><b>${esc(r.name)}</b></div>
            <span class="amt">${won(r.netM)}<small style="display:block;font-weight:400;color:#616161;font-size:11px;text-align:right">/월</small></span></div>
          <div class="tags">${tags.join("")}</div>
          <div class="line-sub"><label>인원 <input type="number" min="1" data-seats="${esc(r.key)}" value="${r.seats}"> 명${r.line.seats ? "" : " (기본)"}</label>
            <button class="x" data-remove="${esc(r.key)}">삭제</button></div>
        </div>`;
      }).join("");
    }
    const rr = (a, b, cls) => `<div class="r ${cls || ""}"><span>${a}</span><span>${b}</span></div>`;
    let t = '<div class="totals">';
    t += rr("프로그램 정가 (월)", won(Q.listM));
    if (Q.volAmt) t += rr("인원 할인", "−" + won(Q.volAmt), "disc");
    if (Q.bundleAmt) t += rr("패키지·다과목 할인", "−" + won(Q.bundleAmt), "disc");
    if (Q.opList) t += rr(`강사 운영비 (${esc(Q.mode.label)})`, "+" + won(Q.opList));
    if (Q.termAmt) t += rr(`${Q.term.label} 계약 할인 ${pct(Q.term.disc)}`, "−" + won(Q.termAmt), "disc");
    if (Q.capAmt) t += rr(`할인 한도(${pct(P.maxDiscount)}) 조정`, "+" + won(Q.capAmt));
    t += rr("월 환산 금액", won(Q.netM), "big");
    t += `<div class="grand">${rr(`계약 총액 (${Q.term.months}개월, 공급가)`, won(Q.contract))}${rr("부가세 10%", won(Q.vat))}${rr("합계", won(Q.grand), "g")}</div>`;
    if (Q.rows.length && Q.allGlobal) t += `<div class="pp">1명당 월 ${won(Q.netM / S.seats)} · 정가 대비 ${pct(Q.saveRate)} 절약</div>`;
    else if (Q.rows.length) t += `<div class="pp">정가 대비 ${pct(Q.saveRate)} 절약</div>`;
    t += "</div>";
    $("#sumTotals").innerHTML = t;

    /* term compare */
    const base = calc(S, P.terms[0].id);
    $("#termCompare").innerHTML = `<table class="tc"><thead><tr><th>기간</th><th>월 환산</th><th>계약 총액</th><th>절감액</th></tr></thead><tbody>${
      P.terms.map(tm => {
        const q = calc(S, tm.id);
        const saving = base.netM * tm.months - q.contract;
        return `<tr data-t="${tm.id}" class="${tm.id === S.term ? "on" : ""}"><td>${tm.label}${tm.disc ? ` <span class="sv">-${pct(tm.disc)}</span>` : ""}</td><td>${won(q.netM)}</td><td>${won(q.contract)}</td><td class="sv">${saving > 0 ? won(saving) : "—"}</td></tr>`;
      }).join("")}</tbody></table><p class="tc-note">행을 누르면 해당 기간으로 바뀝니다. 절감액은 월간 계약을 같은 기간 이어 갈 때와 비교한 금액입니다.</p>`;

    $("#benefits").innerHTML = P.loyalty.map(b => `<li class="${Q.term.months >= b.minMonths ? "" : "lock"}">${esc(b.text)} <small>(${b.minMonths}개월 이상)</small></li>`).join("");
    $("#freeList").innerHTML = window.FREE_SERVICES.map(f => `<li>${f.repo ? `<a href="${siteUrl(f.repo)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)}</li>`).join("");

    $("#mbLabel").textContent = `월 환산 · ${Q.term.label} 계약`;
    $("#mbTotal").textContent = won(Q.netM);
  }

  /* ---------------- policy ---------------- */
  function renderPolicy() {
    $("#capPct").textContent = pct(P.maxDiscount);
    document.querySelectorAll(".cls").forEach(e => e.textContent = P.classSize);
    $("#validDays").textContent = P.quoteValidDays;
    $("#supplierLine").textContent = `${P.supplier.name} · 대표 ${P.supplier.ceo} · ${P.supplier.web} · ${P.supplier.note}`;
    const tbl = rows => `<table class="pt">${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</table>`;
    $("#tblField").innerHTML = tbl(Object.keys(FIELDS).map(k => [`<span class="dot" style="background:${FIELDS[k].color}"></span>${esc(FIELDS[k].label)}`, won(P.fieldPrice[k])])
      .concat([["제2외국어 (러·이·아·포·카·라)", won(55000)]]));
    $("#tblSeat").innerHTML = tbl(P.seatTiers.map(t => [t.label, t.disc ? "-" + pct(t.disc) : "기본가"]));
    $("#tblCount").innerHTML = tbl(P.countTiers.map(t => [t.label, t.disc ? "-" + pct(t.disc) : "—"]).concat([["패키지", "-15~25%"]]));
    $("#tblTerm").innerHTML = tbl(P.terms.map(t => [`${t.label} (${t.sub})`, t.disc ? "-" + pct(t.disc) : "기본가"]));
    const A = window.ANALYSIS;
    const byField = Object.keys(FIELDS).map(k => ({ k, n: PROGS.filter(p => p.field === k).length }));
    const langCount = Object.keys(LANGS).filter(k => k !== "ko" && PROGS.some(p => p.lang === k)).length;
    $("#analysis").innerHTML = `<p class="an-lead">GitHub 저장소 ${A.scanned}개를 분석해 프로그램 ${PROGS.length}개(외국어 ${langCount}개 언어 + 비어학 분야), 패키지 ${PKGS.length}개로 정리했습니다. ${esc(A.excluded)}했습니다.</p>
      <div class="an-grid">${byField.map(f => `<div><b><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${FIELDS[f.k].color}"></span>${esc(FIELDS[f.k].label)} · ${f.n}개</b><span>${esc(PROGS.filter(p => p.field === f.k).map(p => p.name).slice(0, 4).join(", "))}${f.n > 4 ? " 외" : ""}</span></div>`).join("")}</div>`;
  }

  /* ---------------- quote document ---------------- */
  function quoteNo() {
    const d = new Date();
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    let h = 0; const s = JSON.stringify(S.lines) + S.seats + S.term + S.mode;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `DE-${ymd}-${String(h % 10000).padStart(4, "0")}`;
  }
  const fmtDate = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  function renderDoc() {
    const Q = calc(S), I = S.info, now = new Date();
    const until = new Date(now.getTime() + P.quoteValidDays * 86400000);
    const rows = Q.rows.map((r, i) => {
      const progs = r.progIds.map(id => byId[id].name).join(", ");
      const disc = r.included ? "패키지 포함" : [r.vol ? `인원 ${pct(r.vol)}` : "", r.bundleLabel, Q.term.disc ? `${Q.term.label} ${pct(Q.term.disc)}` : ""].filter(Boolean).join(" · ") || "—";
      return `<tr><td>${i + 1}</td><td>${r.kind}</td><td><b>${esc(r.name)}</b>${r.kind === "패키지" ? `<small>${esc(progs)}</small>` : ""}${r.classes ? `<small>강사 운영 ${r.classes}반 × ${won(Q.mode.fee)}</small>` : ""}${r.note ? `<small>${esc(r.note)}</small>` : ""}</td>
        <td class="n">${r.seats}명</td><td class="n">${won(r.listM + r.opList)}</td><td>${esc(disc)}</td><td class="n"><b>${won(r.netM)}</b></td></tr>`;
    }).join("") || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">선택한 항목이 없습니다</td></tr>';
    const c = (a, b, cls) => `<tr class="${cls || ""}"><td>${a}</td><td>${b}</td></tr>`;
    const cmp = P.terms.map(tm => { const q = calc(S, tm.id); return `<tr class="${tm.id === S.term ? "on" : ""}"><td>${tm.label} (${tm.sub})</td><td>${tm.disc ? pct(tm.disc) : "—"}</td><td>${won(q.netM)}</td><td>${won(q.contract)}</td><td>${won(q.grand)}</td></tr>`; }).join("");
    $("#quoteDoc").innerHTML = `
      <div class="doc-head"><h1>견 적 서</h1><div class="meta">견적번호 ${quoteNo()}<br>발행일 ${fmtDate(now)}<br>유효기간 ${fmtDate(until)}까지</div></div>
      <div class="parties">
        <div class="party"><h4>수신</h4><table>
          <tr><td>회사·기관</td><td>${esc(I.company) || "&nbsp;"}</td></tr>
          <tr><td>담당자</td><td>${esc(I.contact) || "&nbsp;"}</td></tr>
          <tr><td>연락처</td><td>${esc(I.phone) || "&nbsp;"}</td></tr>
          <tr><td>이메일</td><td>${esc(I.email) || "&nbsp;"}</td></tr></table></div>
        <div class="party"><h4>공급자</h4><table>
          <tr><td>상호</td><td>${esc(P.supplier.name)}</td></tr>
          <tr><td>대표</td><td>${esc(P.supplier.ceo)}</td></tr>
          <tr><td>홈페이지</td><td>${esc(P.supplier.web)}</td></tr>
          <tr><td>비고</td><td>${esc(P.supplier.note)}</td></tr></table></div>
      </div>
      <div class="headline"><span>합계금액 (부가세 포함, ${Q.term.months}개월)</span><strong>${won(Q.grand)}</strong></div>
      <div class="cond"><span>기본 인원 <b>${S.seats}명</b></span><span>계약 기간 <b>${Q.term.label} (${Q.term.sub})</b></span><span>운영 방식 <b>${esc(Q.mode.label)}</b></span></div>
      <table class="items"><thead><tr><th>No</th><th>구분</th><th>내용</th><th>인원</th><th>월 정가</th><th>적용 할인</th><th>월 금액</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="calc-tbl">
        ${c("프로그램 정가 (월)", won(Q.listM))}
        ${Q.volAmt ? c("인원 할인", "−" + won(Q.volAmt)) : ""}
        ${Q.bundleAmt ? c("패키지·다과목 할인", "−" + won(Q.bundleAmt)) : ""}
        ${Q.opList ? c("강사 운영비", "+" + won(Q.opList)) : ""}
        ${Q.termAmt ? c(`${Q.term.label} 계약 할인 (${pct(Q.term.disc)})`, "−" + won(Q.termAmt)) : ""}
        ${Q.capAmt ? c("할인 한도 조정", "+" + won(Q.capAmt)) : ""}
        ${c("월 환산 금액", won(Q.netM), "b")}
        ${c(`공급가액 (× ${Q.term.months}개월)`, won(Q.contract))}
        ${c("부가세 (10%)", won(Q.vat))}
        ${c("합계금액", won(Q.grand), "g")}
      </table>
      <h5>계약 기간별 비교</h5>
      <table class="cmp-mini"><thead><tr><th>계약 기간</th><th>기간 할인</th><th>월 환산</th><th>공급가액</th><th>합계(VAT 포함)</th></tr></thead><tbody>${cmp}</tbody></table>
      <h5>정기 고객 혜택 (${Q.term.label} 계약)</h5>
      <ul>${P.loyalty.filter(b => Q.term.months >= b.minMonths).map(b => `<li>${esc(b.text)}</li>`).join("") || "<li>분기(3개월) 이상 계약 시 혜택이 제공됩니다.</li>"}</ul>
      <h5>무료 포함 서비스</h5>
      <ul>${window.FREE_SERVICES.map(f => `<li>${esc(f.name)}</li>`).join("")}</ul>
      <h5>참고 사항</h5>
      <ul>
        <li>모든 금액은 원화 기준이며, 프로그램 이용료는 1명·1개월 단가로 산정했습니다.</li>
        <li>강사 운영비는 반(최대 ${P.classSize}명) 단위이며, 수도권 외 출강 교통비는 별도입니다.</li>
        <li>합계 할인율은 정가의 최대 ${pct(P.maxDiscount)}까지 적용됩니다.</li>
        <li>본 견적은 발행일로부터 ${P.quoteValidDays}일간 유효하며, 최종 조건은 계약서로 확정합니다.</li>
        ${I.memo ? `<li>요청 사항: ${esc(I.memo)}</li>` : ""}
      </ul>
      <div class="sign">${esc(P.supplier.name)} &nbsp; 대표 ${esc(P.supplier.ceo)} (인)</div>`;
  }
  function docText() {
    const Q = calc(S), I = S.info;
    const L = [];
    L.push(`[다인에듀 B2B 견적] ${quoteNo()}`);
    if (I.company) L.push(`수신: ${I.company}${I.contact ? " / " + I.contact : ""}`);
    L.push(`조건: ${S.seats}명 · ${Q.term.label}(${Q.term.sub}) · ${Q.mode.label}`);
    L.push("");
    Q.rows.forEach((r, i) => L.push(`${i + 1}. [${r.kind}] ${r.name} — ${r.seats}명 · 월 ${won(r.netM)}${r.included ? " (패키지 포함)" : ""}`));
    L.push("");
    L.push(`월 환산: ${won(Q.netM)}`);
    L.push(`공급가액(${Q.term.months}개월): ${won(Q.contract)}`);
    L.push(`부가세: ${won(Q.vat)}`);
    L.push(`합계: ${won(Q.grand)}`);
    L.push("");
    L.push("견적 링크: " + location.href);
    return L.join("\n");
  }

  /* ---------------- actions ---------------- */
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 1800);
  }
  function copy(text, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("복사하지 못했습니다"); }
      ta.remove();
    }
  }
  function toggleLine(t, id) {
    const i = S.lines.findIndex(l => l.t === t && l.id === id);
    if (i >= 0) { S.lines.splice(i, 1); toast("견적에서 뺐습니다"); }
    else { S.lines.push({ t, id, seats: null }); toast((t === "pkg" ? pkgById[id].name : byId[id].name) + " — 견적에 담았습니다"); }
    refresh();
  }
  function setSeats(n) {
    n = Math.max(1, Math.min(3000, Math.round(+n || 1)));
    S.seats = n; refresh();
    if (n < P.minSeats) toast(`B2B 견적은 ${P.minSeats}명 이상부터 권장합니다`);
  }
  function openQuote() {
    renderDoc();
    $("#quoteModal").classList.add("open");
    $("#quoteModal").setAttribute("aria-hidden", "false");
  }
  function closeQuote() {
    $("#quoteModal").classList.remove("open");
    $("#quoteModal").setAttribute("aria-hidden", "true");
  }

  function refresh() {
    renderTermPill(); renderPlans(); renderCompare(); renderConditions(); renderChips(); renderProgList(); renderSummary(); save();
  }

  function bind() {
    document.addEventListener("click", e => {
      const b = e.target.closest("button, [data-go-calc], tr[data-t]");
      if (!b) return;
      if (b.dataset.pkg) return toggleLine("pkg", b.dataset.pkg);
      if (b.dataset.prog) return toggleLine("prog", b.dataset.prog);
      if (b.dataset.mode) { S.mode = b.dataset.mode; refresh(); return toast(modeOf(S.mode).label + " 선택"); }
      if (b.dataset.t) { S.term = b.dataset.t; return refresh(); }
      if (b.dataset.seat) return setSeats(S.seats + +b.dataset.seat);
      if (b.dataset.lang) { ui.lang = b.dataset.lang; renderChips(); return renderProgList(); }
      if (b.dataset.field) { ui.field = b.dataset.field; renderChips(); return renderProgList(); }
      if (b.dataset.remove) {
        const k = b.dataset.remove; S.lines = S.lines.filter(l => l.t + l.id !== k); return refresh();
      }
      if (b.hasAttribute("data-close")) return closeQuote();
    });
    $("#pkgPill").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      ui.pkgGroup = b.dataset.g;
      [...$("#pkgPill").children].forEach(x => x.classList.toggle("on", x === b));
      renderPlans();
    });
    $("#groupPill").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      ui.progGroup = b.dataset.g;
      [...$("#groupPill").children].forEach(x => x.classList.toggle("on", x === b));
      renderProgList();
    });
    $("#seatInput").addEventListener("change", e => setSeats(e.target.value));
    $("#seatRange").addEventListener("input", e => { S.seats = +e.target.value; $("#seatInput").value = S.seats; renderConditions(); renderPlans(); renderCompare(); renderSummary(); save(); });
    $("#modeSelect").addEventListener("change", e => { S.mode = e.target.value; refresh(); });
    $("#progSearch").addEventListener("input", e => { ui.q = e.target.value; renderProgList(); });
    $("#sumLines").addEventListener("change", e => {
      const k = e.target.dataset.seats; if (!k) return;
      const line = S.lines.find(l => l.t + l.id === k); if (!line) return;
      const v = Math.max(1, Math.round(+e.target.value || 1));
      line.seats = v === S.seats ? null : v; refresh();
    });
    const infoMap = { fCompany: "company", fContact: "contact", fPhone: "phone", fEmail: "email", fMemo: "memo" };
    Object.keys(infoMap).forEach(id => {
      const el = document.getElementById(id);
      el.value = S.info[infoMap[id]] || "";
      el.addEventListener("input", () => { S.info[infoMap[id]] = el.value; save(); });
    });
    $("#resetBtn").addEventListener("click", () => { if (S.lines.length && !confirmReset()) return; S = blank(); Object.keys(infoMap).forEach(id => document.getElementById(id).value = ""); refresh(); toast("초기화했습니다"); });
    ["#openQuote", "#mbOpen", "#navQuote", "#contactQuote"].forEach(s => $(s).addEventListener("click", openQuote));
    $("#printBtn").addEventListener("click", () => window.print());
    $("#copyLink").addEventListener("click", () => { save(); copy(location.href, "견적 링크를 복사했습니다"); });
    $("#copyText").addEventListener("click", () => copy(docText(), "견적 내용을 복사했습니다"));
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeQuote(); });
  }
  function confirmReset() {
    const b = $("#resetBtn");
    if (b.dataset.armed) { delete b.dataset.armed; b.textContent = "모두 지우기"; return true; }
    b.dataset.armed = "1"; b.textContent = "한 번 더 누르면 삭제";
    setTimeout(() => { delete b.dataset.armed; b.textContent = "모두 지우기"; }, 2500);
    return false;
  }

  load();
  renderHero();
  renderPolicy();
  bind();
  refresh();
  window.__calc = calc; // 검증용
})();
