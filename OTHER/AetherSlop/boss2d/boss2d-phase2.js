/*
 * AetherBoss2D phase-two controller.
 *
 * Kept separate from the phase-one monolith so the Avatar of Shadow fight can
 * grow around arena mutations, boss motion, and attack sequencing without
 * turning the existing ritual code into a junk drawer.
 */
(function () {
  'use strict';

  const COLLAPSE_MS = 1250;
  const EMERGE_MS = 1450;
  const POISE_MS = 520;
  const SLAM_MS = 980;
  const SETTLE_MS = 520;
  const ECHO_INTERVAL = 200;
  const ECHO_LIFE = 720;
  const AVATAR_CONTACT_Y = 0.33;
  const AVATAR_FLOAT_IN_MS = 2600;

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const smoothstep = (t) => {
    t = clamp01(t);
    return t * t * (3 - 2 * t);
  };
  const easeInQuad = (t) => t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => {
    t = clamp01(t);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  function makeController(options) {
    const img = new Image();
    img.src = options.avatarSrc;

    const state = {
      active: false,
      elapsed: 0,
      startedSlam: false,
      collapse: null,
      slamY: null,
      echoes: [],
      echoClock: 0,
      avatar: {
        x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0,
        size: 250, baseSize: 250, alpha: 0, squash: 0, visible: false,
      },
      layoutProgress: 0,
      impact: 0,
    };

    function reset() {
      state.active = false;
      state.elapsed = 0;
      state.startedSlam = false;
      state.collapse = null;
      state.slamY = null;
      state.echoes = [];
      state.echoClock = 0;
      state.layoutProgress = 0;
      state.impact = 0;
      Object.assign(state.avatar, {
        x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0,
        size: 250, baseSize: 250, alpha: 0, squash: 0, visible: false,
      });
    }

    function start(collapseGeometry, boardRect) {
      reset();
      state.active = true;
      state.collapse = collapseGeometry;
      const cx = collapseGeometry ? collapseGeometry.cx : boardRect.left + boardRect.width / 2;
      const cy = collapseGeometry ? collapseGeometry.cy : boardRect.top + boardRect.height * 0.25;
      const size = avatarSize();
      Object.assign(state.avatar, {
        x: cx, y: cy, prevX: cx, prevY: cy,
        size, baseSize: size, alpha: 0, visible: false,
      });
    }

    function avatarSize() {
      const basis = Math.min(window.innerWidth, window.innerHeight);
      return Math.max(215, Math.min(370, basis * 0.34));
    }

    function targetHover(boardRect) {
      const size = state.avatar.baseSize || state.avatar.size;
      return {
        x: boardRect.left + boardRect.width / 2,
        y: Math.max(56, boardRect.top - size * 0.62),
      };
    }

    function targetImpactY(boardRect) {
      const size = state.avatar.baseSize || state.avatar.size;
      return boardRect.top - size * AVATAR_CONTACT_Y;
    }

    function targetInsideTopY(boardRect) {
      const size = state.avatar.baseSize || state.avatar.size;
      return boardRect.top + size * 0.5 + 10;
    }

    function spawnEcho() {
      const a = state.avatar;
      if (!a.visible || a.alpha < 0.65) return;
      const mag = Math.max(1, Math.hypot(a.vx, a.vy));
      state.echoes.push({
        x: a.x, y: a.y, size: a.size,
        nx: a.vx / mag, ny: a.vy / mag,
        age: 0,
      });
    }

    function update(dt, boardRect, callbacks) {
      if (!state.active) return state;
      state.elapsed += dt;
      state.impact = Math.max(0, state.impact - dt / 520);

      const a = state.avatar;
      a.prevX = a.x;
      a.prevY = a.y;
      a.size = a.baseSize;

      const collapseEnd = COLLAPSE_MS;
      const emergeEnd = collapseEnd + EMERGE_MS;
      const poiseEnd = emergeEnd + POISE_MS;
      const slamEnd = poiseEnd + SLAM_MS;
      const settleEnd = slamEnd + SETTLE_MS;
      const hover = targetHover(boardRect);

      if (state.elapsed < collapseEnd) {
        const p = smoothstep(state.elapsed / COLLAPSE_MS);
        if (state.collapse) {
          a.x = state.collapse.cx;
          a.y = state.collapse.cy - p * a.size * 0.16;
        }
        a.alpha = smoothstep((p - 0.44) / 0.38) * 0.78;
        a.visible = a.alpha > 0.02;
      } else if (state.elapsed < emergeEnd) {
        const p = smoothstep((state.elapsed - collapseEnd) / EMERGE_MS);
        const start = state.collapse || { cx: hover.x, cy: hover.y + 140 };
        a.x = start.cx + (hover.x - start.cx) * p;
        a.y = start.cy + (hover.y - start.cy) * easeOutCubic(p);
        a.alpha = 0.20 + p * 0.80;
        a.visible = true;
      } else if (state.elapsed < poiseEnd) {
        const t = (state.elapsed - emergeEnd) / POISE_MS;
        a.x = hover.x + Math.sin(t * Math.PI * 2) * 8;
        a.y = hover.y - Math.sin(t * Math.PI) * 10;
        a.alpha = 1;
        a.visible = true;
      } else if (state.elapsed < slamEnd) {
        const p = (state.elapsed - poiseEnd) / SLAM_MS;
        const hitAt = 0.42;
        if (p < hitAt) {
          const q = easeInQuad(p / hitAt);
          a.x = hover.x;
          a.y = hover.y + (targetImpactY(boardRect) - hover.y) * q;
          a.squash = q * 0.12;
        } else {
          if (!state.startedSlam) {
            state.startedSlam = true;
            state.slamY = targetImpactY(boardRect);
            state.impact = 1;
            if (callbacks && callbacks.onSlam) callbacks.onSlam();
          }
          const q = easeOutBack((p - hitAt) / (1 - hitAt));
          const impactY = Number.isFinite(state.slamY) ? state.slamY : targetImpactY(boardRect);
          state.layoutProgress = clamp01(q);
          a.x = boardRect.left + boardRect.width / 2 + Math.sin(q * Math.PI * 3) * 12 * (1 - q);
          a.y = impactY - 36 * Math.sin(q * Math.PI) * (1 - q * 0.25);
          a.squash = Math.max(0, (1 - q) * 0.20);
        }
        a.alpha = 1;
        a.visible = true;
      } else {
        state.layoutProgress = 1;
        const t = (state.elapsed - slamEnd) / 1000;
        const floatP = smoothstep((state.elapsed - slamEnd) / AVATAR_FLOAT_IN_MS);
        const impactY = Number.isFinite(state.slamY) ? state.slamY : targetImpactY(boardRect);
        const perchY = targetInsideTopY(boardRect);
        const minY = boardRect.top + a.size * 0.5 + 6;
        a.x = boardRect.left + boardRect.width / 2 + Math.sin(t * 1.65) * 18 + Math.sin(t * 0.61) * 9;
        a.y = impactY + (perchY - impactY) * floatP
          + (Math.sin(t * 2.1) * 12 + Math.cos(t * 0.72) * 7) * floatP;
        a.y = Math.max(minY, a.y);
        a.squash = Math.max(0, Math.sin(Math.min(1, (state.elapsed - slamEnd) / SETTLE_MS) * Math.PI) * 0.08);
        a.alpha = 1;
        a.visible = true;
      }

      a.vx = a.x - a.prevX;
      a.vy = a.y - a.prevY;
      state.echoClock += dt;
      let spawned = 0;
      while (state.echoClock >= ECHO_INTERVAL && spawned < 4) {
        state.echoClock -= ECHO_INTERVAL;
        spawnEcho();
        spawned++;
      }
      for (const e of state.echoes) e.age += dt;
      state.echoes = state.echoes.filter((e) => e.age < ECHO_LIFE);
      return state;
    }

    function drawCollapse(ctx) {
      const c = state.collapse;
      if (!c) return;
      const p = smoothstep(state.elapsed / COLLAPSE_MS);
      const pulse = Math.sin(state.elapsed * 0.035) * (1 - p);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p * 0.70);
      ctx.globalCompositeOperation = 'source-over';
      const rx = c.rx * (1 - p * 0.78) * (1 + pulse * 0.035);
      const ry = c.ry * (1 - p * 0.84) * (1 - pulse * 0.03);
      const grad = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, Math.max(rx, ry));
      grad.addColorStop(0, '#020002');
      grad.addColorStop(0.72, '#000000');
      grad.addColorStop(0.92, '#130307');
      grad.addColorStop(1, 'rgba(70, 7, 14, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(c.cx, c.cy - p * c.ry * 0.22, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(210, 210, 220, ' + (0.22 * p).toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7 + state.elapsed * 0.004;
        const r0 = Math.min(rx, ry) * (0.16 + p * 0.18);
        const r1 = Math.min(rx, ry) * (0.92 - p * 0.32);
        ctx.beginPath();
        ctx.moveTo(c.cx + Math.cos(a) * r0, c.cy + Math.sin(a) * r0);
        ctx.lineTo(c.cx + Math.cos(a) * r1, c.cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawAvatar(ctx) {
      const a = state.avatar;
      if (!a.visible || a.alpha <= 0 || !img.complete) return;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const e of state.echoes) {
        const p = e.age / ECHO_LIFE;
        const alpha = (1 - p) * 0.26;
        const drift = 18 + p * 44;
        const size = e.size * (1 + p * 0.035);
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = 'rgba(220, 220, 230, 0.45)';
        ctx.shadowBlur = 6;
        ctx.drawImage(img, e.x - size / 2 - e.nx * drift, e.y - size / 2 - e.ny * drift, size, size);
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;
      }
      if (state.impact > 0) {
        const p = 1 - state.impact;
        ctx.globalAlpha = 0.85 * state.impact;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#f5f3e8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(a.x, a.y + a.size * AVATAR_CONTACT_Y, a.size * (0.28 + p * 0.65), a.size * (0.045 + p * 0.07), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      const sx = 1 + a.squash;
      const sy = 1 - a.squash * 0.55;
      ctx.globalAlpha = a.alpha;
      ctx.shadowColor = 'rgba(210, 210, 230, 0.42)';
      ctx.shadowBlur = 18;
      ctx.translate(a.x, a.y);
      ctx.scale(sx, sy);
      ctx.drawImage(img, -a.size / 2, -a.size / 2, a.size, a.size);
      ctx.restore();
    }

    function render(ctx) {
      if (!state.active) return;
      if (state.elapsed < COLLAPSE_MS) drawCollapse(ctx);
      drawAvatar(ctx);
    }

    return {
      reset,
      start,
      update,
      render,
      get active() { return state.active; },
      get layoutProgress() { return state.layoutProgress; },
      get state() { return state; },
    };
  }

  window.AetherBoss2DPhase2 = Object.freeze({ create: makeController });
})();
