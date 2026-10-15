(() => {
  "use strict";
  const canvas = document.querySelector("#game"),
    gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  canvas.insertAdjacentHTML("afterend", '<div class="player-tags" id="playerTags"></div>');
  let playerTagEls = [];
  const banner = document.querySelector("#banner"),
    powerbar = document.querySelector("#power");
  if (!gl) {
    banner.innerHTML = "3Dを起動できません<small>WebGL対応ブラウザで開いてください</small>";
    return;
  }
  const vs = `attribute vec3 p;attribute vec3 n;uniform mat4 mvp;uniform mat4 model;uniform vec3 tint;varying vec3 col;void main(){vec3 normal=normalize(mat3(model)*n);float light=.34+.66*max(dot(normalize(vec3(-.4,1.,.5)),normal),0.);vec3 view=normalize(vec3(.2,.8,.4));float spec=pow(max(dot(reflect(-normalize(vec3(-.4,1.,.5)),normal),view),0.),22.)*.28;col=tint*light+vec3(spec);gl_Position=mvp*vec4(p,1.);}`;
  const fs = `precision mediump float;varying vec3 col;void main(){gl_FragColor=vec4(col,1.);}`;
  function shader(type, src) {
    let s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const loc = {
    p: gl.getAttribLocation(prog, "p"),
    n: gl.getAttribLocation(prog, "n"),
    mvp: gl.getUniformLocation(prog, "mvp"),
    model: gl.getUniformLocation(prog, "model"),
    tint: gl.getUniformLocation(prog, "tint"),
  };
  // WebGL geometry helpers. Meshes are uploaded once and reused during rendering.
  function mesh(data) {
    let b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return { b, count: data.length / 6 };
  }
  function tri(out, a, b, c) {
    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      N = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
      l = Math.hypot(...N) || 1;
    N = N.map((x) => x / l);
    for (let q of [a, b, c]) out.push(...q, ...N);
  }
  function cylinder(r, h, segs = 48) {
    let o = [];
    for (let i = 0; i < segs; i++) {
      let a = (i * 2 * Math.PI) / segs,
        b = ((i + 1) * 2 * Math.PI) / segs,
        A = [Math.cos(a) * r, -h / 2, Math.sin(a) * r],
        B = [Math.cos(b) * r, -h / 2, Math.sin(b) * r],
        C = [Math.cos(a) * r, h / 2, Math.sin(a) * r],
        D = [Math.cos(b) * r, h / 2, Math.sin(b) * r];
      tri(o, A, B, D);
      tri(o, A, D, C);
      tri(o, [0, h / 2, 0], D, C);
      tri(o, [0, -h / 2, 0], A, B);
    }
    return mesh(o);
  }
  function verticalWall(r, t, h, y, segs = 96) {
    let o = [];
    for (let i = 0; i < segs; i++) {
      let a = (i * 2 * Math.PI) / segs,
        b = ((i + 1) * 2 * Math.PI) / segs;
      let pt = (ang, rr, yy) => [Math.cos(ang) * rr, yy, Math.sin(ang) * rr];
      let ob0 = pt(a, r + t / 2, y),
        ob1 = pt(b, r + t / 2, y),
        ot0 = pt(a, r + t / 2, y + h),
        ot1 = pt(b, r + t / 2, y + h),
        ib0 = pt(a, r - t / 2, y),
        ib1 = pt(b, r - t / 2, y),
        it0 = pt(a, r - t / 2, y + h),
        it1 = pt(b, r - t / 2, y + h);
      tri(o, ob0, ot0, ot1);
      tri(o, ob0, ot1, ob1);
      tri(o, ib1, it1, it0);
      tri(o, ib1, it0, ib0);
      tri(o, ot0, it0, it1);
      tri(o, ot0, it1, ot1);
    }
    return mesh(o);
  }
  function ring(r, t, y, segs = 80) {
    let o = [];
    for (let i = 0; i < segs; i++) {
      let a = (i * 2 * Math.PI) / segs,
        b = ((i + 1) * 2 * Math.PI) / segs;
      let pt = (ang, rr) => [Math.cos(ang) * rr, y, Math.sin(ang) * rr];
      let A = pt(a, r - t / 2),
        B = pt(a, r + t / 2),
        C = pt(b, r - t / 2),
        D = pt(b, r + t / 2);
      tri(o, A, C, D);
      tri(o, A, D, B);
    }
    return mesh(o);
  }
  function diskShape(radius, height, teeth = 0) {
    let o = [],
      N = teeth ? teeth * 4 : 72;
    let points = [];
    for (let i = 0; i < N; i++) {
      let a = (i * 2 * Math.PI) / N;
      let rr = radius * (teeth ? (i % 4 === 0 || i % 4 === 3 ? 1 : 0.83) : 1);
      points.push([Math.cos(a) * rr, height / 2, Math.sin(a) * rr]);
    }
    for (let i = 0; i < N; i++) {
      let j = (i + 1) % N,
        A = points[i],
        B = points[j],
        a = (i * 2 * Math.PI) / N,
        b = (j * 2 * Math.PI) / N,
        loA = [A[0], -height / 2, A[2]],
        loB = [B[0], -height / 2, B[2]];
      tri(o, [0, height / 2, 0], B, A);
      tri(o, [0, -height / 2, 0], loA, loB);
      tri(o, loA, loB, B);
      tri(o, loA, B, A);
    }
    return mesh(o);
  }
  function cone(r, h, segs = 32) {
    let o = [];
    for (let i = 0; i < segs; i++) {
      let a = (i * 2 * Math.PI) / segs,
        b = ((i + 1) * 2 * Math.PI) / segs,
        A = [Math.cos(a) * r, 0, Math.sin(a) * r],
        B = [Math.cos(b) * r, 0, Math.sin(b) * r];
      tri(o, A, [0, h, 0], B);
      tri(o, [0, 0, 0], B, A);
    }
    return mesh(o);
  }
  const arenaBase = cylinder(10.5, 0.38, 112),
    floor = cylinder(10, 0.12, 112),
    outer = ring(9.88, 0.16, 0.28),
    r1 = ring(8.15, 0.045, 0.35),
    r2 = ring(5.85, 0.035, 0.35),
    r3 = ring(3.6, 0.025, 0.35),
    hub = cylinder(0.38, 0.08, 40),
    body = diskShape(1, 0.22, 12),
    wing = diskShape(0.79, 0.1, 8),
    core = cylinder(0.47, 0.16, 48),
    cap = cylinder(0.24, 0.12, 40),
    tip = cone(0.22, 0.46, 40),
    shadow = cylinder(0.94, 0.012, 40),
    wall = verticalWall(9.75, 0.34, 1.65, 0.24),
    wallTop = ring(9.75, 0.38, 1.89),
    wallBase = ring(9.75, 0.38, 0.27),
    post = cylinder(0.13, 1.5, 16),
    boostPad = cylinder(1, 0.06, 4),
    bumperMesh = cylinder(0.82, 0.48, 10);
  const meshes = [
      arenaBase,
      floor,
      outer,
      r1,
      r2,
      r3,
      hub,
      body,
      wing,
      core,
      cap,
      tip,
      shadow,
      wall,
      wallTop,
      wallBase,
      post,
      boostPad,
      bumperMesh,
    ],
    shockRing = ring(1, 0.06, 0, 56);
  // Stage definitions: layout, colors, and arena gimmicks.
  const stages = [
    {
      name: "NEON CIRCUIT",
      playRadius: 8.65,
      wallBounce: 1.14,
      drain: 1,
      cap: 1,
      scale: 1,
      base: [0.025, 0.052, 0.075],
      wall: [0.055, 0.26, 0.34],
      wallBase: [0.12, 0.72, 0.85],
      wallTop: [0.2, 0.8, 0.94],
      posts: [
        [0.12, 0.44, 0.57],
        [0.3, 0.83, 0.94],
      ],
      floor: [0.055, 0.12, 0.16],
      outer: [0.2, 0.65, 0.77],
      rings: [
        [0.13, 0.32, 0.4],
        [0.09, 0.23, 0.3],
        [0.08, 0.18, 0.23],
      ],
      hub: [0.1, 0.27, 0.33],
    },
    {
      name: "MAGMA COLOSSEUM",
      playRadius: 9.15,
      wallBounce: 1.34,
      drain: 1.12,
      cap: 1.12,
      scale: (9.15 + 1.1) / 9.75,
      base: [0.09, 0.025, 0.025],
      wall: [0.34, 0.075, 0.035],
      wallBase: [0.95, 0.24, 0.035],
      wallTop: [1, 0.58, 0.12],
      posts: [
        [0.62, 0.12, 0.045],
        [1, 0.47, 0.1],
      ],
      floor: [0.19, 0.055, 0.028],
      outer: [1, 0.28, 0.045],
      rings: [
        [0.85, 0.19, 0.035],
        [0.64, 0.12, 0.025],
        [0.42, 0.08, 0.02],
      ],
      hub: [0.72, 0.14, 0.025],
    },
    {
      name: "GRAVITY VAULT",
      playRadius: 7.85,
      wallBounce: 0.92,
      drain: 0.76,
      cap: 0.92,
      scale: (7.85 + 1.1) / 9.75,
      base: [0.035, 0.025, 0.09],
      wall: [0.13, 0.055, 0.34],
      wallBase: [0.43, 0.24, 0.95],
      wallTop: [0.64, 0.44, 1],
      posts: [
        [0.29, 0.17, 0.57],
        [0.67, 0.49, 1],
      ],
      floor: [0.065, 0.045, 0.14],
      outer: [0.48, 0.34, 0.95],
      rings: [
        [0.28, 0.18, 0.58],
        [0.19, 0.13, 0.42],
        [0.12, 0.09, 0.3],
      ],
      hub: [0.32, 0.2, 0.66],
    },
    {
      name: "BOOST GRID",
      playRadius: 8.8,
      wallBounce: 1.12,
      drain: 0.95,
      cap: 1.15,
      scale: (8.8 + 1.1) / 9.75,
      base: [0.018, 0.07, 0.09],
      wall: [0.025, 0.28, 0.34],
      wallBase: [0.08, 0.8, 0.8],
      wallTop: [0.24, 1, 1],
      posts: [
        [0.08, 0.5, 0.56],
        [0.28, 1, 1],
      ],
      floor: [0.035, 0.14, 0.16],
      outer: [0.15, 0.91, 0.95],
      rings: [
        [0.1, 0.62, 0.66],
        [0.07, 0.43, 0.48],
        [0.04, 0.28, 0.32],
      ],
      hub: [0.05, 0.5, 0.55],
      boostPads: [
        { x: -4.5, z: -3.2, a: 0.5, l: 1.7, w: 0.72 },
        { x: 4.5, z: 3.2, a: 0.5, l: 1.7, w: 0.72 },
        { x: 4.5, z: -3.2, a: -0.5, l: 1.7, w: 0.72 },
        { x: -4.5, z: 3.2, a: -0.5, l: 1.7, w: 0.72 },
      ],
      padBoost: 1.72,
      padColor: [0.08, 0.95, 1],
    },
    {
      name: "PINBALL CORE",
      playRadius: 8.45,
      wallBounce: 1.18,
      drain: 1.04,
      cap: 1.12,
      scale: (8.45 + 1.1) / 9.75,
      base: [0.07, 0.022, 0.07],
      wall: [0.27, 0.035, 0.25],
      wallBase: [0.85, 0.12, 0.72],
      wallTop: [1, 0.4, 0.88],
      posts: [
        [0.45, 0.08, 0.42],
        [1, 0.28, 0.86],
      ],
      floor: [0.14, 0.03, 0.12],
      outer: [0.95, 0.2, 0.82],
      rings: [
        [0.62, 0.12, 0.55],
        [0.4, 0.08, 0.35],
        [0.25, 0.05, 0.23],
      ],
      hub: [0.55, 0.1, 0.46],
      bumpers: [
        { x: -3.4, z: -2.1, r: 0.82 },
        { x: 3.4, z: -2.1, r: 0.82 },
        { x: -3.4, z: 2.1, r: 0.82 },
        { x: 3.4, z: 2.1, r: 0.82 },
      ],
      bumperColor: [1, 0.28, 0.78],
    },
  ];
  let selectedStage = 0;
  // Custom parts: each part changes the top’s appearance and battle stats.
  const blades = [
    {
      name: "AERO",
      note: "高速・軽量",
      color: [0.08, 0.77, 0.92],
      dark: [0.025, 0.23, 0.35],
      teeth: 10,
    },
    {
      name: "TITAN",
      note: "重量・強打",
      color: [1, 0.48, 0.1],
      dark: [0.35, 0.11, 0.025],
      teeth: 7,
    },
    {
      name: "NOVA",
      note: "均衡・安定",
      color: [0.68, 0.35, 1],
      dark: [0.2, 0.07, 0.38],
      teeth: 13,
    },
    {
      name: "FANG",
      note: "鋭いアタック",
      color: [1, 0.2, 0.17],
      dark: [0.4, 0.04, 0.03],
      teeth: 16,
    },
    {
      name: "GLACIER",
      note: "氷晶ディフェンス",
      color: [0.25, 0.65, 1],
      dark: [0.04, 0.16, 0.42],
      teeth: 8,
    },
    {
      name: "VORTEX",
      note: "旋風バランス",
      color: [0.24, 1, 0.62],
      dark: [0.02, 0.3, 0.16],
      teeth: 14,
    },
    {
      name: "METEOR",
      note: "重撃メタル",
      color: [0.92, 0.82, 0.52],
      dark: [0.32, 0.22, 0.08],
      teeth: 10,
    },
    {
      name: "VANGUARD",
      note: "三枚刃カウンター",
      color: [0.35, 0.9, 0.8],
      dark: [0.035, 0.28, 0.23],
      teeth: 6,
    },
    {
      name: "CYCLONE",
      note: "連続ヒット旋風",
      color: [1, 0.34, 0.78],
      dark: [0.36, 0.045, 0.25],
      teeth: 20,
    },
    {
      name: "god",
      note: "衝突で神速加速",
      color: [1, 0.84, 0.24],
      dark: [0.42, 0.22, 0.025],
      teeth: 18,
    },
    {
      name: "PHANTOM",
      note: "回避・持久カウンター",
      color: [0.67, 0.36, 1],
      dark: [0.17, 0.04, 0.34],
      teeth: 12,
    },
    {
      name: "TEMPEST",
      note: "超高速・軽量連撃",
      color: [0.33, 1, 0.56],
      dark: [0.025, 0.3, 0.1],
      teeth: 24,
    },
  ].map((b) => {
    let t = {
        AERO: [0.94, 0.82, 1.05, 1.22],
        TITAN: [1.25, 1.22, 0.91, 0.78],
        NOVA: [1, 1.08, 1.12, 0.98],
        FANG: [1.32, 0.78, 0.84, 1.16],
        GLACIER: [0.82, 1.3, 1.16, 0.86],
        VORTEX: [1.08, 0.92, 1, 1.12],
        METEOR: [1.2, 1.14, 0.95, 0.82],
        VANGUARD: [1.18, 1.25, 1, 0.96],
        CYCLONE: [1.16, 0.82, 0.9, 1.2],
        god: [1.3, 1.04, 0.78, 0.72],
        PHANTOM: [1.04, 1.08, 1.22, 1.08],
        TEMPEST: [1.12, 0.76, 0.78, 1.52],
      }[b.name] || [1, 1, 1, 1],
      r =
        {
          AERO: 1.03,
          TITAN: 1.14,
          NOVA: 0.99,
          FANG: 1.08,
          GLACIER: 0.96,
          VORTEX: 1.05,
          METEOR: 1.16,
          VANGUARD: 1.1,
          CYCLONE: 1.04,
          god: 1.2,
          PHANTOM: 1.08,
          TEMPEST: 0.94,
        }[b.name] || 1,
      w =
        {
          AERO: 0.87,
          TITAN: 0.74,
          NOVA: 0.82,
          FANG: 0.96,
          GLACIER: 0.7,
          VORTEX: 0.92,
          METEOR: 0.78,
          VANGUARD: 0.9,
          CYCLONE: 0.95,
          god: 1.02,
          PHANTOM: 0.78,
          TEMPEST: 1.04,
        }[b.name] || 0.79;
    return {
      ...b,
      attack: t[0],
      defense: t[1],
      stamina: t[2],
      mobility: t[3],
      body: diskShape(r, 0.22, b.teeth),
      wing: diskShape(w, 0.1, Math.max(6, b.teeth - 3)),
    };
  });
  const drivers = [
    {
      name: "RUSH",
      note: "細身ロング軸",
      speed: 1.55,
      drain: 1.25,
      tint: [0.2, 0.92, 1],
      tip: cone(0.14, 0.62, 32),
    },
    {
      name: "GUARD",
      note: "幅広ガード軸",
      speed: 0.93,
      drain: 0.67,
      tint: [1, 0.66, 0.22],
      tip: cone(0.32, 0.3, 32),
    },
    {
      name: "BALANCE",
      note: "標準バランス軸",
      speed: 1.15,
      drain: 0.88,
      tint: [0.75, 0.56, 1],
      tip: cone(0.22, 0.46, 32),
    },
    {
      name: "DRIFT",
      note: "傾く高速軸",
      speed: 1.38,
      drain: 1.05,
      tint: [0.45, 1, 0.48],
      tip: cone(0.19, 0.5, 32),
    },
    {
      name: "ANCHOR",
      note: "重い持久軸",
      speed: 0.82,
      drain: 0.52,
      tint: [1, 0.38, 0.26],
      tip: cone(0.37, 0.24, 32),
    },
    {
      name: "HYPER",
      note: "超高速ラッシュ",
      speed: 1.78,
      drain: 1.48,
      tint: [0.2, 0.82, 1],
      tip: cone(0.12, 0.68, 32),
    },
    {
      name: "STABILIZER",
      note: "低重心安定",
      speed: 1.02,
      drain: 0.58,
      tint: [0.8, 0.85, 0.95],
      tip: cone(0.28, 0.34, 32),
    },
    {
      name: "BREAKER",
      note: "衝撃反発・攻撃型",
      speed: 1.12,
      drain: 1.12,
      tint: [1, 0.24, 0.16],
      tip: cone(0.24, 0.48, 32),
    },
    {
      name: "GLIDE",
      note: "滑走・持久特化",
      speed: 1.24,
      drain: 0.48,
      tint: [0.34, 0.7, 1],
      tip: cone(0.18, 0.56, 32),
    },
    {
      name: "god",
      note: "衝突で神速加速",
      speed: 0.76,
      drain: 0.72,
      tint: [1, 0.82, 0.18],
      tip: cone(0.16, 0.7, 32),
    },
    {
      name: "PULSE",
      note: "加速・旋回ブースト",
      speed: 1.48,
      drain: 1.2,
      tint: [1, 0.25, 0.75],
      tip: cone(0.13, 0.66, 32),
    },
    {
      name: "ORBIT",
      note: "広域旋回・持久型",
      speed: 1.31,
      drain: 0.64,
      tint: [0.35, 0.95, 1],
      tip: cone(0.2, 0.52, 32),
    },
  ].map((d) => {
    let t = {
      RUSH: [1.02, 0.86],
      GUARD: [0.88, 1.18],
      BALANCE: [1, 1],
      DRIFT: [1.08, 0.9],
      ANCHOR: [0.86, 1.28],
      HYPER: [1.16, 0.7],
      STABILIZER: [0.92, 1.22],
      BREAKER: [1.28, 0.82],
      GLIDE: [0.94, 1.35],
      god: [1.38, 0.86],
      PULSE: [1.08, 0.92],
      ORBIT: [0.96, 1.28],
    }[d.name] || [1, 1];
    return { ...d, power: t[0], stamina: t[1] };
  });
  const armors = [
    {
      name: "LIGHT",
      note: "軽量・高速",
      color: [0.66, 0.95, 1],
      radius: 0.58,
      teeth: 8,
      mass: 0.9,
    },
    {
      name: "HEAVY",
      note: "重量・強打",
      color: [1, 0.63, 0.2],
      radius: 0.68,
      teeth: 12,
      mass: 1.2,
    },
    {
      name: "SPIKE",
      note: "突起・攻撃",
      color: [1, 0.27, 0.35],
      radius: 0.7,
      teeth: 16,
      mass: 1.08,
    },
    {
      name: "GUARD",
      note: "広幅・防御",
      color: [0.56, 0.8, 1],
      radius: 0.72,
      teeth: 6,
      mass: 1.15,
    },
    {
      name: "TUNGSTEN",
      note: "超重量・強反撃",
      color: [0.82, 0.88, 0.95],
      radius: 0.74,
      teeth: 10,
      mass: 1.34,
    },
    {
      name: "FEATHER",
      note: "軽量・旋回",
      color: [0.7, 1, 0.82],
      radius: 0.55,
      teeth: 18,
      mass: 0.78,
    },
    {
      name: "AEGIS",
      note: "多層装甲・耐久型",
      color: [0.55, 0.72, 1],
      radius: 0.77,
      teeth: 8,
      mass: 1.27,
    },
    {
      name: "SHOCK",
      note: "反発プレート",
      color: [1, 0.46, 0.3],
      radius: 0.64,
      teeth: 15,
      mass: 1.02,
    },
    {
      name: "god",
      note: "衝突で神速加速",
      color: [1, 0.82, 0.2],
      radius: 0.82,
      teeth: 20,
      mass: 1.42,
    },
    {
      name: "REACTOR",
      note: "反応加速・耐久強化",
      color: [0.28, 1, 0.77],
      radius: 0.78,
      teeth: 14,
      mass: 1.1,
    },
    {
      name: "PRISM",
      note: "多面防御・持久型",
      color: [0.76, 0.5, 1],
      radius: 0.8,
      teeth: 10,
      mass: 1.28,
    },
  ].map((a) => ({
    ...a,
    defense:
      {
        LIGHT: 0.84,
        HEAVY: 1.18,
        SPIKE: 0.88,
        GUARD: 1.34,
        TUNGSTEN: 1.12,
        FEATHER: 0.72,
        AEGIS: 1.52,
        SHOCK: 0.96,
        god: 1.38,
        REACTOR: 1.12,
        PRISM: 1.46,
      }[a.name] || 1,
    speed:
      {
        LIGHT: 1.12,
        HEAVY: 0.88,
        SPIKE: 1.03,
        GUARD: 0.9,
        TUNGSTEN: 0.82,
        FEATHER: 1.24,
        AEGIS: 0.78,
        SHOCK: 1.08,
        god: 0.76,
        REACTOR: 1.08,
        PRISM: 0.82,
      }[a.name] || 1,
    stamina:
      {
        LIGHT: 0.94,
        HEAVY: 1.04,
        SPIKE: 0.9,
        GUARD: 1.12,
        TUNGSTEN: 1.18,
        FEATHER: 0.86,
        AEGIS: 1.24,
        SHOCK: 0.96,
        god: 1.24,
        REACTOR: 1.02,
        PRISM: 1.3,
      }[a.name] || 1,
    mesh: diskShape(a.radius, 0.1, a.teeth),
  }));
  let bladeIndex = 0,
    driverIndex = 0,
    armorIndex = 0,
    cpuBuild = { blade: 0, driver: 0, armor: 0 };
  const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function mul(a, b) {
    let o = Array(16).fill(0);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  }
  function tr(x, y, z) {
    let m = I();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
  }
  function sc(x, y, z) {
    let m = I();
    m[0] = x;
    m[5] = y;
    m[10] = z;
    return m;
  }
  function ry(a) {
    let m = I(),
      c = Math.cos(a),
      s = Math.sin(a);
    m[0] = c;
    m[2] = -s;
    m[8] = s;
    m[10] = c;
    return m;
  }
  function persp(f, asp, n, fa) {
    let q = 1 / Math.tan(f / 2),
      nf = 1 / (n - fa);
    return [q / asp, 0, 0, 0, 0, q, 0, 0, 0, 0, (fa + n) * nf, -1, 0, 0, 2 * fa * n * nf, 0];
  }
  function look(eye, center, up) {
    let z = norm(sub(eye, center)),
      x = norm(cross(up, z)),
      y = cross(z, x);
    return [
      x[0],
      y[0],
      z[0],
      0,
      x[1],
      y[1],
      z[1],
      0,
      x[2],
      y[2],
      z[2],
      0,
      -dot(x, eye),
      -dot(y, eye),
      -dot(z, eye),
      1,
    ];
  }
  function sub(a, b) {
    return a.map((v, i) => v - b[i]);
  }
  function norm(a) {
    let l = Math.hypot(...a);
    return a.map((x) => x / l);
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) {
    return a.reduce((s, x, i) => s + x * b[i], 0);
  }
  function draw(m, model, color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.b);
    gl.enableVertexAttribArray(loc.p);
    gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(loc.n);
    gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 24, 12);
    gl.uniformMatrix4fv(loc.model, false, new Float32Array(model));
    gl.uniformMatrix4fv(loc.mvp, false, new Float32Array(mul(vp, model)));
    gl.uniform3fv(loc.tint, color);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
  }
  let remoteBuild = { blade: 0, driver: 0, armor: 0 },
    onlineSide = 0,
    remoteReady = false,
    playerCount = 2,
    netChannels = new Map(),
    seatByChannel = new WeakMap(),
    connectedSeats = new Set([0]),
    cpuBuilds = [],
    netBuilds = [],
    cpuSeats = new Set(),
    cpuCountChoice = 0,
    playerNames = Array(4).fill(""),
    localPlayerName = "",
    W = 0,
    H = 0,
    vp = I(),
    tops = [],
    state = "ready",
    gameMode = "cpu",
    readyFlags = [false, true],
    countdownElapsed = 0,
    chargeStarts = [0, 0],
    chargingSides = [false, false],
    falseStarts = [false, false],
    queuedPowers = [null, null],
    chargeStart = 0,
    charging = false,
    last = 0,
    shake = 0,
    parts = [],
    fragments = [],
    shockwaves = [],
    netPeer = null,
    netChannel = null,
    netConnected = false,
    onlineMode = false,
    netLastSend = 0;
  function size() {
    let d = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.floor(W * d);
    canvas.height = Math.floor(H * d);
    gl.viewport(0, 0, canvas.width, canvas.height);
    let eye = [0, 16.2, 22.8],
      view = look(eye, [0, 0, 0], [0, 1, 0]);
    vp = mul(persp(0.82, canvas.width / canvas.height, 0.1, 70), view);
  }
  addEventListener("resize", size);
  size();
  function top(player, seat = 0) {
    return {
      p: player,
      seat,
      x:
        Math.cos((seat * Math.PI * 2) / Math.max(2, playerCount) - Math.PI / 2) *
        (stages[selectedStage].playRadius * 0.78),
      z:
        Math.sin((seat * Math.PI * 2) / Math.max(2, playerCount) - Math.PI / 2) *
        (stages[selectedStage].playRadius * 0.78),
      vx: 0,
      vz: 0,
      a: Math.random() * 6.2,
      spin: seat % 2 ? -1 : 1,
      omega: 0,
      mass: 1,
      attack: 1,
      defense: 1,
      stamina: 1,
      e: 100,
      durability: 100,
      alive: true,
      launched: false,
      flying: false,
      flyTime: 0,
      cracked: false,
      trail: [],
      trailClock: 0,
    };
  }
  function buildForSeat(i) {
    if (gameMode === "online" && netConnected && i === onlineSide)
      return { blade: bladeIndex, driver: driverIndex, armor: armorIndex };
    if (gameMode === "online" && netBuilds[i]) return netBuilds[i];
    if (i === 0) return { blade: bladeIndex, driver: driverIndex, armor: armorIndex };
    return cpuBuilds[i] || cpuBuild;
  }
  function sanitizePlayerName(value) {
    return (
      String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 16) || "PLAYER"
    );
  }
  function escapeHTML(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function playerLabel(i) {
    if (gameMode === "online") {
      if (playerNames[i]) return playerNames[i];
      if (cpuSeats.has(i)) return "CPU " + i;
      return i === onlineSide ? "YOU" : "PLAYER " + (i + 1);
    }
    return i === 0 ? "YOU" : "CPU " + i;
  }
  function renderHUD() {
    let el = document.querySelector("#fighterList");
    if (!el) return;
    el.innerHTML = tops
      .map(
        (b, i) =>
          `<div class="fighter ${i === (netConnected ? onlineSide : 0) ? "p" : ""}" style="--seat:${i}"><div class="fighter-name">${escapeHTML(playerLabel(i))}</div><div class="meters"><div class="meter-row"><span>持久力</span><div class="meter"><i id="pm${i}"></i></div></div><div class="meter-row"><span>耐久力</span><div class="meter durability"><i id="pd${i}"></i></div></div></div></div>`,
      )
      .join("");
    let controls = document.querySelector("#launchControls");
    if (controls) {
      let seats = gameMode === "cpu" ? [0] : netConnected ? [onlineSide] : [0];
      controls.innerHTML = seats
        .map(
          (i) =>
            `<button class="launch" data-launch="${i}">⚡ ${gameMode === "online" ? "LAUNCH" : "P" + (i + 1) + " LAUNCH"}</button>`,
        )
        .join("");
      controls
        .querySelectorAll("[data-launch]")
        .forEach((btn) => bindLaunchButton(btn, +btn.dataset.launch));
    }
  }
  // Menus, customization, and online room controls.
  function updateReadyUI() {
    let panel = document.querySelector("#readyPanel"),
      info = document.querySelector("#readyInfo"),
      note = document.querySelector("#modeNote"),
      count = document.querySelector("#playerCount"),
      cpuWrap = document.querySelector("#cpuCountWrap"),
      cpuSelect = document.querySelector("#cpuCountSelect");
    if (!panel) return;
    count.value = String(playerCount);
    count.disabled = netConnected;
    document.querySelector("#onlineNameWrap").style.display =
      gameMode === "online" ? "flex" : "none";
    document.querySelector("#playerName").value = localPlayerName;
    document.querySelector("#stageSelect").value = String(selectedStage);
    document.querySelector("#stageSelect").disabled = netConnected && onlineSide !== 0;
    document.querySelector("#stageTitle").textContent = stages[selectedStage].name;
    cpuWrap.style.display = gameMode === "online" ? "flex" : "none";
    cpuCountChoice = Math.min(cpuCountChoice, playerCount - 1);
    cpuSelect.value = String(netConnected ? cpuSeats.size : cpuCountChoice);
    cpuSelect.disabled = netConnected;
    document.querySelector("#modeCPU").classList.toggle("sel", gameMode === "cpu");
    document
      .querySelector("#modeOnline")
      .classList.toggle("sel", gameMode === "online" || netConnected);
    note.innerHTML =
      gameMode === "cpu"
        ? "CPU BATTLE <span>CPUが自動参加。準備OKで開始</span>"
        : netConnected
          ? `ONLINE / ${connectedSeats.size} of ${playerCount} <span>CPU ${cpuSeats.size}人を含む参加枠</span>`
          : "ONLINE BATTLE <span>部屋を作る前にCPU参加数を選べます</span>";
    if (gameMode === "cpu") {
      panel.innerHTML = Array.from({ length: playerCount }, (_, i) =>
        i === 0
          ? `<button id="readyLocal" class="ready-local ${readyFlags[0] ? "ready" : ""}">${readyFlags[0] ? "P1 準備OK ✓" : "P1 準備OK"}</button>`
          : `<div class="ready-player ok"><span>CPU ${i}</span><b>準備OK ✓</b></div>`,
      ).join("");
      info.textContent = readyFlags[0]
        ? "準備完了！カウントダウンが始まります"
        : "P1の準備を待っています";
    } else {
      let selfButton = netConnected
        ? `<button id="readyLocal" class="ready-local ${readyFlags[onlineSide] ? "ready" : ""}">${readyFlags[onlineSide] ? "あなた（P" + (onlineSide + 1) + "） 準備OK ✓" : "あなた（P" + (onlineSide + 1) + "） 準備OK"}</button>`
        : `<button class="ready-local" onclick="document.querySelector('#netModal').classList.add('open')">部屋を作る / コードで参加</button>`;
      let seats = Array.from({ length: playerCount }, (_, i) => {
        if (i === (netConnected ? onlineSide : 0))
          return `<div class="ready-player ok"><span>${netConnected ? "あなた" : "ホスト"} / P${i + 1}</span><b>${netConnected && readyFlags[i] ? "準備OK ✓" : "ホスト"}</b></div>`;
        if (cpuSeats.has(i))
          return `<div class="ready-player ok"><span>CPU ${i}</span><b>準備OK ✓</b></div>`;
        return `<div class="ready-player ${connectedSeats.has(i) ? "ok" : ""}"><span>${connectedSeats.has(i) ? "PLAYER " + (i + 1) : "P" + (i + 1)}</span><b>${connectedSeats.has(i) ? (readyFlags[i] ? "準備OK ✓" : "準備中") : "参加待ち"}</b></div>`;
      }).join("");
      panel.innerHTML = selfButton + seats;
      info.textContent =
        connectedSeats.size >= playerCount && readyFlags.slice(0, playerCount).every(Boolean)
          ? "全員準備OK！"
          : "参加者と全員の準備を待っています";
    }
    let ready = document.querySelector("#readyLocal");
    if (ready)
      ready.onclick = () => {
        if (state !== "ready") return;
        if (gameMode === "cpu") {
          readyFlags[0] = !readyFlags[0];
          updateReadyUI();
          startCountdown();
        } else if (netConnected) {
          readyFlags[onlineSide] = !readyFlags[onlineSide];
          try {
            if (onlineSide === 0)
              broadcast({ type: "lobby", readyFlags, connected: [...connectedSeats] });
            else
              netChannel?.send({
                type: "ready",
                player: onlineSide,
                ready: readyFlags[onlineSide],
              });
          } catch {}
          updateReadyUI();
          startCountdown();
        }
      };
  }
  function startCountdown() {
    if (state !== "ready" || !readyFlags.slice(0, playerCount).every(Boolean)) return;
    if (gameMode === "online") {
      if (!netConnected || onlineSide !== 0 || connectedSeats.size < playerCount) return;
    }
    state = "countdown";
    countdownElapsed = 0;
    document.querySelector("#prepare").classList.remove("open");
    banner.innerHTML = "3<small>READY…</small>";
    if (gameMode === "online") broadcast({ type: "countdown" });
  }
  function setMode(mode) {
    if (state !== "ready" || netConnected) return;
    gameMode = mode;
    onlineMode = mode === "online";
    cpuSeats.clear();
    connectedSeats = new Set(Array.from({ length: mode === "cpu" ? playerCount : 1 }, (_, i) => i));
    readyFlags =
      mode === "cpu"
        ? Array.from({ length: playerCount }, (_, i) => i !== 0)
        : Array(playerCount).fill(false);
    updateReadyUI();
  }
  let nameSyncTimer = 0;
  document.querySelector("#playerName").addEventListener("input", (e) => {
    localPlayerName = String(e.target.value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 16);
    try {
      localStorage.setItem("spinclash-player-name", localPlayerName);
    } catch {}
    if (gameMode === "online" && netConnected && onlineSide >= 0)
      playerNames[onlineSide] = sanitizePlayerName(localPlayerName);
    renderHUD();
    clearTimeout(nameSyncTimer);
    nameSyncTimer = setTimeout(() => {
      if (gameMode === "online" && netConnected && onlineSide === 0) {
        playerNames[0] = sanitizePlayerName(localPlayerName);
        refreshLobby();
      } else if (gameMode === "online" && netConnected && netChannel)
        netChannel.send({ type: "name", name: sanitizePlayerName(localPlayerName) });
    }, 220);
  });
  try {
    localPlayerName = localStorage.getItem("spinclash-player-name") || "";
    document.querySelector("#playerName").value = localPlayerName;
  } catch {}
  document.querySelector("#modeCPU").onclick = () => {
    setMode("cpu");
  };
  document.querySelector("#modeOnline").onclick = () => {
    setMode("online");
  };
  document.querySelector("#playerCount").onchange = (e) => {
    if (netConnected) return;
    playerCount = Math.max(2, Math.min(4, +e.target.value || 2));
    if (gameMode === "cpu") readyFlags = Array.from({ length: playerCount }, (_, i) => i !== 0);
    else readyFlags = Array(playerCount).fill(false);
    reset();
  };
  function chooseStage(value) {
    if (netConnected && onlineSide !== 0) return;
    selectedStage = Math.max(0, Math.min(stages.length - 1, +value || 0));
    document.querySelector("#stageSelect").value = String(selectedStage);
    document.querySelector("#battleStageSelect").value = String(selectedStage);
    document.querySelector("#stageTitle").textContent = stages[selectedStage].name;
    if (netConnected && onlineSide === 0) broadcast({ type: "stage", stage: selectedStage });
    else if (state === "ready") reset();
  }
  document.querySelector("#stageSelect").onchange = (e) => chooseStage(e.target.value);
  document.querySelector("#battleStageSelect").onchange = (e) => chooseStage(e.target.value);
  document.querySelector("#cpuCountSelect").onchange = (e) => {
    if (netConnected) return;
    cpuCountChoice = Math.min(playerCount - 1, Math.max(0, +e.target.value || 0));
    e.target.value = String(cpuCountChoice);
    updateReadyUI();
  };
  function reset() {
    cpuBuilds = Array.from({ length: playerCount }, (_, i) =>
      i === 0
        ? { blade: bladeIndex, driver: driverIndex, armor: armorIndex }
        : {
            blade: Math.floor(Math.random() * blades.length),
            driver: Math.floor(Math.random() * drivers.length),
            armor: Math.floor(Math.random() * armors.length),
          },
    );
    cpuBuild = cpuBuilds[1] || cpuBuilds[0];
    if (!netConnected)
      connectedSeats = new Set(
        Array.from({ length: gameMode === "cpu" ? playerCount : 1 }, (_, i) => i),
      );
    tops = Array.from({ length: playerCount }, (_, i) =>
      top(i === (netConnected && gameMode === "online" ? onlineSide : 0), i),
    );
    tops.forEach((b, i) => {
      b.seat = i;
      if (i > 0) b.mass = armors[cpuBuilds[i].armor].mass;
    });
    state = "ready";
    readyFlags =
      gameMode === "cpu"
        ? Array.from({ length: playerCount }, (_, i) => i !== 0)
        : Array.from({ length: playerCount }, (_, i) => cpuSeats.has(i));
    countdownElapsed = 0;
    chargeStarts = Array(playerCount).fill(0);
    chargingSides = Array(playerCount).fill(false);
    falseStarts = Array(playerCount).fill(false);
    queuedPowers = Array(playerCount).fill(null);
    charging = false;
    document.querySelector("#launchControls").innerHTML = "";
    parts = [];
    fragments = [];
    shockwaves = [];
    document.querySelector("#prepare").classList.add("open");
    banner.innerHTML = "READY?<small>準備OKでカウントダウン</small>";
    document.querySelector("#pm0")?.style.setProperty("width", "100%");
    powerbar.style.width = "0%";
    renderHUD();
    updateReadyUI();
  }
  reset();
  function launchTop(side, force, penalty = false) {
    let b = tops[side];
    if (!b || b.launched || state !== "fight") return;
    startAudio();
    sfx("launch", force);
    b.launched = true;
    let theta = (side * Math.PI * 2) / playerCount - Math.PI / 2;
    b.x = Math.cos(theta) * (stages[selectedStage].playRadius - 0.9);
    b.z = Math.sin(theta) * (stages[selectedStage].playRadius - 0.9);
    let config = buildForSeat(side),
      angle = theta + Math.PI + (0.5 - Math.random()) * 0.46,
      speed =
        (((10.5 + force * 13.5) *
          drivers[config.driver].speed *
          blades[config.blade].mobility *
          armors[config.armor].speed) /
          Math.sqrt(armors[config.armor].mass)) *
        (penalty ? 0.38 : 1);
    b.vx = Math.cos(angle) * speed;
    b.vz = Math.sin(angle) * speed;
    b.spin = side % 2 ? -1 : 1;
    b.omega = (side % 2 ? 1 : -1) * (46 + force * 32) * (penalty ? 0.72 : 1);
    b.mass = armors[config.armor].mass;
    b.attack = blades[config.blade].attack * drivers[config.driver].power;
    b.defense = blades[config.blade].defense * armors[config.armor].defense;
    b.stamina =
      blades[config.blade].stamina * drivers[config.driver].stamina * armors[config.armor].stamina;
    b.e = 100;
    b.durability = 100;
    b.cracked = false;
    b.trail = [];
    if (penalty) {
      banner.innerHTML = "FALSE START!<small>フライングのため威力ダウン</small>";
      sfx("crack");
    } else {
      banner.innerHTML = "LET IT RIP!";
      setTimeout(() => {
        if (state === "fight") banner.innerHTML = "";
      }, 550);
    }
  }
  function performLaunch(side, force, penalty = false) {
    if (gameMode === "online" && netConnected && onlineSide !== 0) {
      if (tops[side]) tops[side].launched = true;
      try {
        netChannel?.send({ type: "launch", player: onlineSide, force, penalty });
      } catch {}
      return;
    }
    launchTop(side, force, penalty);
  }
  function beginBattle() {
    if (state !== "countdown") return;
    state = "fight";
    document.querySelector("#prepare").classList.remove("open");
    banner.innerHTML = "LAUNCH!<small>LET IT RIP!</small>";
    if (gameMode === "cpu" || (gameMode === "online" && onlineSide === 0)) {
      for (let i = 1; i < playerCount; i++)
        if (gameMode === "cpu" || cpuSeats.has(i)) launchTop(i, 0.62);
    }
    for (let i = 0; i < playerCount; i++) {
      if (queuedPowers[i] !== null) {
        let force = queuedPowers[i];
        queuedPowers[i] = null;
        falseStarts[i] = false;
        chargingSides[i] = false;
        charging = chargingSides.some(Boolean);
        performLaunch(i, force, true);
      }
    }
    setTimeout(() => {
      if (state === "fight") banner.innerHTML = "";
    }, 750);
  }
  function releaseLaunch(side) {
    if (!chargingSides[side]) return;
    chargingSides[side] = false;
    charging = chargingSides.some(Boolean);
    let q = Math.min(1, (performance.now() - chargeStarts[side]) / 1000),
      force = 0.35 + q * 0.65;
    if (state === "countdown") {
      falseStarts[side] = true;
      queuedPowers[side] = force;
      banner.innerHTML = "FALSE START!<small>GO後に弱い発射</small>";
      sfx("crack");
      return;
    }
    if (state === "fight") {
      let penalty = falseStarts[side];
      falseStarts[side] = false;
      queuedPowers[side] = null;
      performLaunch(side, force, penalty);
    }
  }
  function bindLaunchButton(btn, side) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (chargingSides[side] || state === "ready" || state === "over" || tops[side]?.launched)
        return;
      startAudio();
      chargeStarts[side] = performance.now();
      chargingSides[side] = true;
      charging = true;
      if (state === "countdown") {
        falseStarts[side] = true;
        banner.innerHTML = "FALSE START!<small>GO後に弱い発射</small>";
        sfx("crack");
      }
      btn.classList.add("charging");
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {}
    });
    btn.addEventListener("pointerup", () => {
      btn.classList.remove("charging");
      releaseLaunch(side);
    });
    btn.addEventListener("pointercancel", () => {
      btn.classList.remove("charging");
      releaseLaunch(side);
    });
  }
  document.querySelector("#reset").onclick = () => {
    if (gameMode === "online" && netConnected) {
      if (onlineSide === 0) {
        reset();
        broadcast({ type: "rematch" });
        refreshLobby();
      } else netChannel?.send({ type: "rematch" });
      return;
    }
    reset();
  };
  let audioCtx = null,
    lastHitSound = 0,
    lastWallSound = 0;
  const soundFiles = {
    clash: ["audio/sword_clash_1.mp3", "audio/sword_clash_2.mp3", "audio/sword_clash_3.mp3"],
    heavy: ["audio/robot_punch_1.mp3", "audio/robot_punch_3.mp3"],
    slash: ["audio/sword_slash_1.mp3"],
    wall: ["audio/katana_clash_1.mp3"],
  };
  const soundPools = Object.fromEntries(
    Object.entries(soundFiles).map(([key, list]) => [
      key,
      list.map((src) => {
        let a = new Audio(src);
        a.preload = "none";
        return a;
      }),
    ]),
  );
  function playSample(type, power = 1) {
    let pool =
      type === "hit"
        ? power > 0.68
          ? soundPools.heavy
          : soundPools.clash
        : type === "wall"
          ? soundPools.wall
          : type === "crack"
            ? soundPools.slash
            : type === "break"
              ? soundPools.heavy
              : type === "launch"
                ? soundPools.slash
                : soundPools.clash;
    try {
      let audio = pool[Math.floor(Math.random() * pool.length)];
      audio.currentTime = 0;
      audio.volume = Math.min(0.95, 0.5 + power * 0.32);
      audio.playbackRate = 0.88 + Math.random() * 0.24;
      audio.play().catch(() => {});
    } catch {}
  }
  function startAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
  }
  function sfx(type, power = 1) {
    playSample(type, power);
    if (!audioCtx) return;
    let now = audioCtx.currentTime,
      o = audioCtx.createOscillator(),
      g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    let f =
        type === "launch"
          ? 190
          : type === "hit"
            ? 105
            : type === "wall"
              ? 260
              : type === "crack"
                ? 520
                : type === "break"
                  ? 80
                  : type === "win"
                    ? 660
                    : 170,
      d = 0.12;
    if (type === "launch") {
      o.type = "sawtooth";
      o.frequency.setValueAtTime(150, now);
      o.frequency.exponentialRampToValueAtTime(900 + power * 400, now + 0.1);
      o.frequency.exponentialRampToValueAtTime(180, now + 0.28);
      d = 0.32;
    } else if (type === "hit") {
      o.type = "triangle";
      o.frequency.setValueAtTime(1800 + power * 900, now);
      o.frequency.exponentialRampToValueAtTime(240, now + 0.045);
      d = 0.16;
    } else if (type === "wall") {
      o.type = "square";
      o.frequency.setValueAtTime(1200, now);
      o.frequency.exponentialRampToValueAtTime(150, now + 0.09);
      d = 0.14;
    } else if (type === "crack") {
      o.type = "square";
      o.frequency.setValueAtTime(720, now);
      o.frequency.exponentialRampToValueAtTime(210, now + 0.11);
    } else if (type === "break") {
      o.type = "sawtooth";
      o.frequency.setValueAtTime(190, now);
      o.frequency.exponentialRampToValueAtTime(35, now + 0.3);
      d = 0.3;
    } else {
      o.type = "triangle";
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(type === "win" ? 990 : 75, now + 0.2);
      d = 0.22;
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(type === "hit" ? 0.11 : 0.07, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + d);
    o.start(now);
    o.stop(now + d + 0.02);
  }
  const modal = document.querySelector("#custom");
  function updateBuildStats() {
    let b = blades[bladeIndex],
      d = drivers[driverIndex],
      a = armors[armorIndex],
      clamp = (n) => Math.max(8, Math.min(99, Math.round(n))),
      stats = [
        ["攻撃", clamp(48 + (b.attack * d.power - 1) * 95 + (a.mass - 1) * 18)],
        ["防御", clamp(48 + (b.defense * a.defense - 1) * 72)],
        ["持久", clamp(46 + (b.stamina * d.stamina * a.stamina - 1) * 62)],
        ["機動", clamp(45 + (d.speed * a.speed * b.mobility - 1) * 42)],
      ];
    document.querySelector("#statGrid").innerHTML = stats
      .map(
        ([name, value]) =>
          `<div class="stat-item"><div class="stat-head"><span>${name}</span><b>${value}</b></div><div class="stat-track"><i style="width:${value}%"></i></div></div>`,
      )
      .join("");
  }
  function drawChoices() {
    document.querySelector("#blades").innerHTML = blades
      .map(
        (b, i) =>
          `<button class="choice ${i === bladeIndex ? "sel" : ""}" data-blade="${i}">${b.name}<small>${b.note}</small></button>`,
      )
      .join("");
    document.querySelector("#drivers").innerHTML = drivers
      .map(
        (d, i) =>
          `<button class="choice ${i === driverIndex ? "sel" : ""}" data-driver="${i}">${d.name}<small>${d.note}</small></button>`,
      )
      .join("");
    document.querySelector("#armors").innerHTML = armors
      .map(
        (a, i) =>
          `<button class="choice ${i === armorIndex ? "sel" : ""}" data-armor="${i}">${a.name}<small>${a.note}</small></button>`,
      )
      .join("");
    updateBuildStats();
  }
  drawChoices();
  document.querySelector("#preCustomize").onclick = () =>
    document.querySelector("#custom").classList.add("open");
  document.querySelector("#customize").onclick = () => {
    modal.classList.add("open");
  };
  document.querySelector("#closeCustom").onclick = () => modal.classList.remove("open");
  modal.addEventListener("click", (e) => {
    let b = e.target.closest("[data-blade]");
    if (b) {
      bladeIndex = +b.dataset.blade;
      drawChoices();
      if (netConnected && onlineSide > 0)
        netChannel?.send({ type: "build", build: currentBuild() });
    }
    b = e.target.closest("[data-driver]");
    if (b) {
      driverIndex = +b.dataset.driver;
      drawChoices();
      if (netConnected && onlineSide > 0)
        netChannel?.send({ type: "build", build: currentBuild() });
    }
    b = e.target.closest("[data-armor]");
    if (b) {
      armorIndex = +b.dataset.armor;
      drawChoices();
      if (netConnected && onlineSide > 0)
        netChannel?.send({ type: "build", build: currentBuild() });
    }
  });
  document.querySelector("#done").onclick = () => modal.classList.remove("open");
  const netModal = document.querySelector("#netModal"),
    netCode = document.querySelector("#netCode");
  document.querySelector("#online").onclick = () => netModal.classList.add("open");
  document.querySelector("#closeNet").onclick = () => netModal.classList.remove("open");
  function setNetStatus(text) {
    document.querySelector("#netStatus").textContent = text;
  }
  function cleanRoomCode() {
    return netCode.value.trim().replace(/\s+/g, "").toLowerCase();
  }
  function peerLabel(err) {
    if (err.type === "unavailable-id")
      return "このコードは使用中です。別のコードを選んでください。";
    if (err.type === "peer-unavailable")
      return "部屋が見つかりません。コードとホストの待機状態を確認してください。";
    if (err.type === "network")
      return "シグナリングサーバーに接続できません。通信環境を確認してください。";
    if (err.type === "browser-incompatible") return "このブラウザはWebRTCに対応していません。";
    return "接続エラー: " + (err.message || err.type || "不明なエラー");
  }
  function broadcast(message) {
    for (let ch of netChannels.values())
      if (ch && ch.open)
        try {
          ch.send(message);
        } catch {}
  }
  function currentBuild() {
    return { blade: bladeIndex, driver: driverIndex, armor: armorIndex };
  }
  function refreshLobby() {
    updateReadyUI();
    broadcast({
      type: "lobby",
      playerCount,
      stage: selectedStage,
      cpuSeats: [...cpuSeats],
      playerNames,
      readyFlags,
      connected: [...connectedSeats],
      builds: netBuilds,
    });
  }
  function closePeer() {
    netConnected = false;
    onlineMode = false;
    netChannel = null;
    netChannels.clear();
    seatByChannel = new WeakMap();
    connectedSeats = new Set([0]);
    if (netPeer) {
      try {
        netPeer.destroy();
      } catch {}
      netPeer = null;
    }
  }
  function applySnapshot(q) {
    if (!Array.isArray(q.players)) return;
    playerCount = q.players.length;
    if (tops.length !== playerCount) {
      tops = q.players.map((_, i) => top(i === onlineSide, i));
      renderHUD();
    }
    for (let i = 0; i < playerCount; i++) {
      let t = tops[i],
        d = q.players[i];
      Object.assign(t, d);
      t.p = i === onlineSide;
      t.seat = i;
    }
    if (q.stage !== undefined && selectedStage !== q.stage) {
      selectedStage = q.stage;
      document.querySelector("#stageSelect").value = String(selectedStage);
      document.querySelector("#battleStageSelect").value = String(selectedStage);
      document.querySelector("#stageTitle").textContent = stages[selectedStage].name;
    }
    if (q.cpuSeats) cpuSeats = new Set(q.cpuSeats);
    if (q.playerNames) playerNames = q.playerNames;
    if (q.builds) netBuilds = q.builds;
    if (q.connected) connectedSeats = new Set(q.connected);
    if (q.readyFlags) readyFlags = q.readyFlags;
    if (q.state === "fight" && state !== "over") {
      state = "fight";
      document.querySelector("#prepare").classList.remove("open");
    } else if (q.state === "over" && state !== "over") {
      state = "over";
      banner.innerHTML = "BATTLE OVER";
    }
    tops.forEach((b, i) => {
      let m = document.querySelector("#pm" + i),
        d = document.querySelector("#pd" + i);
      if (m) m.style.width = Math.max(0, b.e) + "%";
      if (d) d.style.width = Math.max(0, b.durability) + "%";
    });
  }
  function assignGuest(ch, q) {
    let seat = 1;
    while (seat < playerCount && (connectedSeats.has(seat) || cpuSeats.has(seat))) seat++;
    if (seat >= playerCount) {
      try {
        ch.send({ type: "full" });
      } catch {}
      ch.close();
      return;
    }
    connectedSeats.add(seat);
    seatByChannel.set(ch, seat);
    netChannels.set(seat, ch);
    netBuilds[seat] = q.build || { blade: 0, driver: 0, armor: 0 };
    playerNames[seat] = q.name ? sanitizePlayerName(q.name) : "PLAYER " + (seat + 1);
    try {
      ch.send({
        type: "welcome",
        seat,
        playerCount,
        stage: selectedStage,
        cpuSeats: [...cpuSeats],
        playerNames,
        readyFlags,
        connected: [...connectedSeats],
        builds: netBuilds,
      });
    } catch {}
    refreshLobby();
    setNetStatus("P" + (seat + 1) + " が参加しました。全員の準備を待っています。");
  }
  function bindChannel(ch) {
    let host = !!(netPeer && netPeer.id && netPeer.id.startsWith("spinclash-")),
      didOpen = false;
    function onOpen() {
      if (didOpen) return;
      didOpen = true;
      if (host) return;
      netChannel = ch;
      netConnected = true;
      onlineMode = true;
      gameMode = "online";
      onlineSide = -1;
      try {
        ch.send({
          type: "join",
          build: currentBuild(),
          name: localPlayerName ? sanitizePlayerName(localPlayerName) : "",
        });
      } catch {}
      setNetStatus("ホストに接続しました。参加枠を確認中…");
    }
    ch.on("open", onOpen);
    ch.on("close", () => {
      if (host) {
        let seat = seatByChannel.get(ch);
        if (seat !== undefined) {
          connectedSeats.delete(seat);
          netChannels.delete(seat);
          netBuilds[seat] = null;
          readyFlags[seat] = false;
          refreshLobby();
        }
        return;
      }
      netConnected = false;
      onlineMode = false;
      gameMode = "cpu";
      onlineSide = 0;
      playerCount = 2;
      reset();
      setNetStatus("接続が切れました。CPU戦に戻りました。");
    });
    ch.on("error", (err) => setNetStatus(peerLabel(err)));
    ch.on("data", (data) => {
      try {
        let q = typeof data === "string" ? JSON.parse(data) : data;
        if (host) {
          if (q.type === "join") {
            assignGuest(ch, q);
            return;
          }
          let seat = seatByChannel.get(ch);
          if (seat === undefined) return;
          if (q.type === "ready") {
            readyFlags[seat] = !!q.ready;
            refreshLobby();
            startCountdown();
            return;
          }
          if (q.type === "build") {
            netBuilds[seat] = q.build;
            refreshLobby();
            return;
          }
          if (q.type === "name") {
            playerNames[seat] = sanitizePlayerName(q.name);
            refreshLobby();
            return;
          }
          if (q.type === "launch" && state === "fight") {
            launchTop(seat, Math.min(1, Math.max(0.35, q.force || 0.5)), !!q.penalty);
            return;
          }
          if (q.type === "stage") {
            selectedStage = Math.max(0, Math.min(stages.length - 1, +q.stage || 0));
            document.querySelector("#stageSelect").value = String(selectedStage);
            document.querySelector("#battleStageSelect").value = String(selectedStage);
            document.querySelector("#stageTitle").textContent = stages[selectedStage].name;
            return;
          }
          if (q.type === "rematch") {
            reset();
            refreshLobby();
            broadcast({ type: "rematch" });
            return;
          }
        } else {
          if (q.type === "full") {
            setNetStatus("部屋は満員です。ホストに人数設定を確認してください。");
            return;
          }
          if (q.type === "welcome") {
            onlineSide = q.seat;
            playerCount = q.playerCount;
            selectedStage = q.stage ?? 0;
            cpuSeats = new Set(q.cpuSeats || []);
            cpuCountChoice = cpuSeats.size;
            playerNames = q.playerNames || Array(playerCount).fill("");
            playerNames[onlineSide] = localPlayerName
              ? sanitizePlayerName(localPlayerName)
              : playerNames[onlineSide] || "PLAYER " + (onlineSide + 1);
            document.querySelector("#stageSelect").value = String(selectedStage);
            document.querySelector("#stageTitle").textContent = stages[selectedStage].name;
            gameMode = "online";
            netConnected = true;
            reset();
            tops.forEach((t, i) => (t.p = i === onlineSide));
            readyFlags = q.readyFlags || Array(playerCount).fill(false);
            connectedSeats = new Set(q.connected || [0, onlineSide]);
            netBuilds = q.builds || [];
            netBuilds[onlineSide] = currentBuild();
            renderHUD();
            updateReadyUI();
            setNetStatus("オンライン対戦 " + playerCount + "人。P" + (onlineSide + 1) + "で参加中");
            return;
          }
          if (q.type === "lobby") {
            playerCount = q.playerCount;
            if (q.cpuSeats) cpuSeats = new Set(q.cpuSeats);
            if (q.playerNames) {
              playerNames = q.playerNames;
              renderHUD();
            }
            if (q.stage !== undefined) {
              selectedStage = q.stage;
              document.querySelector("#stageTitle").textContent = stages[selectedStage].name;
            }
            readyFlags = q.readyFlags || Array(playerCount).fill(false);
            connectedSeats = new Set(q.connected || []);
            if (q.builds) netBuilds = q.builds;
            updateReadyUI();
            return;
          }
          if (q.type === "countdown") {
            if (state === "ready") {
              state = "countdown";
              countdownElapsed = 0;
              document.querySelector("#prepare").classList.remove("open");
            }
            return;
          }
          if (q.type === "snapshot") {
            applySnapshot(q);
            return;
          }
          if (q.type === "stage") {
            selectedStage = Math.max(0, Math.min(stages.length - 1, +q.stage || 0));
            document.querySelector("#stageSelect").value = String(selectedStage);
            document.querySelector("#battleStageSelect").value = String(selectedStage);
            document.querySelector("#stageTitle").textContent = stages[selectedStage].name;
            return;
          }
          if (q.type === "rematch") {
            reset();
            setNetStatus("ホストが再戦を準備しています");
            return;
          }
        }
      } catch {}
    });
    if (ch.open) onOpen();
  }
  function makeRoom() {
    let code = cleanRoomCode();
    if (!code) {
      code = Math.random().toString(36).slice(2, 8);
      netCode.value = code.toUpperCase();
    }
    if (!/^[a-z0-9_-]{4,12}$/.test(code)) {
      setNetStatus("4〜12文字の英数字、-、_で入力してください。");
      return;
    }
    if (typeof Peer === "undefined") {
      setNetStatus("接続ライブラリが読み込めません。ネット接続を確認して再読み込みしてください。");
      return;
    }
    closePeer();
    gameMode = "online";
    onlineMode = true;
    onlineSide = 0;
    playerCount = Math.max(2, Math.min(4, +document.querySelector("#playerCount").value || 2));
    cpuCountChoice = Math.min(
      playerCount - 1,
      Math.max(0, +document.querySelector("#cpuCountSelect").value || 0),
    );
    cpuSeats = new Set(Array.from({ length: cpuCountChoice }, (_, i) => playerCount - 1 - i));
    readyFlags = Array.from({ length: playerCount }, (_, i) => cpuSeats.has(i));
    connectedSeats = new Set([0, ...cpuSeats]);
    playerNames = Array(playerCount).fill("");
    playerNames[0] = localPlayerName ? sanitizePlayerName(localPlayerName) : "HOST";
    for (let i of cpuSeats) playerNames[i] = "CPU " + i;
    netBuilds = Array(playerCount).fill(null);
    netBuilds[0] = currentBuild();
    netChannels = new Map();
    netConnected = true;
    reset();
    netPeer = new Peer("spinclash-" + code + "-room", {
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });
    document.querySelector("#prepare").classList.add("open");
    netPeer.on("open", () => {
      setNetStatus(
        "部屋 " + code.toUpperCase() + " を作成。参加者を待っています（" + playerCount + "人）",
      );
      updateReadyUI();
    });
    netPeer.on("connection", (ch) => bindChannel(ch));
    netPeer.on("error", (err) => {
      setNetStatus(peerLabel(err));
      if (!netChannels.size) {
        netConnected = false;
        onlineMode = false;
      }
    });
  }
  function joinRoom() {
    let code = cleanRoomCode();
    if (!/^[a-z0-9_-]{4,12}$/.test(code)) {
      setNetStatus("部屋コードを4〜12文字で入力してください。");
      return;
    }
    if (typeof Peer === "undefined") {
      setNetStatus("接続ライブラリが読み込めません。ネット接続を確認して再読み込みしてください。");
      return;
    }
    closePeer();
    gameMode = "online";
    onlineMode = true;
    onlineSide = -1;
    netPeer = new Peer(undefined, {
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });
    netPeer.on("open", () => {
      let ch = netPeer.connect("spinclash-" + code + "-room", {
        reliable: true,
        serialization: "json",
      });
      bindChannel(ch);
      setNetStatus("接続中…");
    });
    netPeer.on("error", (err) => {
      setNetStatus(peerLabel(err));
      if (!netConnected) onlineMode = false;
    });
  }
  document.querySelector("#makeRoom").onclick = makeRoom;
  document.querySelector("#joinRoom").onclick = joinRoom;
  document.querySelector("#copyCode").onclick = async () => {
    try {
      await navigator.clipboard.writeText(netCode.value);
      setNetStatus("部屋コードをコピーしました");
    } catch {
      netCode.focus();
      netCode.select();
      setNetStatus("コードを選択しました。コピーしてください");
    }
  };
  document.querySelector("#disconnect").onclick = () => {
    closePeer();
    gameMode = "cpu";
    playerCount = 2;
    reset();
    setNetStatus("切断しました。CPU戦に戻りました。");
  };
  addEventListener("keydown", (e) => {
    if (
      e.code === "KeyR" &&
      !e.repeat &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) &&
      !document.querySelector(".custom.open")
    ) {
      e.preventDefault();
      reset();
      return;
    }
    let seatByKey = { Space: netConnected ? onlineSide : 0, Enter: 1, KeyQ: 2, KeyE: 3 }[e.code];
    if (seatByKey === undefined || seatByKey < 0 || e.repeat) return;
    e.preventDefault();
    if (state === "ready" || state === "over" || tops[seatByKey]?.launched) return;
    startAudio();
    chargeStarts[seatByKey] = performance.now();
    chargingSides[seatByKey] = true;
    charging = true;
    if (state === "countdown") {
      falseStarts[seatByKey] = true;
      banner.innerHTML = "FALSE START!<small>GO後に弱い発射</small>";
      sfx("crack");
    }
  });
  addEventListener("keyup", (e) => {
    let seat = { Space: netConnected ? onlineSide : 0, Enter: 1, KeyQ: 2, KeyE: 3 }[e.code];
    if (seat !== undefined && seat >= 0) releaseLaunch(seat);
  });
  function burst(x, z, col, count = 24) {
    for (let i = 0; i < count; i++) {
      let a = Math.random() * 6.28,
        s = 3 + Math.random() * 11;
      parts.push({
        x,
        y: 0.42 + Math.random() * 0.8,
        z,
        vx: Math.cos(a) * s,
        vy: 4 + Math.random() * 10,
        vz: Math.sin(a) * s,
        l: 0.55 + Math.random() * 1.1,
        c: col,
        scale: 0.045 + Math.random() * 0.16,
      });
    }
  }
  function shockwave(x, z, color = "#d9fcff", power = 1) {
    shockwaves.push({ x, z, color, age: 0, life: 0.48, power });
  }
  function shatter(b) {
    let c = b.p ? "#5ceaff" : "#ff65a8";
    burst(b.x, b.z, c, 42);
    for (let i = 0; i < 9; i++) {
      let a = Math.random() * 6.28,
        s = 2 + Math.random() * 8;
      fragments.push({
        x: b.x,
        y: 0.7 + Math.random() * 0.4,
        z: b.z,
        vx: Math.cos(a) * s,
        vy: 3 + Math.random() * 7,
        vz: Math.sin(a) * s,
        rx: Math.random() * 4,
        rz: Math.random() * 4,
        l: 1.4,
        c: b.p ? [0.12, 0.8, 1] : [1, 0.12, 0.4],
      });
    }
  }
  function ringout(b) {
    if (b.flying || !b.alive) return;
    b.flying = true;
    b.flyTime = 0;
    b.vx += (b.x / Math.max(0.01, Math.hypot(b.x, b.z))) * 13;
    b.vz += (b.z / Math.max(0.01, Math.hypot(b.x, b.z))) * 13;
    b.vy = 8;
    shake = 0.18;
    shatter(b);
  }
  function end(w) {
    if (state === "over") return;
    state = "over";
    banner.innerHTML =
      (w === "p" ? "YOU WIN!" : "YOU LOSE") +
      `<small>${w === "p" ? "相手を場外に弾き出した！" : "リセットして再挑戦"}</small>`;
    sfx(w === "p" ? "win" : "break");
  }
  function triggerGodBoost(b, dx, dz, impact) {
    let build = buildForSeat(b.seat),
      count =
        (blades[build.blade]?.name === "god" ? 1 : 0) +
        (drivers[build.driver]?.name === "god" ? 1 : 0) +
        (armors[build.armor]?.name === "god" ? 1 : 0);
    if (!count || performance.now() < (b.godCooldown || 0)) return;
    b.godCooldown = performance.now() + 460;
    let speed = Math.hypot(b.vx, b.vz),
      vx = speed > 0 ? b.vx / speed : dx,
      dz0 = speed > 0 ? b.vz / speed : dz,
      newSpeed = Math.min(
        58,
        Math.max(11, speed) * (1.48 + count * 0.31) + Math.min(impact, 22) * 0.22,
      );
    b.vx = vx * newSpeed + dx * Math.min(impact, 18) * 0.035;
    b.vz = dz0 * newSpeed + dz * Math.min(impact, 18) * 0.035;
    b.omega += count * 18;
    burst(b.x, b.z, "#ffd34e", 18 + count * 8);
    shockwave(b.x, b.z, "#ffd34e", 1 + count * 0.22);
    sfx("hit", 0.9);
  }
  function applyStageGimmicks(b, prevX = b.x, prevZ = b.z) {
    let arena = stages[selectedStage],
      now = performance.now();
    if (arena.boostPads && now > (b.padCooldown || 0)) {
      for (let pad of arena.boostPads) {
        let c = Math.cos(pad.a),
          sn = Math.sin(pad.a),
          hit = false;
        for (let step = 0; step <= 8; step++) {
          let t = step / 8,
            dx = prevX + (b.x - prevX) * t - pad.x,
            dz = prevZ + (b.z - prevZ) * t - pad.z,
            lx = dx * c + dz * sn,
            lz = -dx * sn + dz * c;
          if (Math.abs(lx) < pad.l && Math.abs(lz) < pad.w) {
            hit = true;
            break;
          }
        }
        if (hit) {
          let speed = Math.hypot(b.vx, b.vz),
            target = Math.min(56, Math.max(9, speed) * arena.padBoost);
          if (speed > 0) {
            b.vx *= target / speed;
            b.vz *= target / speed;
          } else {
            b.vx = Math.cos(pad.a) * target;
            b.vz = Math.sin(pad.a) * target;
          }
          b.padCooldown = now + 540;
          burst(b.x, b.z, "#ffd34e", 22);
          shockwave(b.x, b.z, "#ffd34e", 1.45);
          sfx("wall");
          break;
        }
      }
    }
    if (arena.bumpers && now > (b.bumperCooldown || 0)) {
      for (let bump of arena.bumpers) {
        let sx = b.x - prevX,
          sz = b.z - prevZ,
          den = sx * sx + sz * sz,
          t = den
            ? Math.max(0, Math.min(1, ((bump.x - prevX) * sx + (bump.z - prevZ) * sz) / den))
            : 1,
          cx = prevX + sx * t,
          cz = prevZ + sz * t,
          dx = cx - bump.x,
          dz = cz - bump.z,
          d = Math.hypot(dx, dz),
          min = bump.r + 0.55;
        if (d < min) {
          let nx, nz;
          if (d < 0.05) {
            let speed = Math.hypot(b.vx, b.vz) || 1;
            nx = -b.vx / speed;
            nz = -b.vz / speed;
          } else {
            nx = dx / d;
            nz = dz / d;
          }
          let approach = b.vx * nx + b.vz * nz;
          b.x = bump.x + nx * (min + 0.02);
          b.z = bump.z + nz * (min + 0.02);
          if (approach < 0) {
            b.vx -= nx * approach * 2.25;
            b.vz -= nz * approach * 2.25;
          }
          b.bumperCooldown = now + 420;
          burst(b.x, b.z, "#ffd34e", 20);
          shockwave(b.x, b.z, "#ffd34e", 1.25);
          sfx("hit", 0.8);
          triggerGodBoost(b, nx, nz, Math.abs(approach));
          break;
        }
      }
    }
  }
  // Physics and battle simulation. Keep forces and collision rules in this section.
  function update(dt) {
    if (charging) {
      let q = 0;
      for (let i = 0; i < 2; i++)
        if (chargingSides[i])
          q = Math.max(q, Math.min(1, (performance.now() - chargeStarts[i]) / 1000));
      powerbar.style.width = q * 100 + "%";
    }
    if (state === "countdown") {
      countdownElapsed += dt;
      let n = 3 - Math.floor(countdownElapsed);
      if (n > 0) banner.innerHTML = n + "<small>READY…</small>";
      else beginBattle();
    }
    if (state === "fight" && (!netConnected || onlineSide === 0)) {
      if (gameMode === "cpu" || (gameMode === "online" && onlineSide === 0))
        for (let ai of tops.slice(1)) {
          if (gameMode === "online" && !cpuSeats.has(ai.seat)) continue;
          if (!ai.launched || !ai.alive || ai.flying) continue;
          let player = tops
            .filter((t) => t !== ai && t.alive && t.launched && !t.flying)
            .sort(
              (a, b) => Math.hypot(a.x - ai.x, a.z - ai.z) - Math.hypot(b.x - ai.x, b.z - ai.z),
            )[0];
          if (!player) continue;
          let dx = player.x - ai.x,
            dz = player.z - ai.z,
            d = Math.hypot(dx, dz) || 1,
            lead = Math.min(0.42, d / 12),
            tx = player.x + player.vx * lead,
            tz = player.z + player.vz * lead,
            ux = (tx - ai.x) / d,
            uz = (tz - ai.z) / d,
            phase = performance.now(),
            build = buildForSeat(ai.seat),
            blade = blades[build.blade],
            driver = drivers[build.driver],
            armor = armors[build.armor],
            orbit = Math.sin(phase / 1250 + ai.seat) >= 0 ? 1 : -1,
            preferred = (11.8 * driver.speed) / Math.sqrt(armor.mass),
            flank = blade.name === "FANG" || blade.name === "AERO" ? 2.4 : 1.25,
            closeBias = d > 2.2 ? preferred : preferred * 0.76,
            attackWindow =
              d < 4.2 && Math.abs((player.vx - ai.vx) * ux + (player.vz - ai.vz) * uz) < 9,
            dash = attackWindow && Math.sin(phase / 620 + ai.seat) > 0.25 ? 4.2 : 0,
            txv = ux * (closeBias + dash) - uz * orbit * flank,
            tzv = uz * (closeBias + dash) + ux * orbit * flank;
          ai.vx += (txv - ai.vx) * Math.min(1, dt * (2.3 + driver.speed * 0.45));
          ai.vz += (tzv - ai.vz) * Math.min(1, dt * (2.3 + driver.speed * 0.45));
          let sp = Math.hypot(ai.vx, ai.vz),
            cap = preferred + 4.2;
          if (sp > cap) {
            ai.vx *= cap / sp;
            ai.vz *= cap / sp;
          }
        }
      for (let b of tops) {
        if (!b.alive || !b.launched) continue;
        if (b.flying) {
          b.flyTime += dt;
          b.x += b.vx * dt;
          b.z += b.vz * dt;
          b.vy = (b.vy || 0) - 9 * dt;
          b.y = (b.y || 0.7) + b.vy * dt;
          b.a += (b.omega || 40) * dt * 1.2;
          if (b.flyTime > 1.15) {
            b.alive = false;
          }
          continue;
        }
        b.a += b.omega * dt;
        b.omega *= Math.pow(0.9992, dt * 60);
        let prevX = b.x,
          prevZ = b.z;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        applyStageGimmicks(b, prevX, prevZ);
        b.trailClock += dt;
        if (Math.hypot(b.vx, b.vz) > 4.5 && b.trailClock > 0.018) {
          b.trail.push([b.x, b.z]);
          if (b.trail.length > 24) b.trail.shift();
          b.trailClock = 0;
        } else if (b.trailClock > 0.16 && b.trail.length) {
          b.trail.shift();
          b.trailClock = 0;
        }
        let roll = Math.pow(0.9972, dt * 60);
        b.vx *= roll;
        b.vz *= roll;
        b.e -=
          (dt *
            (0.55 + Math.abs(b.omega) * 0.032 + Math.hypot(b.vx, b.vz) * 0.035) *
            (drivers[buildForSeat(b.seat).driver].drain / armors[buildForSeat(b.seat).armor].mass) *
            stages[selectedStage].drain) /
          (b.stamina || 1);
        let d = Math.hypot(b.x, b.z),
          wallR = stages[selectedStage].playRadius;
        if (d > wallR) {
          let nx = b.x / d,
            nz = b.z / d,
            radial = b.vx * nx + b.vz * nz;
          b.x = nx * (wallR - 0.03);
          b.z = nz * (wallR - 0.03);
          if (radial > 0) {
            let tx = -nz,
              tz = nx,
              tangent = b.vx * tx + b.vz * tz;
            b.vx = tx * tangent * 0.98 - nx * radial * stages[selectedStage].wallBounce;
            b.vz = tz * tangent * 0.98 - nz * radial * stages[selectedStage].wallBounce;
            triggerGodBoost(b, -nx, -nz, radial);
            let rebound = Math.hypot(b.vx, b.vz),
              build = buildForSeat(b.seat),
              hasGod =
                blades[build.blade]?.name === "god" ||
                drivers[build.driver]?.name === "god" ||
                armors[build.armor]?.name === "god",
              speedLimit = hasGod ? 58 : 38 * stages[selectedStage].cap;
            if (rebound > speedLimit) {
              b.vx *= speedLimit / rebound;
              b.vz *= speedLimit / rebound;
            }
            b.omega *= 0.985;
            b.e -= Math.min(2, radial * 0.08);
            b.durability -= Math.min(5, radial * 0.16);
            burst(nx * (wallR - 0.13), nz * (wallR - 0.13), "#d9fcff", 5);
            if (performance.now() - lastWallSound > 150) {
              lastWallSound = performance.now();
              sfx("wall");
              shockwave(
                nx * (wallR - 0.1),
                nz * (wallR - 0.1),
                "#8bf4ff",
                Math.min(1.5, radial / 18),
              );
              burst(nx * (wallR - 0.13), nz * (wallR - 0.13), "#d9fcff", 12);
            }
          }
        }
        if ((b.e < 38 || b.durability < 42) && !b.cracked) {
          b.cracked = true;
          sfx("crack");
          burst(b.x, b.z, b.p ? "#5ceaff" : "#ff65a8", 13);
          for (let i = 0; i < 4; i++) {
            let a = Math.random() * 6.28;
            fragments.push({
              x: b.x,
              y: 0.55,
              z: b.z,
              vx: Math.cos(a) * 2.2,
              vy: 2 + Math.random() * 2,
              vz: Math.sin(a) * 2.2,
              rx: 0,
              rz: 0,
              l: 0.7,
              c: b.p ? [0.12, 0.8, 1] : [1, 0.12, 0.4],
            });
          }
        }
        if (b.e <= 0 || b.durability <= 0) {
          sfx("break");
          shatter(b);
          b.alive = false;
        }
      }
      for (let i = 0; i < tops.length; i++)
        for (let k = i + 1; k < tops.length; k++) {
          let p = tops[i],
            e = tops[k];
          if (!p.alive || !e.alive || !p.launched || !e.launched || p.flying || e.flying) continue;
          let dx = e.x - p.x,
            dz = e.z - p.z,
            d = Math.hypot(dx, dz);
          if (d >= 1.85 || d <= 0.01) continue;
          let nx = dx / d,
            nz = dz / d,
            rvx = e.vx - p.vx,
            rvz = e.vz - p.vz,
            vn = rvx * nx + rvz * nz,
            invP = 1 / p.mass,
            invE = 1 / e.mass,
            invSum = invP + invE;
          if (vn < 0) {
            let offense = (p.attack + e.attack) * 0.5,
              j = ((-(1 + 0.88) * vn) / invSum) * offense,
              tx = -nz,
              tz = nx,
              vt = rvx * tx + rvz * tz,
              jt = Math.max(-j * 0.34, Math.min(j * 0.34, -vt / invSum));
            p.vx -= nx * j * invP + tx * jt * invP;
            p.vz -= nz * j * invP + tz * jt * invP;
            e.vx += nx * j * invE + tx * jt * invE;
            e.vz += nz * j * invE + tz * jt * invE;
            p.omega -= jt * 0.42;
            e.omega += jt * 0.42;
            let wear = Math.min(32, j * 0.4 + Math.abs(jt) * 0.5);
            p.e -= Math.min(4.5, j * 0.075 + Math.abs(jt) * 0.15);
            e.e -= Math.min(4.5, j * 0.075 + Math.abs(jt) * 0.15);
            p.durability -=
              Math.min(28, (wear * e.attack) / Math.max(0.55, p.defense)) /
              armors[buildForSeat(p.seat).armor].mass;
            e.durability -=
              Math.min(28, (wear * p.attack) / Math.max(0.55, e.defense)) /
              armors[buildForSeat(e.seat).armor].mass;
            if (-vn > 2) {
              triggerGodBoost(p, -nx, -nz, -vn);
              triggerGodBoost(e, nx, nz, -vn);
            }
          }
          let correction = (Math.max(0, 1.85 - d - 0.015) * 0.72) / invSum;
          p.x -= nx * correction * invP;
          p.z -= nz * correction * invP;
          e.x += nx * correction * invE;
          e.z += nz * correction * invE;
          let impact = Math.max(0, -vn);
          if (impact > 3 && performance.now() - lastHitSound > 100) {
            lastHitSound = performance.now();
            sfx("hit", Math.min(1, impact / 20));
            shockwave((p.x + e.x) / 2, (p.z + e.z) / 2, "#fff0b0", Math.min(1.6, impact / 14));
            burst(
              (p.x + e.x) / 2,
              (p.z + e.z) / 2,
              "#fff0b0",
              Math.min(40, 18 + Math.floor(impact)),
            );
          }
          shake = Math.min(0.42, 0.1 + impact * 0.018);
          if (impact > 24 || Math.min(p.durability, e.durability) < 8) {
            let victim = p.e < e.e ? p : e;
            shatter(victim);
            victim.flying = true;
            victim.flyTime = 0;
            victim.vx += nx * (victim === e ? 1 : -1) * (4 + impact * 0.28);
            victim.vz += nz * (victim === e ? 1 : -1) * (4 + impact * 0.28);
            victim.vy = 5.5 + Math.min(3, impact * 0.08);
          }
        }
      let alive = tops.filter((t) => t.alive);
      if (tops.every((t) => t.launched || !t.alive) && alive.length <= 1)
        end(alive[0]?.seat === 0 ? "p" : "e");
    }
    for (let q of parts) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      q.vy -= 12 * dt;
      q.l -= dt;
    }
    parts = parts.filter((q) => q.l > 0);
    for (let q of shockwaves) q.age += dt;
    shockwaves = shockwaves.filter((q) => q.age < q.life);
    for (let q of fragments) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      q.vy -= 12 * dt;
      q.rx += dt * 8;
      q.rz += dt * 6;
      q.l -= dt;
    }
    fragments = fragments.filter((q) => q.l > 0);
    tops.forEach((b, i) => {
      let stamina = document.querySelector("#pm" + i),
        durability = document.querySelector("#pd" + i);
      if (stamina) stamina.style.width = Math.max(0, b.e) + "%";
      if (durability) durability.style.width = Math.max(0, b.durability) + "%";
    });
  }
  function bey(b) {
    let preview = b.p && document.querySelector("#custom").classList.contains("open");
    if ((!b.alive && !preview) || (!b.launched && !preview)) return;
    let x = preview ? -3.8 : b.x,
      y = preview ? 1.25 : b.flying ? b.y || 0.7 : 0.7,
      z = preview ? -2.4 : b.z,
      R = ry(preview ? performance.now() / 260 : b.a),
      T = tr(x, y, z),
      M = mul(T, mul(R, sc(preview ? 1.55 : 1, preview ? 1.55 : 1, preview ? 1.55 : 1))),
      config = preview ? currentBuild() : buildForSeat(b.seat),
      spec = blades[config.blade] || blades[0],
      color = spec.color,
      dark = spec.dark,
      driverSpec = drivers[config.driver] || drivers[0],
      armorSpec = armors[config.armor] || armors[0];
    if (!preview && b.trail) {
      let speed = Math.hypot(b.vx, b.vz),
        yaw = Math.atan2(b.vx, b.vz);
      for (let i = 0; i < b.trail.length; i++) {
        let t = (i + 1) / b.trail.length,
          q = b.trail[i];
        draw(
          cap,
          mul(tr(q[0], 0.72, q[1]), mul(ry(yaw), sc(0.04 + t * 0.038, 0.022, 0.13 + t * 0.19))),
          b.p ? [0.035, 0.25 * t, 0.32 * t] : [0.32 * t, 0.035, 0.12 * t],
        );
      }
    }
    draw(shadow, tr(x, preview ? 0.52 : 0.41, z), [0.012, 0.02, 0.035]);
    draw(spec.body, mul(M, tr(0, 0, 0)), dark);
    draw(spec.wing, mul(M, tr(0, 0.16, 0)), color);
    if (armorSpec) draw(armorSpec.mesh, mul(M, tr(0, 0.235, 0)), armorSpec.color);
    draw(core, mul(M, tr(0, 0.25, 0)), [0.72, 0.84, 0.9]);
    draw(cap, mul(M, tr(0, 0.36, 0)), b.p ? [0.65, 0.98, 1] : [1, 0.65, 0.78]);
    if (preview) {
      draw(cap, mul(M, tr(0.86, 0.23, 0)), [1, 0.96, 0.64]);
      draw(cap, mul(M, tr(-0.86, 0.23, 0)), [0.32, 0.98, 1]);
    }
    draw(
      driverSpec ? driverSpec.tip : tip,
      mul(T, mul(tr(0, -0.12, 0), sc(1, -1, 1))),
      driverSpec ? driverSpec.tint : [0.32, 0.38, 0.42],
    );
  }
  function updatePlayerTags() {
    let layer = document.querySelector("#playerTags");
    if (!layer) return;
    if (playerTagEls.length !== tops.length) {
      layer.innerHTML = "";
      playerTagEls = tops.map(() => {
        let el = document.createElement("div");
        el.className = "player-tag";
        layer.appendChild(el);
        return el;
      });
    }
    for (let i = 0; i < tops.length; i++) {
      let b = tops[i],
        el = playerTagEls[i],
        own = i === (netConnected ? onlineSide : 0);
      el.textContent = own && gameMode !== "online" ? "YOU" : playerLabel(i);
      el.classList.toggle("own", own);
      if ((state !== "fight" && state !== "countdown") || !b.launched || !b.alive) {
        el.style.display = "none";
        continue;
      }
      let px = b.x,
        py = (b.flying ? b.y || 0.7 : 0.7) + 1.25,
        pz = b.z,
        m = vp,
        cx = m[0] * px + m[4] * py + m[8] * pz + m[12],
        cy = m[1] * px + m[5] * py + m[9] * pz + m[13],
        cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
      if (cw <= 0) {
        el.style.display = "none";
        continue;
      }
      let nx = cx / cw,
        ny = cy / cw;
      if (nx < -1.1 || nx > 1.1 || ny < -1.15 || ny > 1.15) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.left = (nx + 1) * 0.5 * W + "px";
      el.style.top = (1 - ny) * 0.5 * H + "px";
    }
  }
  // Main animation loop: simulate, update labels, then draw the arena and tops.
  function frame(now) {
    let dt = Math.min(0.035, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    updatePlayerTags();
    let picker = document.querySelector("#battleStagePicker"),
      showPicker = netConnected && onlineSide === 0 && (state === "fight" || state === "countdown");
    if (picker) picker.style.display = showPicker ? "flex" : "none";
    if (shake > 0) {
      canvas.style.transform = `translate(${(Math.random() - 0.5) * shake * 12}px,${(Math.random() - 0.5) * shake * 12}px)`;
      shake = Math.max(0, shake - dt * 2.4);
    } else canvas.style.transform = "";
    if (netConnected && onlineSide === 0 && now - netLastSend > 33) {
      netLastSend = now;
      broadcast({
        type: "snapshot",
        state,
        players: tops.map(({ trail, ...b }) => b),
        builds: tops.map((_, i) => buildForSeat(i)),
        stage: selectedStage,
        playerNames,
        cpuSeats: [...cpuSeats],
        connected: [...connectedSeats],
        readyFlags,
      });
    }
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.018, 0.032, 0.052, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog);
    let arena = stages[selectedStage],
      arenaScale = sc(arena.scale, 1, arena.scale);
    draw(arenaBase, mul(arenaScale, tr(0, -0.12, 0)), arena.base);
    draw(wall, mul(arenaScale, tr(0, 0, 0)), arena.wall);
    draw(wallBase, mul(arenaScale, tr(0, 0, 0)), arena.wallBase);
    draw(wallTop, mul(arenaScale, tr(0, 0, 0)), arena.wallTop);
    for (let i = 0; i < 24; i++) {
      let a = (i * Math.PI) / 12;
      draw(
        post,
        tr(Math.cos(a) * 9.75 * arena.scale, 1.08, Math.sin(a) * 9.75 * arena.scale),
        arena.posts[i % 2],
      );
    }
    draw(floor, mul(arenaScale, tr(0, 0.12, 0)), arena.floor);
    draw(outer, mul(arenaScale, tr(0, 0.22, 0)), arena.outer);
    draw(r1, mul(arenaScale, tr(0, 0, 0)), arena.rings[0]);
    draw(r2, mul(arenaScale, tr(0, 0, 0)), arena.rings[1]);
    draw(r3, mul(arenaScale, tr(0, 0, 0)), arena.rings[2]);
    draw(hub, mul(arenaScale, tr(0, 0.2, 0)), arena.hub);
    for (let pad of arena.boostPads || [])
      draw(
        boostPad,
        mul(tr(pad.x, 0.25, pad.z), mul(ry(pad.a), sc(pad.l, 1, pad.w))),
        arena.padColor,
      );
    for (let bump of arena.bumpers || [])
      draw(bumperMesh, tr(bump.x, 0.45, bump.z), arena.bumperColor);
    for (let q of shockwaves) {
      let t = q.age / q.life,
        r = 0.18 + t * 2.2,
        fade = 1 - t;
      draw(
        shockRing,
        mul(tr(q.x, 0.38 + t * 0.08, q.z), sc(r * q.power, 1, r * q.power)),
        q.color === "#fff0b0"
          ? [fade, fade * 0.72, fade * 0.28]
          : q.color === "#ffd34e"
            ? [fade, fade * 0.58, fade * 0.12]
            : [fade * 0.22, fade * 0.78, fade],
      );
    }
    tops.forEach(bey);
    for (let q of parts) {
      draw(
        cap,
        mul(tr(q.x, q.y, q.z), sc(q.scale, q.scale, q.scale)),
        q.c === "#5ceaff"
          ? [0.2, 0.9, 1]
          : q.c === "#d9fcff"
            ? [0.8, 1, 1]
            : q.c === "#ffd34e"
              ? [1, 0.72, 0.12]
              : [1, 0.25, 0.55],
      );
    }
    for (let q of fragments) {
      let m = mul(tr(q.x, q.y, q.z), mul(ry(q.rx), sc(0.22, 0.1, 0.38)));
      draw(wing, m, q.c);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
