/* ============================================================================
 * game.js — MotoRush 3D 伪 3D 公路引擎、车流物理、压弯超跑渲染与核心玩法
 * ========================================================================== */

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const canvas = $('#game-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const audio = new window.MotoAudio();

  // ==================== 伪 3D 透视常量 ====================
  const SEG_LEN = 200;
  const RUMBLE_LEN = 3;
  const ROAD_W = 2100;
  const CAM_H = 1040;
  const FOV = 100;
  const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
  const DRAW_DIST = 175;
  const LANES = 3;

  // 6 速极速与换挡逻辑 (内部速度单位 -> km/h 换算)
  const MAX_SPEED_UNIT = 13200; // ~295 km/h (开 NOS 可达 335 km/h)
  const UNIT_TO_KMH = 295 / MAX_SPEED_UNIT;
  const GEAR_TOPS = [0, 88, 138, 185, 228, 268, 340];

  // 三条特色赛道配色与路型参数
  const TRACKS = {
    wangan: {
      name: '东京湾岸午夜',
      skyTop: '#050816',
      skyMid: '#121936',
      skyBot: '#251c47',
      sunColor: '#38bdf8',
      sunGlow: 'rgba(56, 189, 248, 0.25)',
      citySilhouette: '#0b1024',
      windowGlow: '#38bdf8',
      ground1: '#0a0f1f',
      ground2: '#0e152b',
      road1: '#1a2030',
      road2: '#161c2a',
      rumble1: '#0ea5e9',
      rumble2: '#0f172a',
      lane: 'rgba(226, 232, 240, 0.55)',
      propType: 'neon',
      curveScale: 1.0,
      hillScale: 0.75,
      trafficCount: 44,
    },
    sunset: {
      name: '太平洋日落海岸',
      skyTop: '#1b1138',
      skyMid: '#7c2d50',
      skyBot: '#f97316',
      sunColor: '#fde047',
      sunGlow: 'rgba(251, 146, 60, 0.45)',
      citySilhouette: '#2a1232',
      windowGlow: '#fb923c',
      ground1: '#1d2d44',
      ground2: '#17253a',
      road1: '#272736',
      road2: '#222230',
      rumble1: '#f43f5e',
      rumble2: '#f8fafc',
      lane: 'rgba(253, 224, 71, 0.65)',
      propType: 'palm',
      curveScale: 0.9,
      hillScale: 0.6,
      trafficCount: 36,
    },
    touge: {
      name: '秋名山午夜山道',
      skyTop: '#040914',
      skyMid: '#0d1b2a',
      skyBot: '#1b263b',
      sunColor: '#e2e8f0',
      sunGlow: 'rgba(226, 232, 240, 0.2)',
      citySilhouette: '#07111d',
      windowGlow: '#34d399',
      ground1: '#0a1914',
      ground2: '#0d211a',
      road1: '#1e222b',
      road2: '#191d25',
      rumble1: '#ef4444',
      rumble2: '#e2e8f0',
      lane: 'rgba(251, 191, 36, 0.7)',
      propType: 'mountain',
      curveScale: 1.45,
      hillScale: 1.4,
      trafficCount: 38,
    },
  };

  // ==================== 游戏全局状态 ====================
  let selectedTrackKey = 'wangan';
  let trackCfg = TRACKS.wangan;
  let segments = [];
  let trackLength = 0;
  let cars = [];

  let state = 'menu'; // menu | playing | paused | gameover
  let position = 0;
  let totalDistanceM = 0;
  let playerX = 0;      // -1 ~ +1 为路面内部，超过会踩草皮/护栏
  let speed = 0;
  let leanAngle = 0;    // -1 ~ +1 摩托车压弯倾角
  let nitro = 100;      // 0 ~ 100
  let nitroActive = false;
  let timeLeft = 45.0;
  let score = 0;
  let topSpeedKmh = 0;
  let nearMissCount = 0;
  let combo = 0;
  let comboTimer = 0;
  let nextCheckpointM = 1600;
  let shakeTimer = 0;
  let crashCooldown = 0;
  let currentGear = 1;
  let currentRpm = 1400;
  let skyOffset = 0;
  let bannerTimer = 0;

  const keys = { left: false, right: false, up: false, down: false, nitro: false };

  // 初始化 16 颗 RPM 仪表段
  const rpmStripEl = $('#hud-rpm-strip');
  const rpmSegs = [];
  for (let i = 0; i < 16; i++) {
    const d = document.createElement('div');
    d.className = 'rpm-seg ' + (i < 8 ? 'g' : i < 12 ? 'y' : 'r');
    rpmStripEl.appendChild(d);
    rpmSegs.push(d);
  }

  function getBestScore(key) {
    try {
      return Number(localStorage.getItem('motorush_best_' + key) || 0);
    } catch {
      return 0;
    }
  }

  function saveBestScore(key, val) {
    try {
      localStorage.setItem('motorush_best_' + key, String(Math.round(val)));
    } catch {}
  }

  function showBanner(text, color) {
    const el = $('#banner-msg');
    el.textContent = text;
    el.style.borderColor = color || '#38bdf8';
    el.classList.remove('hidden');
    bannerTimer = 1.6;
  }

  // ==================== 赛道几何构建器 ====================
  function easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); }
  function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5); }

  function addSegment(curve, y) {
    const n = segments.length;
    const prevY = n === 0 ? 0 : segments[n - 1].p2.world.y;
    const dark = Math.floor(n / RUMBLE_LEN) % 2 === 1;
    segments.push({
      index: n,
      p1: { world: { y: prevY, z: n * SEG_LEN }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
      curve,
      color: {
        road: dark ? trackCfg.road2 : trackCfg.road1,
        ground: dark ? trackCfg.ground2 : trackCfg.ground1,
        rumble: dark ? trackCfg.rumble2 : trackCfg.rumble1,
        lane: dark ? null : trackCfg.lane,
      },
      props: [],
      cars: [],
      isCheckpoint: false,
    });
  }

  function addRoadSection(enter, hold, leave, curve, hillHeight) {
    const startY = segments.length === 0 ? 0 : segments[segments.length - 1].p2.world.y;
    const endY = startY + hillHeight * SEG_LEN;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) {
      addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    }
    for (let n = 0; n < hold; n++) {
      addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    }
    for (let n = 0; n < leave; n++) {
      addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
    }
  }

  function buildTrack(key) {
    trackCfg = TRACKS[key] || TRACKS.wangan;
    segments = [];
    cars = [];

    const cs = trackCfg.curveScale;
    const hs = trackCfg.hillScale;

    // 环形无尽赛道组合（起跑直道 -> S弯 -> 起伏爬坡 -> 高速发卡弯 -> 俯冲直道）
    addRoadSection(20, 45, 20, 0, 0);
    addRoadSection(25, 45, 25, 2.4 * cs, 24 * hs);
    addRoadSection(20, 35, 20, -3.1 * cs, -18 * hs);
    addRoadSection(25, 50, 25, 0.8 * cs, 32 * hs);
    addRoadSection(25, 55, 25, -3.8 * cs, -28 * hs);
    addRoadSection(20, 40, 20, 3.6 * cs, 16 * hs);
    addRoadSection(20, 40, 20, -2.0 * cs, -26 * hs);
    addRoadSection(25, 55, 25, 4.1 * cs, 20 * hs);
    addRoadSection(25, 45, 25, -2.5 * cs, -20 * hs);
    addRoadSection(20, 40, 20, 0, 0);

    // 闭合终点高度回到 0
    const endY = segments[segments.length - 1].p2.world.y;
    const closeLen = 40;
    for (let i = 0; i < closeLen; i++) {
      addSegment(0, easeInOut(endY, 0, i / closeLen));
    }

    trackLength = segments.length * SEG_LEN;

    // 布置路边装饰物（路灯、霓虹龙门架、棕榈树、急弯导向牌）
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (i % 90 === 0 && i > 0) {
        seg.props.push({ type: 'gantry', offset: 0 });
      }
      if (i % 14 === 0) {
        if (trackCfg.propType === 'neon') {
          seg.props.push({ type: 'lamp', offset: -1.22 });
          seg.props.push({ type: 'lamp', offset: 1.22 });
        } else if (trackCfg.propType === 'palm') {
          seg.props.push({ type: 'palm', offset: -1.35 - (i % 3) * 0.15 });
          seg.props.push({ type: 'palm', offset: 1.35 + ((i + 1) % 3) * 0.15 });
        } else {
          seg.props.push({ type: 'pine', offset: -1.32 });
          seg.props.push({ type: 'pine', offset: 1.32 });
        }
      }
      if (Math.abs(seg.curve) > 2.6 && i % 6 === 0) {
        const side = seg.curve > 0 ? -1.16 : 1.16;
        seg.props.push({ type: 'chevron', offset: side, dir: seg.curve > 0 ? 1 : -1 });
      }
    }

    // 生成多车道 AI 社会车流
    const carStyles = [
      { kind: 'sedan', body: '#e2e8f0', roof: '#94a3b8', speedMul: 0.44, width: 0.28 },
      { kind: 'sport', body: '#ef4444', roof: '#7f1d1d', speedMul: 0.56, width: 0.28 },
      { kind: 'sport', body: '#38bdf8', roof: '#0c4a6e', speedMul: 0.52, width: 0.28 },
      { kind: 'sedan', body: '#fbbf24', roof: '#78350f', speedMul: 0.42, width: 0.28 },
      { kind: 'truck', body: '#cbd5e1', roof: '#475569', speedMul: 0.34, width: 0.34 },
    ];
    const laneCenters = [-0.66, 0, 0.66];
    for (let i = 0; i < trackCfg.trafficCount; i++) {
      const z = ((i + 1) * (trackLength / trackCfg.trafficCount) + Math.random() * 600) % trackLength;
      const style = carStyles[i % carStyles.length];
      const car = {
        z,
        offset: laneCenters[i % 3] + (Math.random() - 0.5) * 0.08,
        speed: MAX_SPEED_UNIT * style.speedMul,
        style,
        nearMissed: false,
      };
      cars.push(car);
      const idx = Math.floor(car.z / SEG_LEN) % segments.length;
      segments[idx].cars.push(car);
    }
  }

  function findSegment(z) {
    return segments[Math.floor(z / SEG_LEN) % segments.length];
  }

  // ==================== 透视投影与几何绘制 ====================
  function project(p, camX, camY, camZ) {
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    const scale = CAM_DEPTH / Math.max(1, p.camera.z);
    p.screen.scale = scale;
    p.screen.x = Math.round(W / 2 + scale * p.camera.x * (W / 2));
    p.screen.y = Math.round(H / 2 - scale * p.camera.y * (H / 2));
    p.screen.w = Math.round(scale * ROAD_W * (W / 2));
  }

  function drawQuad(color, x1, y1, w1, x2, y2, w2) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1);
    ctx.lineTo(x2 - w2, y2);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x1 + w1, y1);
    ctx.closePath();
    ctx.fill();
  }

  // ==================== 背景天空、城市/山脉剪影 ====================
  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.56);
    grad.addColorStop(0, trackCfg.skyTop);
    grad.addColorStop(0.58, trackCfg.skyMid);
    grad.addColorStop(1, trackCfg.skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H * 0.58);

    // 星空/夜景微光
    if (selectedTrackKey !== 'sunset') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
      for (let i = 0; i < 42; i++) {
        const sx = ((i * 197 + skyOffset * 25) % W + W) % W;
        const sy = (i * 61) % (H * 0.34);
        ctx.fillRect(sx, sy, (i % 3 === 0) ? 2 : 1.3, (i % 3 === 0) ? 2 : 1.3);
      }
    }

    // 太阳 / 月亮与光晕
    const sunX = W * 0.5 - ((skyOffset * 60) % (W * 0.35));
    const sunY = H * 0.34;
    const sunR = selectedTrackKey === 'sunset' ? 74 : 42;
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 3.2);
    glow.addColorStop(0, trackCfg.sunGlow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = trackCfg.sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // 复古 Synthwave 日落条纹切割
    if (selectedTrackKey === 'sunset') {
      ctx.fillStyle = trackCfg.skyBot;
      for (let s = 0; s < 5; s++) {
        ctx.fillRect(sunX - sunR, sunY + 14 + s * 12, sunR * 2, 2 + s * 0.9);
      }
    }

    // 远景城市天际线 / 山脉剪影
    const horizonY = H * 0.52;
    ctx.fillStyle = trackCfg.citySilhouette;
    if (selectedTrackKey === 'wangan') {
      const shift = ((skyOffset * 180) % 900 + 900) % 900;
      for (let b = -1; b < 22; b++) {
        const bx = b * 64 - (shift % 64);
        const seed = Math.abs(Math.sin((b + Math.floor(shift / 64)) * 12.7));
        const bh = 38 + seed * 115;
        const bw = 42 + (seed * 18);
        ctx.fillStyle = trackCfg.citySilhouette;
        ctx.fillRect(bx, horizonY - bh, bw, bh + 30);
        // 霓虹楼宇点状窗户
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        for (let wy = horizonY - bh + 8; wy < horizonY - 8; wy += 12) {
          for (let wx = bx + 6; wx < bx + bw - 8; wx += 10) {
            if (((wx + wy) % 3) !== 0) ctx.fillRect(wx, wy, 4, 4);
          }
        }
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 30);
      const shift = skyOffset * 2.2;
      for (let x = 0; x <= W; x += 28) {
        const mh = 35 + Math.sin(x * 0.008 + shift) * 28 + Math.cos(x * 0.021 + shift * 1.4) * 18;
        ctx.lineTo(x, horizonY - Math.max(8, mh));
      }
      ctx.lineTo(W, horizonY + 30);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ==================== 路边物件 & 社会车辆渲染 ====================
  function drawProp(prop, x, y, scale, clipY) {
    if (y <= 0 || scale <= 0) return;
    const h = Math.round(scale * 1350 * (H / 2));
    if (y - h >= clipY) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, clipY);
    ctx.clip();

    if (prop.type === 'lamp') {
      const poleW = Math.max(2, h * 0.045);
      ctx.fillStyle = '#334155';
      ctx.fillRect(x - poleW / 2, y - h, poleW, h);
      const armDir = prop.offset < 0 ? 1 : -1;
      const armLen = h * 0.26;
      ctx.fillRect(armDir > 0 ? x : x - armLen, y - h, armLen, Math.max(2, poleW * 0.8));
      const lx = x + armDir * armLen;
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.arc(lx, y - h + 3, Math.max(2.5, h * 0.05), 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.type === 'gantry') {
      const rw = scale * ROAD_W * (W / 2) * 1.18;
      const gh = h * 0.92;
      const bar = Math.max(3, h * 0.08);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - rw, y - gh, bar, gh);
      ctx.fillRect(x + rw - bar, y - gh, bar, gh);
      ctx.fillRect(x - rw, y - gh, rw * 2, bar * 1.5);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x - rw * 0.85, y - gh + bar * 0.45, rw * 1.7, Math.max(2, bar * 0.4));
    } else if (prop.type === 'palm') {
      const trunkW = Math.max(3, h * 0.07);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(x - trunkW / 2, y - h, trunkW, h);
      ctx.fillStyle = '#065f46';
      for (let a = -2; a <= 2; a++) {
        ctx.beginPath();
        ctx.ellipse(x + a * h * 0.14, y - h + Math.abs(a) * h * 0.05, h * 0.22, h * 0.06, a * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (prop.type === 'pine') {
      ctx.fillStyle = '#064e3b';
      ctx.beginPath();
      ctx.moveTo(x, y - h * 1.05);
      ctx.lineTo(x - h * 0.34, y - h * 0.18);
      ctx.lineTo(x + h * 0.34, y - h * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3f2718';
      ctx.fillRect(x - h * 0.06, y - h * 0.2, h * 0.12, h * 0.2);
    } else if (prop.type === 'chevron') {
      const sw = Math.max(6, h * 0.24);
      const sh = Math.max(8, h * 0.34);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x - sw / 2, y - sh * 1.35, sw, sh);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - sw * 0.25, y - sh * 1.15, sw * 0.5, sh * 0.6);
    }

    ctx.restore();
  }

  function drawTrafficCar(car, x, y, scale, clipY) {
    const cw = Math.max(8, scale * ROAD_W * (W / 2) * car.style.width);
    const ch = car.style.kind === 'truck' ? cw * 1.08 : cw * 0.62;
    if (y - ch >= clipY) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, clipY);
    ctx.clip();

    // 地面阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x - cw * 0.54, y - ch * 0.08, cw * 1.08, ch * 0.14);

    // 轮胎
    ctx.fillStyle = '#090d16';
    ctx.fillRect(x - cw * 0.48, y - ch * 0.26, cw * 0.2, ch * 0.26);
    ctx.fillRect(x + cw * 0.28, y - ch * 0.26, cw * 0.2, ch * 0.26);

    // 车身下部
    ctx.fillStyle = car.style.body;
    ctx.fillRect(x - cw * 0.5, y - ch * 0.66, cw, ch * 0.5);

    // 车顶/货箱上部
    if (car.style.kind === 'truck') {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x - cw * 0.48, y - ch, cw * 0.96, ch * 0.68);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = Math.max(1, cw * 0.03);
      ctx.strokeRect(x - cw * 0.48, y - ch, cw * 0.96, ch * 0.68);
    } else {
      ctx.fillStyle = car.style.roof;
      ctx.beginPath();
      ctx.moveTo(x - cw * 0.42, y - ch * 0.64);
      ctx.lineTo(x - cw * 0.30, y - ch);
      ctx.lineTo(x + cw * 0.30, y - ch);
      ctx.lineTo(x + cw * 0.42, y - ch * 0.64);
      ctx.closePath();
      ctx.fill();
      // 后风挡玻璃
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - cw * 0.28, y - ch * 0.92, cw * 0.56, ch * 0.24);
    }

    // 红色尾灯（带发光效果）
    ctx.fillStyle = '#ff2a4b';
    const tlW = cw * 0.2;
    const tlH = Math.max(2, ch * 0.13);
    ctx.fillRect(x - cw * 0.46, y - ch * 0.5, tlW, tlH);
    ctx.fillRect(x + cw * 0.26, y - ch * 0.5, tlW, tlH);

    // 车牌
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x - cw * 0.12, y - ch * 0.42, cw * 0.24, Math.max(2, ch * 0.11));

    ctx.restore();
  }

  // ==================== 玩家仿赛摩托与压弯骑手渲染 ====================
  function drawPlayerBike() {
    const cx = W * 0.5;
    const bounce = speed > 500 ? Math.sin(performance.now() * 0.045) * (speed / MAX_SPEED_UNIT) * 2.6 : 0;
    const baseY = H - 36 + bounce;

    ctx.save();
    ctx.translate(cx, baseY);

    // 接地轮胎投影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(leanAngle * 14, 6, 48, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 随左右变道产生最大 ±28° 真实仿赛压弯倾角！
    ctx.rotate(leanAngle * 0.48);

    // 1. 宽幅热熔后胎
    ctx.fillStyle = '#0b0f19';
    ctx.beginPath();
    ctx.roundRect(-21, -76, 42, 82, 16);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 动态轮胎胎纹滚动效果
    const treadShift = ((position * 0.18) % 16 + 16) % 16;
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.lineWidth = 2;
    for (let ty = -66 + treadShift; ty < 0; ty += 16) {
      ctx.beginPath();
      ctx.moveTo(-14, ty);
      ctx.lineTo(0, ty - 5);
      ctx.lineTo(14, ty);
      ctx.stroke();
    }

    // 2. 双边高位钛合金排气管 + NOS 氮气喷焰
    [-28, 28].forEach((ex) => {
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.ellipse(ex, -72, 7, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = nitroActive ? '#38bdf8' : '#0f172a';
      ctx.beginPath();
      ctx.ellipse(ex, -72, 4.2, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (nitroActive || (keys.up && currentRpm > 14200 && Math.random() < 0.35)) {
        const flen = nitroActive ? 34 + Math.random() * 26 : 16 + Math.random() * 12;
        const fg = ctx.createRadialGradient(ex, -68, 2, ex, -68 + flen * 0.5, flen);
        fg.addColorStop(0, '#ffffff');
        fg.addColorStop(0.35, nitroActive ? '#38bdf8' : '#fb923c');
        fg.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(ex - 6, -70);
        ctx.lineTo(ex + (Math.random() - 0.5) * 6, -70 + flen);
        ctx.lineTo(ex + 6, -70);
        ctx.closePath();
        ctx.fill();
      }
    });

    // 3. 空气动力学锐利驼峰车尾罩（红/黑/蓝赛用涂装）
    const cowlGrad = ctx.createLinearGradient(-34, -120, 34, -70);
    cowlGrad.addColorStop(0, '#0284c7');
    cowlGrad.addColorStop(0.5, '#0f172a');
    cowlGrad.addColorStop(1, '#ef4444');
    ctx.fillStyle = cowlGrad;
    ctx.beginPath();
    ctx.moveTo(-34, -84);
    ctx.lineTo(-22, -120);
    ctx.lineTo(22, -120);
    ctx.lineTo(34, -84);
    ctx.lineTo(18, -68);
    ctx.lineTo(-18, -68);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 贯穿式 LED 尾灯（刹车时爆亮红光）
    const braking = keys.down && speed > 400;
    ctx.fillStyle = braking ? '#ff1e42' : '#dc2626';
    if (braking) {
      ctx.shadowColor = '#ff1e42';
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.roundRect(-22, -96, 44, 7, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 4. 趴车赛手（连体皮衣 + 驼峰护背 + 碳纤头盔，重心随压弯内倾）
    const riderShift = leanAngle * 16;
    ctx.save();
    ctx.translate(riderShift, 0);

    // 骑手背部驼峰皮衣
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(0, -138, 28, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // 皮衣荧光条纹与护肩
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(-12, -158);
    ctx.lineTo(0, -118);
    ctx.lineTo(12, -158);
    ctx.closePath();
    ctx.fill();

    // 双肘与车把控制
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-24, -142); ctx.lineTo(-42, -120);
    ctx.moveTo(24, -142); ctx.lineTo(42, -120);
    ctx.stroke();

    // 空气动力学全盔
    const helmGrad = ctx.createRadialGradient(-6, -182, 4, 0, -174, 24);
    helmGrad.addColorStop(0, '#f8fafc');
    helmGrad.addColorStop(0.55, '#0284c7');
    helmGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = helmGrad;
    ctx.beginPath();
    ctx.arc(0, -174, 21, 0, Math.PI * 2);
    ctx.fill();
    // 头盔扰流尾翼
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(-11, -188);
    ctx.lineTo(0, -198);
    ctx.lineTo(11, -188);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.restore();

    // 极速或 NOS 开启时绘制四周放射速度线（极强速度感！）
    const kmh = speed * UNIT_TO_KMH;
    if (kmh > 220 || nitroActive) {
      const alpha = nitroActive ? 0.42 : ((kmh - 220) / 110) * 0.25;
      ctx.strokeStyle = nitroActive ? `rgba(56, 189, 248, ${alpha})` : `rgba(248, 250, 252, ${alpha})`;
      ctx.lineWidth = nitroActive ? 2.2 : 1.4;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + (performance.now() * 0.004);
        const r1 = 230 + (i % 3) * 40;
        const r2 = 640;
        ctx.beginPath();
        ctx.moveTo(W / 2 + Math.cos(ang) * r1, H * 0.52 + Math.sin(ang) * r1 * 0.65);
        ctx.lineTo(W / 2 + Math.cos(ang) * r2, H * 0.52 + Math.sin(ang) * r2 * 0.65);
        ctx.stroke();
      }
    }
  }

  // ==================== 主渲染帧 ====================
  function renderScene() {
    ctx.clearRect(0, 0, W, H);
    if (segments.length === 0) return;

    ctx.save();
    if (shakeTimer > 0) {
      const amp = shakeTimer * 22;
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    drawBackground();

    const baseSeg = findSegment(position);
    const basePercent = (position % SEG_LEN) / SEG_LEN;
    const playerSeg = findSegment(position + CAM_H * CAM_DEPTH);
    const playerPercent = ((position + CAM_H * CAM_DEPTH) % SEG_LEN) / SEG_LEN;
    const playerY = playerSeg.p1.world.y + (playerSeg.p2.world.y - playerSeg.p1.world.y) * playerPercent;

    let maxY = H;
    let x = 0;
    let dx = -(baseSeg.curve * basePercent);

    const visibleSegs = [];

    // 前向投影并由近及远绘制地面与路面
    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = segments[(baseSeg.index + n) % segments.length];
      const looped = seg.index < baseSeg.index;
      const camZ = position - (looped ? trackLength : 0);

      project(seg.p1, playerX * ROAD_W - x, playerY + CAM_H, camZ);
      project(seg.p2, playerX * ROAD_W - x - dx, playerY + CAM_H, camZ);

      x += dx;
      dx += seg.curve;

      seg.clip = maxY;
      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxY) {
        continue;
      }

      const y1 = seg.p1.screen.y;
      const y2 = seg.p2.screen.y;
      const x1 = seg.p1.screen.x;
      const x2 = seg.p2.screen.x;
      const w1 = seg.p1.screen.w;
      const w2 = seg.p2.screen.w;

      // 路侧草地/海面/高架桥外背景
      ctx.fillStyle = seg.color.ground;
      ctx.fillRect(0, y2, W, y1 - y2 + 1);

      // 路肩红白/蓝黑路缘石
      const r1 = w1 * 0.13;
      const r2 = w2 * 0.13;
      drawQuad(seg.color.rumble, x1 - w1 - r1 / 2, y1, r1 / 2, x2 - w2 - r2 / 2, y2, r2 / 2);
      drawQuad(seg.color.rumble, x1 + w1 + r1 / 2, y1, r1 / 2, x2 + w2 + r2 / 2, y2, r2 / 2);

      // 沥青主路面
      drawQuad(seg.color.road, x1, y1, w1, x2, y2, w2);

      // 车道虚线
      if (seg.color.lane) {
        const lw1 = w1 * 0.02;
        const lw2 = w2 * 0.02;
        for (let l = 1; l < LANES; l++) {
          const lx1 = x1 - w1 + (w1 * 2 * l) / LANES;
          const lx2 = x2 - w2 + (w2 * 2 * l) / LANES;
          drawQuad(seg.color.lane, lx1, y1, lw1, lx2, y2, lw2);
        }
      }

      visibleSegs.push(seg);
      maxY = y2;
    }

    // 画家算法：由远及近绘制路边物体与社会车辆
    for (let i = visibleSegs.length - 1; i >= 0; i--) {
      const seg = visibleSegs[i];
      const sc = seg.p1.screen.scale;
      const sx = seg.p1.screen.x;
      const sy = seg.p1.screen.y;
      const sw = seg.p1.screen.w;

      for (let p = 0; p < seg.props.length; p++) {
        const prop = seg.props[p];
        const px = sx + prop.offset * sw;
        drawProp(prop, px, sy, sc, seg.clip);
      }

      for (let c = 0; c < seg.cars.length; c++) {
        const car = seg.cars[c];
        const cx = sx + car.offset * sw;
        drawTrafficCar(car, cx, sy, sc, seg.clip);
      }
    }

    drawPlayerBike();
    ctx.restore();
  }

  // ==================== 主物理逻辑步进 ====================
  function updatePhysics(dt) {
    if (state !== 'playing') {
      // 菜单背景演示慢速巡航
      if (state === 'menu' && segments.length > 0) {
        position = (position + 4200 * dt) % trackLength;
        skyOffset += 0.04 * dt;
      }
      return;
    }

    const playerSeg = findSegment(position + CAM_H * CAM_DEPTH);
    const speedRatio = speed / MAX_SPEED_UNIT;

    // 氮气加速判定
    nitroActive = keys.nitro && nitro > 2 && keys.up;
    if (nitroActive) {
      nitro = Math.max(0, nitro - dt * 26);
    } else {
      nitro = Math.min(100, nitro + dt * 3.8);
    }

    const topUnit = nitroActive ? MAX_SPEED_UNIT * 1.14 : MAX_SPEED_UNIT;
    const accel = nitroActive ? 9200 : 5400;

    if (keys.up) {
      speed += accel * dt;
    } else if (keys.down) {
      speed -= 13500 * dt;
    } else {
      speed -= 2800 * dt;
    }

    // 踩出路面路肩减速
    if (Math.abs(playerX) > 1.02 && speed > MAX_SPEED_UNIT * 0.42) {
      speed -= 7800 * dt;
    }
    speed = Math.max(0, Math.min(topUnit, speed));

    // 左右转向与压弯物理 + 弯道离心力推拽
    const steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const steerRate = 2.05 * dt * (0.35 + speedRatio * 0.85);
    playerX += steerInput * steerRate;
    playerX -= playerSeg.curve * speedRatio * speedRatio * 0.46 * dt;
    playerX = Math.max(-1.42, Math.min(1.42, playerX));

    // 压弯倾角平滑插值
    const targetLean = steerInput * (0.25 + speedRatio * 0.75);
    leanAngle += (targetLean - leanAngle) * Math.min(1, dt * 11);

    // 推进里程与天空视差
    const dz = speed * dt;
    position = (position + dz) % trackLength;
    skyOffset += playerSeg.curve * speedRatio * dt * 0.9;

    const kmh = speed * UNIT_TO_KMH;
    const deltaM = (kmh / 3.6) * dt;
    totalDistanceM += deltaM;
    if (kmh > topSpeedKmh) topSpeedKmh = kmh;
    score += deltaM * (1.2 + (nitroActive ? 0.8 : 0) + combo * 0.25);

    // 6 速波箱与转速计算（自动换挡触发快排回火音）
    let nextGear = 1;
    for (let g = 1; g <= 6; g++) {
      if (kmh <= GEAR_TOPS[g] || g === 6) {
        nextGear = g;
        break;
      }
    }
    if (nextGear > currentGear && speed > 1500) {
      audio.playShiftPop();
    }
    currentGear = nextGear;
    const gMin = GEAR_TOPS[currentGear - 1] * 0.72;
    const gMax = GEAR_TOPS[currentGear];
    const gProg = Math.max(0, Math.min(1, (kmh - gMin) / Math.max(30, gMax - gMin)));
    currentRpm = 1400 + gProg * 14400 + (nitroActive ? 750 : 0);
    if (currentRpm > 16500) currentRpm = 16200 + Math.random() * 300;

    // 倒计时与检查点加时（每 1.6 km 一个检查点，+14 秒）
    timeLeft = Math.max(0, timeLeft - dt);
    if (totalDistanceM >= nextCheckpointM) {
      nextCheckpointM += 1600;
      timeLeft = Math.min(60, timeLeft + 14.0);
      score += 1200;
      audio.playCheckpoint();
      showBanner('🏁 CHECKPOINT +14.0s  (+1200 分)', '#34d399');
    }

    // 更新社会车流、碰撞判定与贴身擦车连击 (Near-Miss)
    crashCooldown = Math.max(0, crashCooldown - dt);
    shakeTimer = Math.max(0, shakeTimer - dt);
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }

    const playerZ = (position + CAM_H * CAM_DEPTH) % trackLength;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const oldIdx = Math.floor(car.z / SEG_LEN) % segments.length;
      car.z = (car.z + car.speed * dt) % trackLength;
      const newIdx = Math.floor(car.z / SEG_LEN) % segments.length;
      if (oldIdx !== newIdx) {
        const arr = segments[oldIdx].cars;
        const posInArr = arr.indexOf(car);
        if (posInArr >= 0) arr.splice(posInArr, 1);
        segments[newIdx].cars.push(car);
      }

      // 计算与玩家摩托的相对纵向距离
      let dzRel = car.z - playerZ;
      if (dzRel > trackLength / 2) dzRel -= trackLength;
      if (dzRel < -trackLength / 2) dzRel += trackLength;

      const latDist = Math.abs(playerX - car.offset);

      // 重置远车擦车标记
      if (Math.abs(dzRel) > 900) car.nearMissed = false;

      // 碰撞检测
      if (crashCooldown <= 0 && Math.abs(dzRel) < 170 && latDist < car.style.width * 0.72) {
        speed = Math.max(1200, speed * 0.36);
        combo = 0;
        comboTimer = 0;
        shakeTimer = 0.42;
        crashCooldown = 0.85;
        audio.playCrash();
        showBanner('💥 发生擦碰！速度骤降', '#f87171');
      } else if (
        !car.nearMissed &&
        kmh > 110 &&
        dzRel < 0 &&
        dzRel > -320 &&
        latDist >= car.style.width * 0.72 &&
        latDist < car.style.width * 1.48
      ) {
        car.nearMissed = true;
        nearMissCount++;
        combo++;
        comboTimer = 3.2;
        const bonus = 300 * combo;
        score += bonus;
        nitro = Math.min(100, nitro + 18);
        audio.playNearMiss(combo);
        showBanner(`⚡ 贴身擦车 x${combo}  +${bonus} 分  +NOS`, '#fbbf24');
      }
    }

    audio.updateEngine(currentRpm, kmh, keys.up, nitroActive);

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) $('#banner-msg').classList.add('hidden');
    }

    if (timeLeft <= 0) {
      finishRace();
    }

    syncHud(kmh);
  }

  function syncHud(kmh) {
    $('#hud-score').textContent = Math.round(score).toLocaleString();
    $('#hud-time').textContent = timeLeft.toFixed(1);
    $('.timer-box').classList.toggle('low', timeLeft <= 10);
    $('#hud-dist').textContent = (totalDistanceM / 1000).toFixed(2) + ' km';
    $('#hud-speed').textContent = String(Math.round(kmh));
    $('#hud-gear').textContent = String(currentGear);
    $('#hud-rpm').textContent = String(Math.round(currentRpm));
    $('#hud-nitro-pct').textContent = Math.round(nitro) + '%';
    $('#hud-nitro-fill').style.width = nitro.toFixed(1) + '%';

    const lit = Math.round((currentRpm / 16200) * 16);
    for (let i = 0; i < 16; i++) {
      rpmSegs[i].classList.toggle('on', i < lit);
    }

    const comboEl = $('#hud-combo');
    if (combo > 0) {
      comboEl.textContent = `🔥 贴身擦车连击 x${combo}`;
      comboEl.classList.remove('hidden');
    } else {
      comboEl.classList.add('hidden');
    }
  }

  function startRace() {
    buildTrack(selectedTrackKey);
    position = 0;
    totalDistanceM = 0;
    playerX = 0;
    speed = 0;
    leanAngle = 0;
    nitro = 100;
    nitroActive = false;
    timeLeft = 45.0;
    score = 0;
    topSpeedKmh = 0;
    nearMissCount = 0;
    combo = 0;
    comboTimer = 0;
    nextCheckpointM = 1600;
    shakeTimer = 0;
    crashCooldown = 0;
    currentGear = 1;
    currentRpm = 1400;

    $('#hud-best').textContent = getBestScore(selectedTrackKey).toLocaleString();
    $('#overlay-start').classList.add('hidden');
    $('#overlay-pause').classList.add('hidden');
    $('#overlay-gameover').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    $('#btn-pause').classList.remove('hidden');

    state = 'playing';
    audio.startRace();
    showBanner(`🏍️ ${trackCfg.name} — 全油门冲刺！`, '#38bdf8');
  }

  function finishRace() {
    state = 'gameover';
    audio.stopRace();
    const finalScore = Math.round(score);
    const prevBest = getBestScore(selectedTrackKey);
    const isNew = finalScore > prevBest;
    if (isNew) saveBestScore(selectedTrackKey, finalScore);

    $('#go-score').textContent = finalScore.toLocaleString();
    $('#go-dist').textContent = (totalDistanceM / 1000).toFixed(2) + ' km';
    $('#go-topspd').textContent = Math.round(topSpeedKmh) + ' km/h';
    $('#go-nearmiss').textContent = nearMissCount + ' 次';
    $('#go-record').classList.toggle('hidden', !isNew);

    $('#btn-pause').classList.add('hidden');
    $('#overlay-gameover').classList.remove('hidden');
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      audio.stopRace();
      $('#overlay-pause').classList.remove('hidden');
      $('#btn-pause').textContent = '▶ 继续';
    } else if (state === 'paused') {
      state = 'playing';
      audio.startRace();
      $('#overlay-pause').classList.add('hidden');
      $('#btn-pause').textContent = '⏸ 暂停';
    }
  }

  function backToMenu() {
    state = 'menu';
    audio.stopRace();
    $('#hud').classList.add('hidden');
    $('#overlay-pause').classList.add('hidden');
    $('#overlay-gameover').classList.add('hidden');
    $('#btn-pause').classList.add('hidden');
    $('#overlay-start').classList.remove('hidden');
  }

  // ==================== 输入与按钮事件绑定 ====================
  $$('.track-card').forEach((card) => {
    card.addEventListener('click', () => {
      $$('.track-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedTrackKey = card.dataset.track;
      buildTrack(selectedTrackKey);
    });
  });

  $('#btn-start').addEventListener('click', startRace);
  $('#btn-retry').addEventListener('click', startRace);
  $('#btn-resume').addEventListener('click', togglePause);
  $('#btn-pause').addEventListener('click', togglePause);
  $('#btn-quit').addEventListener('click', backToMenu);
  $('#btn-menu').addEventListener('click', backToMenu);

  $('#btn-sound').addEventListener('click', () => {
    const next = !audio.enabled;
    audio.setEnabled(next);
    $('#btn-sound').textContent = next ? '🔊 声浪: 开' : '🔇 声浪: 关';
  });

  function setKeyFromCode(code, pressed) {
    if (code === 'ArrowLeft' || code === 'KeyA') keys.left = pressed;
    if (code === 'ArrowRight' || code === 'KeyD') keys.right = pressed;
    if (code === 'ArrowUp' || code === 'KeyW') keys.up = pressed;
    if (code === 'ArrowDown' || code === 'KeyS') keys.down = pressed;
    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') keys.nitro = pressed;
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing' || state === 'paused') togglePause();
      return;
    }
    if (e.code === 'KeyM') {
      $('#btn-sound').click();
      return;
    }
    setKeyFromCode(e.code, true);
  });

  window.addEventListener('keyup', (e) => setKeyFromCode(e.code, false));

  // 触屏虚拟按键支持
  $$('.touch-btn').forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault(); keys[k] = true; };
    const off = (e) => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });

  // ==================== 60FPS 主循环 ====================
  buildTrack(selectedTrackKey);
  let lastTs = performance.now();

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
    lastTs = now;
    updatePhysics(dt);
    renderScene();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
