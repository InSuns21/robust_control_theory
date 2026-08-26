(() => {
  "use strict";

  const g = 9.81;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const deg = (rad) => rad * 180 / Math.PI;
  const rad = (degree) => degree * Math.PI / 180;

  function bindRange(id, labelId, formatter) {
    const el = document.getElementById(id);
    const out = document.getElementById(labelId);
    const update = () => { out.textContent = formatter(Number(el.value)); };
    el.addEventListener("input", update);
    update();
    return el;
  }

  // ---------- LAB 1: inverted pendulum ----------
  const pCanvas = document.getElementById("pendulumCanvas");
  const pCtx = pCanvas.getContext("2d");
  const theta0 = bindRange("theta0", "theta0Label", v => `${v.toFixed(0)}°`);
  const kp = bindRange("kp", "kpLabel", v => v.toFixed(1));
  const kd = bindRange("kd", "kdLabel", v => v.toFixed(1));
  const uMax = bindRange("uMax", "uMaxLabel", v => v.toFixed(1));
  const pControl = document.getElementById("pendulumControl");
  const thetaOut = document.getElementById("thetaOut");
  const thetaDotOut = document.getElementById("thetaDotOut");
  const pStatus = document.getElementById("pendulumStatus");

  let pendulum = { theta: rad(Number(theta0.value)), thetaDot: 0 };

  function resetPendulum() {
    pendulum.theta = rad(Number(theta0.value));
    pendulum.thetaDot = 0;
  }

  document.getElementById("pendulumReset").addEventListener("click", resetPendulum);
  theta0.addEventListener("change", resetPendulum);
  document.getElementById("pendulumPush").addEventListener("click", () => {
    pendulum.thetaDot += 1.25;
  });

  function stepPendulum(dt) {
    const l = 0.85;
    const Kp = Number(kp.value);
    const Kd = Number(kd.value);
    const limit = Number(uMax.value);
    let u = 0;
    if (pControl.checked) {
      u = clamp(-Kp * pendulum.theta - Kd * pendulum.thetaDot, -limit, limit);
    }
    const thetaDDot = (g / l) * Math.sin(pendulum.theta) + u;
    pendulum.thetaDot += thetaDDot * dt;
    pendulum.theta += pendulum.thetaDot * dt;

    if (Math.abs(pendulum.theta) > Math.PI / 2) {
      pendulum.theta = Math.sign(pendulum.theta) * Math.PI / 2;
      pendulum.thetaDot *= 0.2;
    }
  }

  function drawPendulum() {
    const w = pCanvas.width;
    const h = pCanvas.height;
    pCtx.clearRect(0, 0, w, h);

    const groundY = h - 68;
    pCtx.strokeStyle = "#45627d";
    pCtx.lineWidth = 3;
    pCtx.beginPath();
    pCtx.moveTo(60, groundY);
    pCtx.lineTo(w - 60, groundY);
    pCtx.stroke();

    const baseX = w / 2;
    const pxPerM = 235;
    const l = 0.85;
    const bobX = baseX + Math.sin(pendulum.theta) * l * pxPerM;
    const bobY = groundY - Math.cos(pendulum.theta) * l * pxPerM;

    pCtx.strokeStyle = "#8aa8c4";
    pCtx.lineWidth = 9;
    pCtx.lineCap = "round";
    pCtx.beginPath();
    pCtx.moveTo(baseX, groundY);
    pCtx.lineTo(bobX, bobY);
    pCtx.stroke();

    pCtx.fillStyle = "#f1ca55";
    pCtx.beginPath();
    pCtx.arc(bobX, bobY, 23, 0, Math.PI * 2);
    pCtx.fill();

    pCtx.fillStyle = "#4c82b4";
    pCtx.fillRect(baseX - 56, groundY - 8, 112, 16);

    const absDeg = Math.abs(deg(pendulum.theta));
    thetaOut.textContent = `${deg(pendulum.theta).toFixed(1)}°`;
    thetaDotOut.textContent = `${pendulum.thetaDot.toFixed(2)} rad/s`;
    pStatus.textContent = absDeg < 8 ? "UPRIGHT" : absDeg < 28 ? "RECOVERING" : "FALLING";
  }

  // ---------- LAB 2: LIPM / capture point ----------
  const lCanvas = document.getElementById("lipmCanvas");
  const lCtx = lCanvas.getContext("2d");
  const autoStep = document.getElementById("autoStep");
  const walkMode = document.getElementById("walkMode");
  const speed = bindRange("speed", "speedLabel", v => `${v.toFixed(2)} m/s`);
  const footHalf = bindRange("footHalf", "footHalfLabel", v => `${v.toFixed(2)} m`);
  const stepReach = bindRange("stepReach", "stepReachLabel", v => `${v.toFixed(2)} m`);
  const height = bindRange("height", "heightLabel", v => `${v.toFixed(2)} m`);

  const xOut = document.getElementById("xOut");
  const vOut = document.getElementById("vOut");
  const zmpOut = document.getElementById("zmpOut");
  const cpOut = document.getElementById("cpOut");
  const lStatus = document.getElementById("lipmStatus");

  let sim;
  function resetLIPM() {
    sim = {
      x: 0.0,
      v: 0.0,
      stance: 0.0,
      otherFoot: -0.23,
      leftStance: true,
      zmp: 0.0,
      zmpReq: 0.0,
      cp: 0.0,
      stepping: false,
      stepT: 0,
      stepDuration: 0.34,
      stepFrom: -0.23,
      stepTarget: 0.28,
      fallTime: 0,
      walkClock: 0,
      cameraX: 0
    };
  }
  resetLIPM();

  document.getElementById("lipmReset").addEventListener("click", resetLIPM);
  document.getElementById("pushSmall").addEventListener("click", () => { sim.v += 0.42; });
  document.getElementById("pushBig").addEventListener("click", () => { sim.v += 1.05; });

  function beginStep(target) {
    if (sim.stepping) return;
    const reach = Number(stepReach.value);
    const minTarget = sim.stance - reach;
    const maxTarget = sim.stance + reach;
    sim.stepFrom = sim.otherFoot;
    sim.stepTarget = clamp(target, minTarget, maxTarget);
    sim.stepT = 0;
    sim.stepping = true;
  }

  function finishStep() {
    const oldStance = sim.stance;
    sim.stance = sim.stepTarget;
    sim.otherFoot = oldStance;
    sim.leftStance = !sim.leftStance;
    sim.stepping = false;
    sim.stepT = 0;
  }

  function stepLIPM(dt) {
    const zc = Number(height.value);
    const omega = Math.sqrt(g / zc);
    const b = Number(footHalf.value);
    const vRef = walkMode.checked ? Number(speed.value) : 0;

    sim.cp = sim.x + sim.v / omega;

    // Desired acceleration: regulate velocity in walk mode, otherwise return CoM near stance foot.
    const xRef = walkMode.checked ? sim.stance + 0.12 * Math.sign(vRef || 1) : sim.stance;
    const kpX = walkMode.checked ? 1.8 : 3.2;
    const kdX = walkMode.checked ? 1.25 : 2.6;
    const aDes = -kpX * (sim.x - xRef) - kdX * (sim.v - vRef);
    sim.zmpReq = sim.x - aDes / (omega * omega);
    sim.zmp = clamp(sim.zmpReq, sim.stance - b, sim.stance + b);

    const a = omega * omega * (sim.x - sim.zmp);
    sim.v += a * dt;
    sim.x += sim.v * dt;
    sim.cp = sim.x + sim.v / omega;

    const cpOutside = sim.cp < sim.stance - b || sim.cp > sim.stance + b;
    sim.walkClock += dt;

    if (!sim.stepping && autoStep.checked && cpOutside) {
      beginStep(sim.cp + (walkMode.checked ? 0.10 * Math.sign(vRef || sim.v || 1) : 0));
    }

    if (!sim.stepping && walkMode.checked && sim.walkClock > 0.64) {
      const nominal = sim.stance + clamp(vRef * 0.62, -Number(stepReach.value), Number(stepReach.value));
      const target = 0.65 * nominal + 0.35 * sim.cp;
      beginStep(target);
      sim.walkClock = 0;
    }

    if (sim.stepping) {
      sim.stepT += dt;
      if (sim.stepT >= sim.stepDuration) finishStep();
    }

    const reachable = Math.abs(sim.cp - sim.stance) <= Number(stepReach.value) + b;
    if (!reachable) sim.fallTime += dt;
    else sim.fallTime = Math.max(0, sim.fallTime - 2 * dt);

    sim.cameraX += (sim.x - sim.cameraX) * Math.min(1, dt * 3.2);
  }

  function worldToScreen(x) {
    const scale = 320;
    return lCanvas.width / 2 + (x - sim.cameraX) * scale;
  }

  function drawFoot(center, groundY, alpha, lift = 0) {
    const b = Number(footHalf.value);
    const x = worldToScreen(center);
    const width = Math.max(28, 2 * b * 320);
    lCtx.globalAlpha = alpha;
    lCtx.fillStyle = "#77a9d8";
    lCtx.fillRect(x - width / 2, groundY - 11 - lift, width, 11);
    lCtx.globalAlpha = 1;
  }

  function drawLIPM() {
    const w = lCanvas.width;
    const h = lCanvas.height;
    const groundY = h - 72;
    lCtx.clearRect(0, 0, w, h);

    lCtx.strokeStyle = "#35516c";
    lCtx.lineWidth = 2;
    lCtx.beginPath();
    lCtx.moveTo(30, groundY);
    lCtx.lineTo(w - 30, groundY);
    lCtx.stroke();

    let swingPos = sim.otherFoot;
    let swingLift = 0;
    if (sim.stepping) {
      const s = clamp(sim.stepT / sim.stepDuration, 0, 1);
      const smooth = s * s * (3 - 2 * s);
      swingPos = sim.stepFrom + (sim.stepTarget - sim.stepFrom) * smooth;
      swingLift = Math.sin(Math.PI * s) * 42;
    }

    drawFoot(sim.stance, groundY, 1, 0);
    drawFoot(swingPos, groundY, 0.7, swingLift);

    const zc = Number(height.value);
    const comX = worldToScreen(sim.x);
    const comY = groundY - zc * 300;
    const stanceX = worldToScreen(sim.stance);
    const swingX = worldToScreen(swingPos);

    lCtx.strokeStyle = "#b3c8da";
    lCtx.lineWidth = 8;
    lCtx.lineCap = "round";
    lCtx.beginPath();
    lCtx.moveTo(comX, comY + 20);
    lCtx.lineTo(stanceX, groundY - 8);
    lCtx.moveTo(comX, comY + 20);
    lCtx.lineTo(swingX, groundY - 10 - swingLift);
    lCtx.stroke();

    lCtx.strokeStyle = "#8aa8c4";
    lCtx.lineWidth = 12;
    lCtx.beginPath();
    lCtx.moveTo(comX, comY + 20);
    lCtx.lineTo(comX, comY - 72);
    lCtx.stroke();
    lCtx.fillStyle = "#b9cee0";
    lCtx.beginPath();
    lCtx.arc(comX, comY - 98, 21, 0, Math.PI * 2);
    lCtx.fill();

    lCtx.fillStyle = "#f1ca55";
    lCtx.beginPath();
    lCtx.arc(comX, comY, 12, 0, Math.PI * 2);
    lCtx.fill();

    const zmpX = worldToScreen(sim.zmp);
    lCtx.fillStyle = "#ff6e6e";
    lCtx.beginPath();
    lCtx.arc(zmpX, groundY - 4, 9, 0, Math.PI * 2);
    lCtx.fill();

    const cpX = worldToScreen(sim.cp);
    lCtx.fillStyle = "#53a4ff";
    lCtx.beginPath();
    lCtx.arc(cpX, groundY - 28, 9, 0, Math.PI * 2);
    lCtx.fill();
    lCtx.strokeStyle = "#53a4ff";
    lCtx.setLineDash([4, 5]);
    lCtx.beginPath();
    lCtx.moveTo(cpX, groundY - 38);
    lCtx.lineTo(cpX, comY - 15);
    lCtx.stroke();
    lCtx.setLineDash([]);

    if (Math.abs(sim.zmpReq - sim.zmp) > 0.002) {
      const reqX = worldToScreen(sim.zmpReq);
      lCtx.strokeStyle = "#ff9a76";
      lCtx.lineWidth = 2;
      lCtx.beginPath();
      lCtx.moveTo(reqX - 7, groundY - 15);
      lCtx.lineTo(reqX + 7, groundY - 1);
      lCtx.moveTo(reqX + 7, groundY - 15);
      lCtx.lineTo(reqX - 7, groundY - 1);
      lCtx.stroke();
    }

    xOut.textContent = `${sim.x.toFixed(3)} m`;
    vOut.textContent = `${sim.v.toFixed(3)} m/s`;
    zmpOut.textContent = `${sim.zmp.toFixed(3)} m`;
    cpOut.textContent = `${sim.cp.toFixed(3)} m`;

    const b = Number(footHalf.value);
    const cpInside = sim.cp >= sim.stance - b && sim.cp <= sim.stance + b;
    const recoverable = Math.abs(sim.cp - sim.stance) <= Number(stepReach.value) + b;

    lStatus.className = "big-status";
    if (sim.fallTime > 0.32) {
      lStatus.textContent = "FALLING";
      lStatus.classList.add("fail");
    } else if (!cpInside) {
      lStatus.textContent = recoverable ? "STEP NEEDED" : "OUT OF REACH";
      lStatus.classList.add(recoverable ? "warn" : "fail");
    } else {
      lStatus.textContent = "BALANCED";
    }
  }

  let last = performance.now();
  function frame(now) {
    const dtRaw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.02, Math.max(0.001, dtRaw));

    const n = 2;
    for (let i = 0; i < n; i++) {
      stepPendulum(dt / n);
      stepLIPM(dt / n);
    }

    drawPendulum();
    drawLIPM();
    requestAnimationFrame(frame);
  }

  resetPendulum();
  requestAnimationFrame(frame);
})();
