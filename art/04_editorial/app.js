/* ─────────────────────────────────────────────────────────────────────────────
   Die Stimmung der Republik — BTW 2025
   Editorial data-graphic · D3 v7 · exhibition install
   ───────────────────────────────────────────────────────────────────────────── */

// ── German locale (comma decimal, period thousands) ──────────────────────────
const deLocale = d3.formatLocale({
  decimal: ",",
  thousands: ".",
  grouping: [3],
  currency: ["", " €"],
});
const fmt1 = deLocale.format(".1f");
const fmt0 = deLocale.format(".0f");

// ── Color palette (contrast-adjusted for cream #f4f1ea) ──────────────────────
const FARBEN = {
  CDU:        "#1a1a1a",
  AfD:        "#0b7fb0",
  SPD:        "#d8232a",
  GRÜNE:      "#2e9e4f",
  "Die Linke":"#c0246a",
  CSU:        "#2f6fb0",
  BSW:        "#8a3fc0",
  FDP:        "#e0b400",
  Nichtwähler:"#5a5a5a",
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = "#f4f1ea";
const INK     = "#141210";
const RULE    = "#d9d2c4";
const LIGHT   = "#d9d2c4";
const CAPTION = "#5b5448";
const SOURCE  = "#7a7264";

// ── Animation timing ──────────────────────────────────────────────────────────
const T_FADE   = 800;
const T_LINE   = 1800;
const T_BAR    = 1200;
const T_DOT    = 600;
const LOOP_MS  = 25000;

// ── State ─────────────────────────────────────────────────────────────────────
let loopTimer = null;

// ── Entry ─────────────────────────────────────────────────────────────────────
fetch("../data.json")
  .then(r => r.json())
  .then(data => {
    render(data);
    document.getElementById("stage").classList.add("ready");
    scheduleLoop(data);
  })
  .catch(err => console.error("Data load failed:", err));

// ── Loop scheduler ────────────────────────────────────────────────────────────
function scheduleLoop(data) {
  if (loopTimer) clearTimeout(loopTimer);
  loopTimer = setTimeout(() => {
    reAnimate();
    scheduleLoop(data);
  }, LOOP_MS);
}

// ── Re-animation (re-trigger draw-on without re-render) ───────────────────────
function reAnimate() {
  // Re-trigger line animation
  const path = d3.select("#trust-line");
  if (!path.empty()) {
    const totalLen = path.node().getTotalLength();
    path
      .attr("stroke-dasharray", totalLen + " " + totalLen)
      .attr("stroke-dashoffset", totalLen)
      .transition().duration(T_LINE).ease(d3.easeCubicInOut)
      .attr("stroke-dashoffset", 0);
  }

  // Re-trigger dots
  d3.selectAll(".trust-dot")
    .attr("opacity", 0)
    .attr("r", 0)
    .transition().delay((_, i) => 400 + i * 200).duration(T_DOT)
    .attr("opacity", 1)
    .attr("r", 3);

  // Re-trigger bars
  d3.selectAll(".party-bar")
    .each(function() {
      const bar = d3.select(this);
      const targetW = +bar.attr("data-w");
      bar.attr("width", 0)
        .transition()
        .delay(+bar.attr("data-delay"))
        .duration(T_BAR)
        .ease(d3.easeCubicOut)
        .attr("width", targetW);
    });

  // Re-trigger bar labels
  d3.selectAll(".bar-label-val")
    .attr("opacity", 0)
    .transition().delay((_, i) => 300 + i * 80).duration(400)
    .attr("opacity", 1);

  // Re-trigger länder dots
  d3.selectAll(".land-dot")
    .attr("opacity", 0)
    .transition().delay((_, i) => 200 + i * 50).duration(T_DOT)
    .attr("opacity", 1);
}

// ── Main render ───────────────────────────────────────────────────────────────
function render(data) {
  const W = window.innerWidth;
  const H = window.innerHeight;

  const svg = d3.select("#stage")
    .attr("width", W)
    .attr("height", H)
    .attr("viewBox", `0 0 ${W} ${H}`);

  svg.selectAll("*").remove();

  // Background
  svg.append("rect").attr("width", W).attr("height", H).attr("fill", BG);

  // ── Layout grid ────────────────────────────────────────────────────────────
  const ml = W * 0.055;   // margin left
  const mr = W * 0.055;   // margin right
  const mt = H * 0.055;   // margin top
  const mb = H * 0.06;    // margin bottom
  const cw = W - ml - mr; // content width
  const ch = H - mt - mb; // content height

  // Column split: left 42% for bar chart, right 58% for trust + länder
  const colGap   = W * 0.04;
  const leftW    = cw * 0.42;
  const rightW   = cw - leftW - colGap;
  const leftX    = ml;
  const rightX   = ml + leftW + colGap;

  // Row heights (right column)
  const headerH  = ch * 0.20;   // headline block
  const trustH   = ch * 0.36;   // trust chart
  const laenderH = ch * 0.30;   // länder strip
  const sourceH  = ch * 0.06;   // source line

  // Top hairline rule
  svg.append("line")
    .attr("x1", ml).attr("y1", mt)
    .attr("x2", W - mr).attr("y2", mt)
    .attr("stroke", INK).attr("stroke-width", 1.5);

  // ── SECTION 1: Header (right column, top) ──────────────────────────────────
  drawHeader(svg, rightX, mt, rightW, headerH);

  // ── SECTION 2: Trust line chart (right column, below header) ───────────────
  const trustY = mt + headerH;
  drawTrustChart(svg, data.vertrauen, rightX, trustY, rightW, trustH);

  // ── SECTION 3: Party bars (left column, full height minus source) ──────────
  const barsH = ch - sourceH;
  drawPartyBars(svg, data.bund, leftX, mt, leftW, barsH);

  // ── SECTION 4: Länder small multiples (right column, below trust) ──────────
  const laenderY = trustY + trustH;
  drawLaender(svg, data.laender, rightX, laenderY, rightW, laenderH);

  // ── Source line ────────────────────────────────────────────────────────────
  svg.append("text")
    .attr("x", ml).attr("y", H - mb * 0.3)
    .attr("font-size", clamp(8, W * 0.007, 11))
    .attr("fill", SOURCE)
    .attr("font-family", "Georgia, serif")
    .text("Quelle: Eurostat ilc_pw03 · Bundeswahlleiterin BTW 2025");

  // Bottom hairline rule
  svg.append("line")
    .attr("x1", ml).attr("y1", H - mb * 0.55)
    .attr("x2", W - mr).attr("y2", H - mb * 0.55)
    .attr("stroke", RULE).attr("stroke-width", 0.5);

  // Edition mark right
  svg.append("text")
    .attr("x", W - mr).attr("y", H - mb * 0.3)
    .attr("text-anchor", "end")
    .attr("font-size", clamp(8, W * 0.007, 11))
    .attr("fill", SOURCE)
    .text("Bundestagswahl 2025");
}

// ── HEADER ────────────────────────────────────────────────────────────────────
function drawHeader(svg, x, y, w, h) {
  const g = svg.append("g").attr("class", "header");

  // Kicker
  g.append("text")
    .attr("x", x).attr("y", y + h * 0.22)
    .attr("font-size", clamp(9, w * 0.028, 13))
    .attr("fill", CAPTION)
    .attr("letter-spacing", "0.12em")
    .text("POLITIKVERDROSSENHEIT · VERTRAUEN · WAHLEN");

  // Headline
  g.append("text")
    .attr("x", x).attr("y", y + h * 0.55)
    .attr("font-size", clamp(20, w * 0.072, 46))
    .attr("font-weight", "700")
    .attr("fill", INK)
    .attr("opacity", 1)
    .attr("letter-spacing", "-0.01em")
    .text("Die Stimmung der Republik");

  // Sub-rule
  g.append("line")
    .attr("x1", x).attr("y1", y + h * 0.64)
    .attr("x2", x + w * 0.6).attr("y2", y + h * 0.64)
    .attr("stroke", INK).attr("stroke-width", 0.5);

  // Standfirst / dek
  const dekSize = clamp(9.5, w * 0.028, 14);
  g.append("text")
    .attr("x", x).attr("y", y + h * 0.82)
    .attr("font-size", dekSize)
    .attr("fill", CAPTION)
    .attr("font-style", "italic")
    .text("Wie viel Vertrauen hat die Gesellschaft in ihre Institutionen — und wer hat bei der Bundestagswahl 2025 gewählt?");
}

// ── TRUST LINE CHART ──────────────────────────────────────────────────────────
function drawTrustChart(svg, vertrauen, x, y, w, h) {
  const padTop = h * 0.18;
  const padBot = h * 0.22;
  const padL   = w * 0.06;
  const padR   = w * 0.05;

  const gW = w - padL - padR;
  const gH = h - padTop - padBot;
  const gx = x + padL;
  const gy = y + padTop;

  const g = svg.append("g").attr("class", "trust-chart");

  // Section label
  g.append("text")
    .attr("x", x).attr("y", y + h * 0.10)
    .attr("font-size", clamp(8, w * 0.022, 11))
    .attr("fill", CAPTION)
    .attr("letter-spacing", "0.10em")
    .text("INSTITUTIONENVERTRAUEN · SKALA 0–10");

  // Scales
  const xScale = d3.scalePoint()
    .domain(vertrauen.map(d => d.jahr))
    .range([0, gW]);

  const yScale = d3.scaleLinear()
    .domain([4.5, 7])
    .range([gH, 0]);

  // Horizontal hairline gridlines (very faint)
  [5, 5.5, 6, 6.5, 7].forEach(v => {
    g.append("line")
      .attr("x1", gx).attr("y1", gy + yScale(v))
      .attr("x2", gx + gW).attr("y2", gy + yScale(v))
      .attr("stroke", LIGHT).attr("stroke-width", 0.5);

    g.append("text")
      .attr("x", gx - 6).attr("y", gy + yScale(v) + 3.5)
      .attr("text-anchor", "end")
      .attr("font-size", clamp(7.5, w * 0.018, 9.5))
      .attr("fill", CAPTION)
      .attr("class", "tabular")
      .text(fmt1(v).replace(".", ","));
  });

  // Baseline
  g.append("line")
    .attr("x1", gx).attr("y1", gy + gH)
    .attr("x2", gx + gW).attr("y2", gy + gH)
    .attr("stroke", RULE).attr("stroke-width", 0.5);

  // X axis labels
  vertrauen.forEach(d => {
    g.append("text")
      .attr("x", gx + xScale(d.jahr))
      .attr("y", gy + gH + 16)
      .attr("text-anchor", "middle")
      .attr("font-size", clamp(7.5, w * 0.018, 9.5))
      .attr("fill", CAPTION)
      .attr("class", "tabular")
      .text(d.jahr);
  });

  // Line generator
  const lineGen = d3.line()
    .x(d => gx + xScale(d.jahr))
    .y(d => gy + yScale(d.wert))
    .curve(d3.curveMonotoneX);

  // Area fill (very subtle)
  const areaGen = d3.area()
    .x(d => gx + xScale(d.jahr))
    .y0(gy + gH)
    .y1(d => gy + yScale(d.wert))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(vertrauen)
    .attr("d", areaGen)
    .attr("fill", INK)
    .attr("opacity", 0.04);

  // The line — stroke-dashoffset animation
  const linePath = g.append("path")
    .datum(vertrauen)
    .attr("id", "trust-line")
    .attr("d", lineGen)
    .attr("fill", "none")
    .attr("stroke", INK)
    .attr("stroke-width", 1.6);

  const totalLen = linePath.node().getTotalLength();
  linePath
    .attr("stroke-dasharray", totalLen + " " + totalLen)
    .attr("stroke-dashoffset", totalLen)
    .transition().duration(T_LINE).ease(d3.easeCubicInOut)
    .attr("stroke-dashoffset", 0);

  // Dots + value labels
  vertrauen.forEach((d, i) => {
    const cx = gx + xScale(d.jahr);
    const cy = gy + yScale(d.wert);

    g.append("circle")
      .attr("class", "trust-dot")
      .attr("cx", cx).attr("cy", cy)
      .attr("r", 0)
      .attr("fill", INK)
      .attr("stroke", INK)
      .attr("stroke-width", 1.2)
      .attr("opacity", 0)
      .transition().delay(400 + i * 200).duration(T_DOT)
      .attr("r", 3)
      .attr("opacity", 1);

    g.append("text")
      .attr("class", "trust-dot tabular")
      .attr("x", cx)
      .attr("y", cy - 9)
      .attr("text-anchor", "middle")
      .attr("font-size", clamp(7.5, w * 0.018, 9.5))
      .attr("fill", INK)
      .attr("opacity", 0)
      .text(fmt1(d.wert).replace(".", ","))
      .transition().delay(600 + i * 200).duration(T_DOT)
      .attr("opacity", 1);
  });

  // Y-axis label
  const yLabelSize = clamp(7.5, w * 0.018, 9.5);
  g.append("text")
    .attr("transform", `translate(${gx - padL * 0.7}, ${gy + gH / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .attr("font-size", yLabelSize)
    .attr("fill", CAPTION)
    .text("Vertrauen (0–10)");

  // Annotation — small note at the end
  const lastD = vertrauen[vertrauen.length - 1];
  const noteX = gx + xScale(lastD.jahr) + 10;
  const noteY = gy + yScale(lastD.wert);
  if (noteX + 80 < x + w) {
    g.append("text")
      .attr("x", noteX).attr("y", noteY + 3)
      .attr("font-size", clamp(7.5, w * 0.018, 9))
      .attr("fill", CAPTION)
      .attr("font-style", "italic")
      .text("2025: " + fmt1(lastD.wert).replace(".", ","));
  }
}

// ── PARTY BARS ────────────────────────────────────────────────────────────────
function drawPartyBars(svg, bund, x, y, w, h) {
  const padTop = h * 0.10;
  const padBot = h * 0.06;
  const padL   = w * 0.0;
  const padR   = w * 0.18;  // room for value labels

  const gH = h - padTop - padBot;
  const gW = w - padL - padR;

  const g = svg.append("g").attr("class", "party-bars");

  // Section label
  g.append("text")
    .attr("x", x + padL).attr("y", y + h * 0.055)
    .attr("font-size", clamp(8, w * 0.035, 11))
    .attr("fill", CAPTION)
    .attr("letter-spacing", "0.10em")
    .text("ZWEITSTIMMEN BUNDESWEIT · BTW 2025");

  // Sort parties by share desc
  const parties = Object.entries(bund.shares)
    .sort((a, b) => b[1] - a[1]);

  const n = parties.length;
  const barAreaH = gH * 0.88;
  const barSlot  = barAreaH / n;
  const barH     = Math.min(barSlot * 0.52, clamp(12, w * 0.05, 26));
  const barPad   = barSlot * 0.48;

  const maxShare = d3.max(parties, d => d[1]);
  const xScale = d3.scaleLinear().domain([0, maxShare]).range([0, gW]);

  const startY = y + padTop + barPad * 0.5;

  parties.forEach(([party, share], i) => {
    const by = startY + i * barSlot;
    const bw = xScale(share);
    const col = FARBEN[party] || INK;
    const labelSize = clamp(8.5, w * 0.038, 13);

    // Party name label (left)
    g.append("text")
      .attr("x", x + padL)
      .attr("y", by + barH * 0.5 + labelSize * 0.35)
      .attr("font-size", labelSize)
      .attr("fill", INK)
      .text(party);

    // Bar track (hairline background)
    g.append("rect")
      .attr("x", x + padL)
      .attr("y", by + barH * 0.85)
      .attr("width", gW)
      .attr("height", 0.4)
      .attr("fill", LIGHT);

    // Bar itself — grows in
    const barEl = g.append("rect")
      .attr("class", "party-bar")
      .attr("data-w", bw)
      .attr("data-delay", 200 + i * 80)
      .attr("x", x + padL)
      .attr("y", by + barH * 1.0)
      .attr("width", 0)
      .attr("height", barH * 0.55)
      .attr("fill", col)
      .attr("opacity", 1);

    barEl.transition()
      .delay(200 + i * 80)
      .duration(T_BAR)
      .ease(d3.easeCubicOut)
      .attr("width", bw);

    // Value label
    g.append("text")
      .attr("class", "bar-label-val tabular")
      .attr("x", x + padL + gW + 8)
      .attr("y", by + barH * 1.4)
      .attr("font-size", labelSize)
      .attr("fill", INK)
      .attr("opacity", 0)
      .text(fmt1(share).replace(".", ",") + " %")
      .transition().delay(300 + i * 80).duration(400)
      .attr("opacity", 1);
  });

  // Turnout note below bars
  const noteY = startY + n * barSlot + barH * 0.5;
  g.append("line")
    .attr("x1", x + padL).attr("y1", noteY + 2)
    .attr("x2", x + padL + w * 0.7).attr("y2", noteY + 2)
    .attr("stroke", RULE).attr("stroke-width", 0.5);

  g.append("text")
    .attr("x", x + padL).attr("y", noteY + 16)
    .attr("font-size", clamp(8, w * 0.032, 11))
    .attr("fill", CAPTION)
    .text("Wahlbeteiligung: " + fmt1(bund.beteiligung).replace(".", ",") + " %");
}

// ── LÄNDER SMALL MULTIPLES ────────────────────────────────────────────────────
function drawLaender(svg, laender, x, y, w, h) {
  const sorted = [...laender].sort((a, b) => a.beteiligung - b.beteiligung);
  const n = sorted.length;

  const padTop = h * 0.22;
  const padBot = h * 0.10;
  const trackY = y + h * 0.58;
  const trackH = h * 0.08;

  const g = svg.append("g").attr("class", "laender");

  // Section label
  g.append("text")
    .attr("x", x).attr("y", y + h * 0.13)
    .attr("font-size", clamp(8, w * 0.022, 11))
    .attr("fill", CAPTION)
    .attr("letter-spacing", "0.10em")
    .text("WAHLBETEILIGUNG NACH BUNDESLAND");

  // Hairline separator
  g.append("line")
    .attr("x1", x).attr("y1", y + h * 0.17)
    .attr("x2", x + w).attr("y2", y + h * 0.17)
    .attr("stroke", LIGHT).attr("stroke-width", 0.5);

  // Track bar background
  const trackPadL = w * 0.02;
  const trackW    = w - trackPadL;
  const minB = d3.min(sorted, d => d.beteiligung);
  const maxB = d3.max(sorted, d => d.beteiligung);

  const xScale = d3.scaleLinear()
    .domain([minB - 1.5, maxB + 1.5])
    .range([0, trackW]);

  // Range bar
  g.append("rect")
    .attr("x", x + trackPadL + xScale(minB))
    .attr("y", trackY + trackH * 0.4)
    .attr("width", xScale(maxB) - xScale(minB))
    .attr("height", 0.8)
    .attr("fill", RULE);

  // Min/max tick marks
  [[minB, "left"], [maxB, "right"]].forEach(([val, anchor]) => {
    const tx = x + trackPadL + xScale(val);
    g.append("line")
      .attr("x1", tx).attr("y1", trackY + trackH * 0.2)
      .attr("x2", tx).attr("y2", trackY + trackH * 0.7)
      .attr("stroke", INK).attr("stroke-width", 0.7);

    const landName = sorted.find(d => d.beteiligung === val)?.name || "";
    g.append("text")
      .attr("x", tx + (anchor === "left" ? -4 : 4))
      .attr("y", trackY - 4)
      .attr("text-anchor", anchor === "left" ? "end" : "start")
      .attr("font-size", clamp(7, w * 0.018, 9))
      .attr("fill", CAPTION)
      .attr("font-style", "italic")
      .text(landName);

    g.append("text")
      .attr("x", tx + (anchor === "left" ? -4 : 4))
      .attr("y", trackY + trackH + 10)
      .attr("text-anchor", anchor === "left" ? "end" : "start")
      .attr("font-size", clamp(7.5, w * 0.019, 9.5))
      .attr("fill", INK)
      .attr("class", "tabular")
      .text(fmt1(val).replace(".", ",") + " %");
  });

  // Dots for each Bundesland
  const dotR = clamp(2.5, w * 0.006, 4.5);
  sorted.forEach((land, i) => {
    const cx = x + trackPadL + xScale(land.beteiligung);
    const cy = trackY + trackH * 0.44;

    g.append("circle")
      .attr("class", "land-dot")
      .attr("cx", cx).attr("cy", cy)
      .attr("r", dotR)
      .attr("fill", "#c8c0b4")
      .attr("stroke", INK)
      .attr("stroke-width", 1.2)
      .attr("opacity", 0)
      .transition().delay(200 + i * 50).duration(T_DOT)
      .attr("opacity", 1);

    // Label every Bundesland above the track (alternating up/down for overlap)
    const nameShort = abbreviate(land.name);
    const labelY = (i % 2 === 0) ? trackY - 18 : trackY + trackH + 22;
    const lblSize = clamp(6.5, w * 0.015, 8.5);

    g.append("text")
      .attr("class", "land-dot")
      .attr("x", cx)
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("font-size", lblSize)
      .attr("fill", CAPTION)
      .attr("opacity", 0)
      .text(nameShort)
      .transition().delay(200 + i * 50).duration(T_DOT)
      .attr("opacity", 1);

    // Tick line from label to dot (only if not overlapping)
    const tickEndY = (i % 2 === 0) ? trackY - 6 : trackY + trackH + 8;
    g.append("line")
      .attr("class", "land-dot")
      .attr("x1", cx).attr("y1", labelY + (i % 2 === 0 ? 2 : -13))
      .attr("x2", cx).attr("y2", tickEndY)
      .attr("stroke", LIGHT)
      .attr("stroke-width", 0.5)
      .attr("opacity", 0)
      .transition().delay(200 + i * 50).duration(T_DOT)
      .attr("opacity", 1);
  });

  // Axis label
  g.append("text")
    .attr("x", x + trackPadL + trackW / 2)
    .attr("y", trackY + trackH * 0.44 + dotR + 14)
    .attr("text-anchor", "middle")
    .attr("font-size", clamp(7.5, w * 0.017, 9))
    .attr("fill", CAPTION)
    .text("← weniger Beteiligung           mehr Beteiligung →");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(lo, val, hi) {
  return Math.max(lo, Math.min(val, hi));
}

function abbreviate(name) {
  const map = {
    "Baden-Württemberg": "BW",
    "Bayern": "BY",
    "Berlin": "BE",
    "Brandenburg": "BB",
    "Bremen": "HB",
    "Hamburg": "HH",
    "Hessen": "HE",
    "Mecklenburg-Vorpommern": "MV",
    "Niedersachsen": "NI",
    "Nordrhein-Westfalen": "NW",
    "Rheinland-Pfalz": "RP",
    "Saarland": "SL",
    "Sachsen": "SN",
    "Sachsen-Anhalt": "ST",
    "Schleswig-Holstein": "SH",
    "Thüringen": "TH",
  };
  return map[name] || name.slice(0, 4);
}

// ── Resize handler (debounced) ────────────────────────────────────────────────
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    fetch("../data.json").then(r => r.json()).then(data => {
      render(data);
      scheduleLoop(data);
    });
  }, 200);
});
