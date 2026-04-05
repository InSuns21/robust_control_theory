#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function num(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureDir(filePrefix) {
  const dir = path.dirname(filePrefix);
  fs.mkdirSync(dir, { recursive: true });
}

function acceleration(state, t, p) {
  const forcing =
    p.mode === "forced" ? p.F0 * Math.sin(p.omega * t + p.phi) : 0;
  return (forcing - p.b * state.v - p.k * state.x) / p.m;
}

function rk4Step(state, t, dt, p) {
  const k1x = state.v;
  const k1v = acceleration(state, t, p);

  const s2 = { x: state.x + 0.5 * dt * k1x, v: state.v + 0.5 * dt * k1v };
  const k2x = s2.v;
  const k2v = acceleration(s2, t + 0.5 * dt, p);

  const s3 = { x: state.x + 0.5 * dt * k2x, v: state.v + 0.5 * dt * k2v };
  const k3x = s3.v;
  const k3v = acceleration(s3, t + 0.5 * dt, p);

  const s4 = { x: state.x + dt * k3x, v: state.v + dt * k3v };
  const k4x = s4.v;
  const k4v = acceleration(s4, t + dt, p);

  return {
    x: state.x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x),
    v: state.v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v),
  };
}

function simulate(p) {
  const rows = [];
  let state = { x: p.x0, v: p.v0 };
  for (let t = 0; t <= p.duration + 1e-12; t += p.dt) {
    const a = acceleration(state, t, p);
    rows.push({ t, x: state.x, v: state.v, a });
    state = rk4Step(state, t, p.dt, p);
  }
  return rows;
}

function toCsv(rows) {
  const lines = ["t,x,v,a"];
  for (const row of rows) {
    lines.push(
      [row.t, row.x, row.v, row.a].map((v) => v.toFixed(6)).join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildSvg(rows, title) {
  const width = 1000;
  const height = 420;
  const left = 80;
  const right = 40;
  const top = 60;
  const bottom = 60;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const tMax = rows[rows.length - 1].t;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const row of rows) {
    yMin = Math.min(yMin, row.x);
    yMax = Math.max(yMax, row.x);
  }
  if (Math.abs(yMax - yMin) < 1e-9) {
    yMax += 1;
    yMin -= 1;
  }
  const pad = 0.1 * (yMax - yMin);
  yMax += pad;
  yMin -= pad;
  const sx = (t) => left + (t / tMax) * plotW;
  const sy = (y) => top + ((yMax - y) / (yMax - yMin)) * plotH;
  const pathData = rows
    .map((row, i) => `${i === 0 ? "M" : "L"} ${sx(row.t).toFixed(2)} ${sy(row.x).toFixed(2)}`)
    .join(" ");
  const zeroY = sy(0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="40" y="36" font-size="24" font-family="Segoe UI, Arial">${title}</text>
  <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#1f2937" stroke-width="3"/>
  <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" stroke="#1f2937" stroke-width="3"/>
  <line x1="${left}" y1="${zeroY.toFixed(2)}" x2="${width - right}" y2="${zeroY.toFixed(2)}" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6 5"/>
  <path d="${pathData}" fill="none" stroke="#2563eb" stroke-width="3"/>
  <text x="${width - right + 8}" y="${height - bottom + 6}" font-size="18" font-family="Segoe UI, Arial">t</text>
  <text x="58" y="${top - 8}" font-size="18" font-family="Times New Roman, Times, serif">x</text>
</svg>
`;
}

function main() {
  const args = parseArgs(process.argv);
  const p = {
    mode: args.mode === "forced" ? "forced" : "free",
    m: num(args.m, 1),
    b: num(args.b, 0.4),
    k: num(args.k, 9),
    F0: num(args.F0, 1),
    omega: num(args.omega, 2.5),
    phi: num(args.phi, 0),
    x0: num(args.x0, 1),
    v0: num(args.v0, 0),
    duration: num(args.duration, 20),
    dt: num(args.dt, 0.01),
    out:
      args.out ||
      path.join("01_classical", "simulations", "out", "spring_mass_damper"),
  };

  if (p.m <= 0 || p.k <= 0 || p.dt <= 0 || p.duration <= 0) {
    throw new Error("m, k, dt, duration は正である必要があります。");
  }

  ensureDir(p.out);
  const rows = simulate(p);
  fs.writeFileSync(`${p.out}.csv`, toCsv(rows), "utf8");
  const title =
    p.mode === "forced"
      ? "ばね‐質量‐ダンパー系: 強制振動の変位"
      : "ばね‐質量‐ダンパー系: 自由減衰振動の変位";
  fs.writeFileSync(`${p.out}.svg`, buildSvg(rows, title), "utf8");

  const gamma = p.b / (2 * p.m);
  const omega0 = Math.sqrt(p.k / p.m);
  let regime = "臨界減衰";
  if (gamma < omega0) regime = "不足減衰";
  if (gamma > omega0) regime = "過減衰";

  process.stdout.write(
    [
      `mode: ${p.mode}`,
      `gamma: ${gamma.toFixed(6)}`,
      `omega0: ${omega0.toFixed(6)}`,
      `regime: ${regime}`,
      `csv: ${p.out}.csv`,
      `svg: ${p.out}.svg`,
    ].join("\n") + "\n"
  );
}

main();
