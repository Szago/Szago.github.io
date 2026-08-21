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
  const DASH_ECHO_INTERVAL = 34;
  const DASH_ECHO_LIFE = 320;
  const MAX_ECHOES = 12;
  const AVATAR_CONTACT_Y = 0.33;
  const AVATAR_FLOAT_IN_MS = 2600;
  const IMPACT_FLASH_MS = 150;
  const CAST_BLEND_MS = 130;
  const SHEET_COLUMNS = 2;
  const CAST_FRAMES = Object.freeze({ claw: 0, eye: 1, channel: 2, ritual: 3 });

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
    const dashImg = new Image();
    const castImg = new Image();
    const phaseImg = new Image();
    if (options.dashSrc) dashImg.src = options.dashSrc;
    if (options.castSrc) castImg.src = options.castSrc;
    if (options.phaseSrc) phaseImg.src = options.phaseSrc;
    let scaledAvatar = null;
    let scaledAvatarSize = 0;

    const state = {
      active: false,
      elapsed: 0,
      startedEmerge: false,
      startedSlam: false,
      collapse: null,
      slamY: null,
      echoes: [],
      echoClock: 0,
      combatAnchor: null,
      dash: null,
      combatSlam: null,
      castPose: null,
      castTransition: null,
      avatar: {
        x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0,
        size: 250, baseSize: 250, alpha: 0, squash: 0, visible: false,
      },
      layoutProgress: 0,
      impact: 0,
      impactAge: Infinity,
    };

    function reset() {
      state.active = false;
      state.elapsed = 0;
      state.startedEmerge = false;
      state.startedSlam = false;
      state.collapse = null;
      state.slamY = null;
      state.echoes = [];
      state.echoClock = 0;
      state.combatAnchor = null;
      state.dash = null;
      state.combatSlam = null;
      state.castPose = null;
      state.castTransition = null;
      state.layoutProgress = 0;
      state.impact = 0;
      state.impactAge = Infinity;
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

    function skipToGroundSlam(boardRect) {
      if (!state.active || !boardRect) return false;
      const poiseEnd = COLLAPSE_MS + EMERGE_MS + POISE_MS;
      if (state.elapsed >= poiseEnd) return false;
      const hover = targetHover(boardRect);
      state.elapsed = poiseEnd;
      state.startedSlam = false;
      state.slamY = null;
      state.layoutProgress = 0;
      state.impact = 0;
      state.impactAge = Infinity;
      state.combatAnchor = null;
      state.dash = null;
      state.combatSlam = null;
      state.castPose = null;
      state.castTransition = null;
      state.echoes = [];
      state.echoClock = 0;
      Object.assign(state.avatar, {
        x: hover.x,
        y: hover.y,
        prevX: hover.x,
        prevY: hover.y,
        vx: 0,
        vy: 0,
        alpha: 1,
        squash: 0,
        visible: true,
      });
      return true;
    }

    function avatarSize() {
      const basis = Math.min(window.innerWidth, window.innerHeight);
      return Math.max(215, Math.min(370, basis * 0.34));
    }

    function avatarBitmap(size) {
      const target = Math.max(1, Math.round(size));
      if (!scaledAvatar || scaledAvatarSize !== target) {
        scaledAvatar = document.createElement('canvas');
        scaledAvatar.width = target;
        scaledAvatar.height = target;
        const scaledCtx = scaledAvatar.getContext('2d');
        scaledCtx.imageSmoothingEnabled = false;
        scaledCtx.drawImage(img, 0, 0, target, target);
        scaledAvatarSize = target;
      }
      return scaledAvatar;
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
      return boardRect.top + size * 0.34;
    }

    function viewportSafeY(size) {
      return Math.max(28, size * 0.22);
    }

    function spawnEcho(dashing, backtrack) {
      const a = state.avatar;
      if (!a.visible || a.alpha < 0.65) return;
      const mag = Math.max(1, Math.hypot(a.vx, a.vy));
      const sampleX = a.x - a.vx * (backtrack || 0);
      const sampleY = a.y - a.vy * (backtrack || 0);
      if (dashing) {
        let previous = null;
        for (let i = state.echoes.length - 1; i >= 0; i--) {
          if (state.echoes[i].dash) { previous = state.echoes[i]; break; }
        }
        const minSpacing = Math.max(14, a.size * 0.055);
        if (previous && Math.hypot(sampleX - previous.x, sampleY - previous.y) < minSpacing) return;
      }
      state.echoes.push({
        x: sampleX, y: sampleY, size: a.size,
        nx: a.vx / mag, ny: a.vy / mag,
        age: 0,
        life: dashing ? DASH_ECHO_LIFE : ECHO_LIFE,
        dash: dashing,
        visualKind: state.dash ? 'dash' : (state.combatSlam ? 'slam' : 'base'),
        dashFrame: dashing && state.dash ? dashFrame(state.dash.progress) : 2,
        dashAngle: dashing && state.dash ? state.dash.angle : Math.atan2(a.vy, a.vx),
        slamFrame: state.combatSlam && state.combatSlam.elapsed / state.combatSlam.duration >= 0.70 ? 3 : 2,
      });
      if (state.echoes.length > MAX_ECHOES) state.echoes.splice(0, state.echoes.length - MAX_ECHOES);
    }

    function dashTo(x, y, duration) {
      if (!state.active || !state.avatar.visible) return false;
      const anchor = state.combatAnchor || { x: state.avatar.x, y: state.avatar.y };
      state.dash = {
        fromX: anchor.x,
        fromY: anchor.y,
        toX: x,
        toY: y,
        angle: Math.atan2(y - anchor.y, x - anchor.x),
        progress: 0,
        elapsed: 0,
        duration: Math.max(180, duration || 330),
      };
      state.castPose = null;
      state.castTransition = null;
      // Keep a hint of the idle aura, but do not carry its full stack into the
      // much denser movement trail.
      state.echoes = state.echoes.filter((echo) => !echo.dash).slice(-2);
      state.echoClock = DASH_ECHO_INTERVAL;
      return true;
    }

    function dashHome(boardRect, duration) {
      if (!boardRect) return false;
      const home = targetHover(boardRect);
      return dashTo(home.x, home.y, duration);
    }

    function slamTo(contactX, contactY, duration) {
      if (!state.active || !state.avatar.visible) return false;
      const a = state.avatar;
      const anchor = state.combatAnchor || { x: a.x, y: a.y };
      const size = a.baseSize || a.size;
      state.dash = null;
      state.castPose = null;
      state.castTransition = null;
      state.combatSlam = {
        fromX: anchor.x,
        fromY: anchor.y,
        hoverX: contactX,
        hoverY: Math.max(viewportSafeY(size), contactY - size * 0.92),
        targetX: contactX,
        targetY: contactY - size * AVATAR_CONTACT_Y,
        elapsed: 0,
        duration: Math.max(620, duration || 1100),
        impacted: false,
      };
      state.echoes = state.echoes.filter((echo) => !echo.dash).slice(-2);
      state.echoClock = DASH_ECHO_INTERVAL;
      return true;
    }

    function setCastPose(name, duration) {
      if (!Object.prototype.hasOwnProperty.call(CAST_FRAMES, name)) return false;
      const frame = CAST_FRAMES[name];
      const poseDuration = Math.max(180, Number(duration) || 720);
      if (state.castPose && state.castPose.frame === frame) {
        state.castPose.duration = Math.max(
          state.castPose.duration,
          state.castPose.elapsed + poseDuration
        );
        return true;
      }
      const previousFrame = state.castPose
        ? state.castPose.frame
        : (state.castTransition && state.castTransition.fadeOut
          ? state.castTransition.fromFrame
          : null);
      state.castPose = {
        frame,
        elapsed: 0,
        duration: poseDuration,
      };
      state.castTransition = {
        fromFrame: previousFrame,
        elapsed: 0,
        duration: CAST_BLEND_MS,
        fadeOut: false,
      };
      return true;
    }

    function update(dt, boardRect, callbacks) {
      if (!state.active) return state;
      state.elapsed += dt;
      state.impact = Math.max(0, state.impact - dt / 520);
      state.impactAge += dt;
      if (state.castTransition) {
        state.castTransition.elapsed += dt;
        if (state.castTransition.elapsed >= state.castTransition.duration) {
          state.castTransition = null;
        }
      }
      if (state.castPose) {
        state.castPose.elapsed += dt;
        if (state.castPose.elapsed >= state.castPose.duration) {
          state.castTransition = {
            fromFrame: state.castPose.frame,
            elapsed: 0,
            duration: CAST_BLEND_MS,
            fadeOut: true,
          };
          state.castPose = null;
        }
      }

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
        if (!state.startedEmerge) {
          state.startedEmerge = true;
          if (callbacks && callbacks.onEmerge) callbacks.onEmerge();
        }
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
            state.impactAge = 0;
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
        const minY = viewportSafeY(a.size);
        const size = a.baseSize || a.size;
        if (!state.combatAnchor) {
          state.combatAnchor = { x: boardRect.left + boardRect.width / 2, y: perchY };
        }
        if (state.combatSlam) {
          const slam = state.combatSlam;
          slam.elapsed += dt;
          const p = clamp01(slam.elapsed / slam.duration);
          const windupEnd = 0.30;
          const impactAt = 0.70;
          if (p < windupEnd) {
            const q = smoothstep(p / windupEnd);
            state.combatAnchor.x = slam.fromX + (slam.hoverX - slam.fromX) * q;
            state.combatAnchor.y = slam.fromY + (slam.hoverY - slam.fromY) * q;
          } else if (p < impactAt) {
            const q = easeInQuad((p - windupEnd) / (impactAt - windupEnd));
            state.combatAnchor.x = slam.hoverX + (slam.targetX - slam.hoverX) * q;
            state.combatAnchor.y = slam.hoverY + (slam.targetY - slam.hoverY) * q;
          } else {
            if (!slam.impacted) {
              slam.impacted = true;
              state.impact = 1;
              state.impactAge = 0;
              if (callbacks && callbacks.onSlam) callbacks.onSlam();
            }
            const q = smoothstep((p - impactAt) / (1 - impactAt));
            state.combatAnchor.x = slam.targetX + Math.sin(q * Math.PI) * size * 0.035;
            state.combatAnchor.y = slam.targetY - Math.sin(q * Math.PI) * size * 0.18;
          }
          if (p >= 1) state.combatSlam = null;
        } else if (state.dash) {
          state.dash.elapsed += dt;
          const p = clamp01(state.dash.elapsed / state.dash.duration);
          state.dash.progress = p;
          const eased = p < 0.38
            ? easeInQuad(p / 0.38) * 0.46
            : 0.46 + easeOutCubic((p - 0.38) / 0.62) * 0.54;
          state.combatAnchor.x = state.dash.fromX + (state.dash.toX - state.dash.fromX) * eased;
          state.combatAnchor.y = state.dash.fromY + (state.dash.toY - state.dash.fromY) * eased;
          if (p >= 1) state.dash = null;
        }
        const dashWeight = state.dash || state.combatSlam ? 0.18 : 1;
        a.x = state.combatAnchor.x
          + (Math.sin(t * 1.65) * 18 + Math.sin(t * 0.61) * 9) * dashWeight;
        const baseY = impactY + (state.combatAnchor.y - impactY) * floatP;
        a.y = baseY
          + (Math.sin(t * 2.1) * 12 + Math.cos(t * 0.72) * 7) * floatP * dashWeight;
        a.y = Math.max(minY, a.y);
        a.squash = Math.max(0, Math.sin(Math.min(1, (state.elapsed - slamEnd) / SETTLE_MS) * Math.PI) * 0.08);
        a.alpha = 1;
        a.visible = true;
      }

      a.vx = a.x - a.prevX;
      a.vy = a.y - a.prevY;
      const movingFast = !!state.dash || !!state.combatSlam;
      const echoInterval = movingFast ? DASH_ECHO_INTERVAL : ECHO_INTERVAL;
      state.echoClock += dt;
      let spawned = 0;
      while (state.echoClock >= echoInterval && spawned < 4) {
        state.echoClock -= echoInterval;
        spawnEcho(movingFast, dt > 0 ? clamp01(state.echoClock / dt) : 0);
        spawned++;
      }
      for (const e of state.echoes) e.age += dt;
      state.echoes = state.echoes.filter((e) => e.age < e.life);
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

    function sheetReady(sheet) {
      return !!(sheet && sheet.complete && sheet.naturalWidth && sheet.naturalHeight);
    }

    function dashFrame(progress) {
      if (progress < 0.18) return 0;
      if (progress < 0.42) return 1;
      if (progress < 0.74) return 2;
      return 3;
    }

    function sheetVisual(sheet, frame, scale, rotation) {
      return { sheet, frame, scale: scale || 1, rotation: rotation || 0 };
    }

    function currentVisual() {
      const collapseEnd = COLLAPSE_MS;
      const emergeEnd = collapseEnd + EMERGE_MS;
      const poiseEnd = emergeEnd + POISE_MS;
      const slamEnd = poiseEnd + SLAM_MS;
      const settleEnd = slamEnd + SETTLE_MS;

      if (state.dash && sheetReady(dashImg)) {
        const frame = dashFrame(state.dash.progress);
        return sheetVisual(dashImg, frame, 1.12, frame === 3 ? 0 : state.dash.angle);
      }
      if (state.combatSlam && sheetReady(phaseImg)) {
        const p = clamp01(state.combatSlam.elapsed / state.combatSlam.duration);
        return sheetVisual(phaseImg, p < 0.70 ? 2 : 3, 1.08, 0);
      }
      if (sheetReady(phaseImg)) {
        if (state.elapsed < collapseEnd) return sheetVisual(phaseImg, 0, 1.08, 0);
        if (state.elapsed < emergeEnd) {
          const p = (state.elapsed - collapseEnd) / EMERGE_MS;
          return sheetVisual(phaseImg, p < 0.54 ? 0 : 1, 1.08, 0);
        }
        if (state.elapsed < poiseEnd) return sheetVisual(phaseImg, 1, 1.08, 0);
        if (state.elapsed < slamEnd) {
          const p = (state.elapsed - poiseEnd) / SLAM_MS;
          return sheetVisual(phaseImg, p < 0.42 ? 2 : 3, 1.08, 0);
        }
        if (state.elapsed < settleEnd) return sheetVisual(phaseImg, 3, 1.08, 0);
      }
      if (state.castPose && sheetReady(castImg)) {
        const pulse = 1 + Math.sin(state.castPose.elapsed * 0.018) * 0.012;
        const visual = sheetVisual(castImg, state.castPose.frame, 1.08 * pulse, 0);
        if (state.castTransition && !state.castTransition.fadeOut) {
          visual.blendFrom = state.castTransition.fromFrame === null
            ? null
            : sheetVisual(castImg, state.castTransition.fromFrame, 1.08, 0);
          visual.blendProgress = smoothstep(
            state.castTransition.elapsed / state.castTransition.duration
          );
          visual.hasBlend = true;
        }
        return visual;
      }
      if (state.castTransition && state.castTransition.fadeOut && sheetReady(castImg)) {
        const visual = sheetVisual(castImg, state.castTransition.fromFrame, 1.08, 0);
        visual.fadeProgress = smoothstep(
          state.castTransition.elapsed / state.castTransition.duration
        );
        return visual;
      }
      return null;
    }

    function drawVisualAt(ctx, visual, x, y, size) {
      if (!visual || !sheetReady(visual.sheet)) {
        const sprite = avatarBitmap(state.avatar.baseSize || state.avatar.size);
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
        return;
      }
      const sheet = visual.sheet;
      const frameW = Math.floor(sheet.naturalWidth / SHEET_COLUMNS);
      const frameH = Math.floor(sheet.naturalHeight / SHEET_COLUMNS);
      const sourceX = (visual.frame % SHEET_COLUMNS) * frameW;
      const sourceY = Math.floor(visual.frame / SHEET_COLUMNS) * frameH;
      const drawSize = size * visual.scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(visual.rotation);
      ctx.drawImage(
        sheet,
        sourceX, sourceY, frameW, frameH,
        -drawSize / 2, -drawSize / 2, drawSize, drawSize
      );
      ctx.restore();
    }

    function drawAvatar(ctx) {
      const a = state.avatar;
      if (!a.visible || a.alpha <= 0 || !img.complete || !img.naturalWidth) return;
      const visual = currentVisual();
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = 'rgba(220, 220, 230, 0.45)';
      for (const e of state.echoes) {
        const p = e.age / e.life;
        const alpha = (1 - p) * (e.dash ? 0.20 : 0.26);
        const drift = e.dash ? p * 12 : 18 + p * 44;
        const size = e.size * (1 + p * 0.035);
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = e.dash ? 0 : 5;
        let echoVisual = null;
        if (e.visualKind === 'dash' && sheetReady(dashImg)) {
          echoVisual = sheetVisual(dashImg, e.dashFrame, 1.12, e.dashFrame === 3 ? 0 : e.dashAngle);
        } else if (e.visualKind === 'slam' && sheetReady(phaseImg)) {
          echoVisual = sheetVisual(phaseImg, e.slamFrame, 1.08, 0);
        }
        drawVisualAt(ctx, echoVisual, e.x - e.nx * drift, e.y - e.ny * drift, size);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      if (state.impact > 0) {
        const p = 1 - state.impact;
        const cx = a.x;
        const cy = a.y + a.size * AVATAR_CONTACT_Y;
        const flash = 1 - smoothstep(state.impactAge / IMPACT_FLASH_MS);
        if (flash > 0) {
          ctx.globalAlpha = 0.34 * flash;
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = '#fffdf0';
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.globalAlpha = 0.92 * flash;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - a.size * 0.42, cy - a.size * 0.08, a.size * 0.84, a.size * 0.16);
          ctx.fillRect(cx - a.size * 0.08, cy - a.size * 0.42, a.size * 0.16, a.size * 0.84);
        }
        ctx.globalAlpha = 0.95 * state.impact;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#f5f3e8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, a.size * (0.28 + p * 0.65), a.size * (0.045 + p * 0.07), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(210, 226, 255, 0.92)';
        for (let i = 0; i < 3; i++) {
          const q = clamp01((p - i * 0.12) / 0.88);
          const fade = (1 - q) * state.impact;
          if (fade <= 0) continue;
          ctx.globalAlpha = 0.72 * fade;
          ctx.beginPath();
          ctx.ellipse(cx, cy, a.size * (0.22 + q * (1.0 + i * 0.28)), a.size * (0.035 + q * (0.12 + i * 0.03)), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255, 255, 246, 0.85)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 18; i++) {
          const ang = -Math.PI * 0.94 + i * Math.PI * 1.88 / 17;
          const rayP = clamp01((p - (i % 3) * 0.035) / 0.82);
          const rayFade = (1 - rayP) * state.impact;
          if (rayFade <= 0) continue;
          const r0 = a.size * (0.24 + rayP * 0.18);
          const r1 = a.size * (0.56 + rayP * 1.15);
          const wob = Math.sin(i * 12.989 + state.impactAge * 0.06) * 0.08;
          ctx.globalAlpha = 0.46 * rayFade;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang + wob) * r0, cy + Math.sin(ang + wob) * r0 * 0.24);
          ctx.lineTo(cx + Math.cos(ang + wob) * r1, cy + Math.sin(ang + wob) * r1 * 0.24);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      const sx = 1 + a.squash;
      const sy = 1 - a.squash * 0.55;
      ctx.globalAlpha = a.alpha;
      ctx.shadowColor = 'rgba(210, 210, 230, 0.42)';
      ctx.shadowBlur = state.dash || state.combatSlam ? 8 : 18;
      ctx.translate(a.x, a.y);
      ctx.scale(sx, sy);
      if (visual && visual.hasBlend) {
        ctx.globalAlpha = a.alpha * (1 - visual.blendProgress);
        drawVisualAt(ctx, visual.blendFrom, 0, 0, a.size);
        ctx.globalAlpha = a.alpha * visual.blendProgress;
        drawVisualAt(ctx, visual, 0, 0, a.size);
      } else if (visual && Number.isFinite(visual.fadeProgress)) {
        ctx.globalAlpha = a.alpha;
        drawVisualAt(ctx, null, 0, 0, a.size);
        ctx.globalAlpha = a.alpha * (1 - visual.fadeProgress);
        drawVisualAt(ctx, visual, 0, 0, a.size);
      } else {
        drawVisualAt(ctx, visual, 0, 0, a.size);
      }
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
      skipToGroundSlam,
      dashTo,
      dashHome,
      slamTo,
      setCastPose,
      update,
      render,
      get active() { return state.active; },
      get layoutProgress() { return state.layoutProgress; },
      get dashing() { return !!state.dash; },
      get slamming() { return !!state.combatSlam; },
      get state() { return state; },
    };
  }

  window.AetherBoss2DPhase2 = Object.freeze({ create: makeController });
})();
