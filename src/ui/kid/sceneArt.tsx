import type { SceneId } from '../../content/scenes';

/**
 * The scenes of "Find it in the picture", drawn to fill whatever box they get: the farm and the
 * doll's house look right on a phone held upright or sideways, and each spot (the pond, the barn
 * door, the kitchen counter) moves with its drawing. Things stand in the spots at `thingSize`.
 */

interface Point {
  x: number;
  y: number;
}

export interface SpotPlace extends Point {
  size: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- Farm ----------

function farmGeometry(w: number, h: number) {
  const m = Math.min(w, h);
  const hz = h * 0.42;
  const below = h - hz;
  const barn = { x: w * 0.03, w: m * 0.36 };
  const barnTop = hz + h * 0.06 - barn.w;
  const tree = { w: m * 0.34 };
  const treeX = w - w * 0.03 - tree.w;
  const treeTop = hz + h * 0.03 - tree.w * 1.15;
  const fenceTop = hz - h * 0.035;
  const pond = { cx: w * 0.74, cy: hz + below * 0.74, rx: Math.min(w * 0.22, m * 0.36), ry: below * 0.13 + m * 0.02 };
  return { m, hz, below, barn, barnTop, tree, treeX, treeTop, fenceTop, pond };
}

function farmSpots(w: number, h: number, base: number): Record<string, SpotPlace> {
  const g = farmGeometry(w, h);
  const s = (k: number) => base * k;
  const fenceX = g.barn.x + g.barn.w + (g.treeX - g.barn.x - g.barn.w) * 0.55;
  return {
    sky1: { x: w * 0.3, y: h * 0.15, size: s(0.75) },
    sky2: { x: w * 0.58, y: h * 0.09 + s(0.2), size: s(0.75) },
    tree: { x: g.treeX + g.tree.w * 0.5, y: g.treeTop + g.tree.w * 0.4, size: s(0.75) },
    barn: { x: g.barn.x + g.barn.w * 0.5, y: g.barnTop + g.barn.w * 0.79, size: s(0.95) },
    fence: { x: fenceX, y: g.fenceTop - s(0.8) * 0.42, size: s(0.8) },
    field1: { x: w * 0.3, y: g.hz + g.below * 0.32, size: s(1) },
    field2: { x: w * 0.62, y: g.hz + g.below * 0.27, size: s(1) },
    near1: { x: w * 0.2, y: g.hz + g.below * 0.74, size: s(1) },
    near2: { x: w * 0.47, y: g.hz + g.below * 0.68, size: s(1) },
    pond: { x: g.pond.cx, y: g.pond.cy - g.pond.ry * 0.25, size: s(0.9) },
  };
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g fill="#fff" opacity="0.95">
      <ellipse cx={x} cy={y} rx={s * 1.1} ry={s * 0.42} />
      <ellipse cx={x + s * 0.35} cy={y - s * 0.28} rx={s * 0.6} ry={s * 0.45} />
      <ellipse cx={x - s * 0.4} cy={y - s * 0.15} rx={s * 0.45} ry={s * 0.35} />
    </g>
  );
}

function Flower({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={x + Math.cos((a * Math.PI) / 180) * r} cy={y + Math.sin((a * Math.PI) / 180) * r} r={r * 0.7} fill={color} />
      ))}
      <circle cx={x} cy={y} r={r * 0.6} fill="#ffd23f" />
    </g>
  );
}

function FarmArt({ w, h }: { w: number; h: number }) {
  const g = farmGeometry(w, h);
  const { m, hz } = g;
  const bs = g.barn.w / 100;
  const ts = g.tree.w / 100;
  const posts: number[] = [];
  for (let x = g.barn.x + g.barn.w + w * 0.02; x < w; x += Math.max(26, w * 0.07)) posts.push(x);
  return (
    <svg className="scene-art" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id="farm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd3ff" />
          <stop offset="1" stopColor="#dff3ff" />
        </linearGradient>
        <linearGradient id="farm-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a3dd70" />
          <stop offset="1" stopColor="#6dbd4b" />
        </linearGradient>
        <linearGradient id="farm-pond" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86cff5" />
          <stop offset="1" stopColor="#3f9fd8" />
        </linearGradient>
        <radialGradient id="farm-sun">
          <stop offset="0.5" stopColor="#ffd84d" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd84d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={w} height={hz + h * 0.05} fill="url(#farm-sky)" />
      <circle cx={w - m * 0.13} cy={m * 0.13} r={m * 0.14} fill="url(#farm-sun)" />
      <circle cx={w - m * 0.13} cy={m * 0.13} r={m * 0.075} fill="#ffd23f" />
      <Cloud x={w * 0.16} y={h * 0.09 + m * 0.03} s={m * 0.11} />
      <Cloud x={w * 0.5} y={h * 0.21} s={m * 0.085} />
      <path
        d={`M0 ${hz - h * 0.03} C ${w * 0.2} ${hz - h * 0.1}, ${w * 0.4} ${hz - h * 0.09}, ${w * 0.55} ${hz - h * 0.05} S ${w * 0.85} ${hz - h * 0.1}, ${w} ${hz - h * 0.07} L ${w} ${hz + h * 0.05} L 0 ${hz + h * 0.05} Z`}
        fill="#b2e08a"
      />
      <path
        d={`M0 ${hz + h * 0.01} C ${w * 0.3} ${hz - h * 0.02}, ${w * 0.6} ${hz + h * 0.02}, ${w} ${hz - h * 0.01} L ${w} ${h} L 0 ${h} Z`}
        fill="url(#farm-field)"
      />

      {/* Fence behind the animals, from the barn to the edge. */}
      <g>
        <rect x={g.barn.x + g.barn.w} y={hz - h * 0.005} width={w} height={Math.max(4, h * 0.012)} fill="#e9d2a8" />
        <rect x={g.barn.x + g.barn.w} y={hz + h * 0.025} width={w} height={Math.max(4, h * 0.012)} fill="#e9d2a8" />
        {posts.map((x) => (
          <rect key={x} x={x} y={g.fenceTop} width={Math.max(6, m * 0.022)} height={h * 0.095} rx="2" fill="#f4e2c0" stroke="#c49a63" strokeWidth="1.5" />
        ))}
      </g>

      {/* Tree */}
      <g transform={`translate(${g.treeX} ${g.treeTop}) scale(${ts})`}>
        <rect x="43" y="58" width="14" height="57" rx="4" fill="#8a5a33" />
        <circle cx="24" cy="52" r="24" fill="#54a33f" />
        <circle cx="76" cy="52" r="24" fill="#54a33f" />
        <circle cx="50" cy="40" r="38" fill="#5cad45" />
        <circle cx="38" cy="28" r="12" fill="#6fc456" opacity="0.7" />
      </g>

      {/* Barn, its door open for an animal to stand in */}
      <g transform={`translate(${g.barn.x} ${g.barnTop}) scale(${bs})`}>
        <rect x="2" y="30" width="96" height="70" fill="#d9443a" />
        {[18, 34, 66, 82].map((x) => (
          <rect key={x} x={x} y="30" width="1.5" height="70" fill="#c23a31" />
        ))}
        <path d="M-5 35 L50 2 L105 35 Z" fill="#9f2a23" />
        <path d="M-5 35 L50 2 L105 35" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
        <rect x="38" y="38" width="24" height="17" fill="#fff1c9" stroke="#fff" strokeWidth="2.5" />
        <rect x="40" y="47" width="20" height="7" fill="#e8c35a" />
        <rect x="24" y="57" width="52" height="43" fill="#5b1814" stroke="#fff" strokeWidth="3" />
      </g>

      {/* Path from the barn door */}
      <path
        d={`M${g.barn.x + g.barn.w * 0.28} ${g.barnTop + g.barn.w} L${g.barn.x + g.barn.w * 0.72} ${g.barnTop + g.barn.w} C ${w * 0.3} ${hz + g.below * 0.45}, ${w * 0.24} ${hz + g.below * 0.7}, ${w * 0.3} ${h} L 0 ${h} L 0 ${hz + g.below * 0.6} Z`}
        fill="#ead6a6"
        opacity="0.85"
      />

      {/* Pond with reeds */}
      <ellipse cx={g.pond.cx} cy={g.pond.cy} rx={g.pond.rx} ry={g.pond.ry} fill="url(#farm-pond)" />
      <ellipse cx={g.pond.cx - g.pond.rx * 0.3} cy={g.pond.cy - g.pond.ry * 0.35} rx={g.pond.rx * 0.35} ry={g.pond.ry * 0.18} fill="#fff" opacity="0.35" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${g.pond.cx - g.pond.rx * (0.95 - i * 0.07)} ${g.pond.cy + g.pond.ry * 0.2} q ${-m * 0.01} ${-m * 0.06} ${m * 0.005} ${-m * (0.1 - i * 0.015)}`}
          stroke="#4f8f36"
          strokeWidth={Math.max(2, m * 0.008)}
          fill="none"
          strokeLinecap="round"
        />
      ))}

      <Flower x={w * 0.08} y={hz + g.below * 0.25} r={m * 0.012} color="#ff8fb1" />
      <Flower x={w * 0.45} y={hz + g.below * 0.45} r={m * 0.01} color="#fff" />
      <Flower x={w * 0.92} y={hz + g.below * 0.3} r={m * 0.012} color="#c7a6ff" />
      <Flower x={w * 0.58} y={h - g.below * 0.06} r={m * 0.013} color="#ff8fb1" />
      <Flower x={w * 0.12} y={h - g.below * 0.05} r={m * 0.011} color="#fff" />
    </svg>
  );
}

// ---------- House ----------

interface Room {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function houseGeometry(w: number, h: number) {
  const m = Math.min(w, h);
  const t = Math.max(4, m * 0.014);
  const left = w * 0.04;
  const right = w * 0.96;
  const top = h * 0.2;
  const mid = h * 0.58;
  const bottom = h * 0.965;
  const cx = w * 0.5;
  const rooms: Record<'bedroom' | 'bathroom' | 'kitchen' | 'living', Room> = {
    bedroom: { x0: left + t, x1: cx - t / 2, y0: top + t, y1: mid - t / 2 },
    bathroom: { x0: cx + t / 2, x1: right - t, y0: top + t, y1: mid - t / 2 },
    kitchen: { x0: left + t, x1: cx - t / 2, y0: mid + t / 2, y1: bottom - t },
    living: { x0: cx + t / 2, x1: right - t, y0: mid + t / 2, y1: bottom - t },
  };
  return { m, t, left, right, top, mid, bottom, cx, rooms };
}

const rw = (r: Room) => r.x1 - r.x0;
const rh = (r: Room) => r.y1 - r.y0;

function houseSpots(w: number, h: number, base: number): Record<string, SpotPlace> {
  const g = houseGeometry(w, h);
  // Two things side by side in a room, and short enough for a room on a phone held sideways.
  const room = g.rooms.bedroom;
  const s0 = Math.max(base * 0.8, Math.min(rw(room) * 0.45, rh(room) * 0.62, 150));
  const stand = (r: Room, fx: number, size: number): SpotPlace => ({
    x: r.x0 + rw(r) * fx,
    y: r.y1 - rh(r) * 0.08 - size / 2 + size * 0.06,
    size,
  });
  const wall = (r: Room, fx: number, fy: number, size: number): SpotPlace => ({ x: r.x0 + rw(r) * fx, y: r.y0 + rh(r) * fy, size });
  const counterTop = (r: Room) => r.y0 + rh(r) * 0.62;
  const k = g.rooms.kitchen;
  const counter = s0 * 0.85;
  return {
    bed1: stand(g.rooms.bedroom, 0.26, s0 * 1.15),
    bed2: stand(g.rooms.bedroom, 0.76, s0),
    bath1: stand(g.rooms.bathroom, 0.42, s0 * 1.15),
    bath2: wall(g.rooms.bathroom, 0.82, 0.36, s0 * 0.8),
    kit1: stand(k, 0.22, s0),
    kit2: { x: k.x0 + rw(k) * 0.72, y: counterTop(k) - counter / 2 + counter * 0.08, size: counter },
    liv1: stand(g.rooms.living, 0.3, s0),
    liv2: stand(g.rooms.living, 0.78, s0),
    liv3: wall(g.rooms.living, 0.55, 0.3, s0 * 0.75),
  };
}

function Window({ x, y, ww, wh, curtains }: { x: number; y: number; ww: number; wh: number; curtains?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={ww} height={wh} rx={ww * 0.06} fill="#bfe7ff" stroke="#fff" strokeWidth={Math.max(3, ww * 0.06)} />
      <line x1={x + ww / 2} y1={y} x2={x + ww / 2} y2={y + wh} stroke="#fff" strokeWidth={Math.max(2, ww * 0.04)} />
      <line x1={x} y1={y + wh / 2} x2={x + ww} y2={y + wh / 2} stroke="#fff" strokeWidth={Math.max(2, ww * 0.04)} />
      {curtains && (
        <>
          <path d={`M${x - ww * 0.08} ${y - wh * 0.06} h${ww * 0.3} q ${-ww * 0.12} ${wh * 0.6} 0 ${wh * 1.12} h${-ww * 0.3} Z`} fill={curtains} />
          <path d={`M${x + ww * 1.08} ${y - wh * 0.06} h${-ww * 0.3} q ${ww * 0.12} ${wh * 0.6} 0 ${wh * 1.12} h${ww * 0.3} Z`} fill={curtains} />
        </>
      )}
    </g>
  );
}

function Floor({ r, color, stripe }: { r: Room; color: string; stripe: string }) {
  const fh = rh(r) * 0.12;
  const boards = 6;
  return (
    <g>
      <rect x={r.x0} y={r.y1 - fh} width={rw(r)} height={fh} fill={color} />
      {Array.from({ length: boards - 1 }, (_, i) => (
        <rect key={i} x={r.x0 + (rw(r) / boards) * (i + 1)} y={r.y1 - fh} width="1.5" height={fh} fill={stripe} />
      ))}
    </g>
  );
}

function HouseArt({ w, h }: { w: number; h: number }) {
  const g = houseGeometry(w, h);
  const { m, rooms } = g;
  const b = rooms.bedroom;
  const ba = rooms.bathroom;
  const k = rooms.kitchen;
  const l = rooms.living;
  const tiles: number[] = [];
  for (let x = ba.x0 + rw(ba) / 8; x < ba.x1; x += rw(ba) / 8) tiles.push(x);
  const counterTop = k.y0 + rh(k) * 0.62;
  return (
    <svg className="scene-art" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id="house-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd3ff" />
          <stop offset="1" stopColor="#e6f6ff" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="url(#house-sky)" />
      <Cloud x={w * 0.12} y={h * 0.07} s={m * 0.07} />
      <Cloud x={w * 0.88} y={h * 0.1} s={m * 0.06} />
      <rect y={g.bottom - g.t} width={w} height={h - g.bottom + g.t} fill="#8ccf62" />

      {/* Chimney, roof and the attic window */}
      <rect x={w * 0.7} y={h * 0.05} width={w * 0.06} height={h * 0.12} fill="#b5523f" />
      <path d={`M${g.left - w * 0.025} ${g.top + g.t} L${g.cx} ${h * 0.025} L${g.right + w * 0.025} ${g.top + g.t} Z`} fill="#e0624f" />
      <path
        d={`M${g.left - w * 0.025} ${g.top + g.t} L${g.cx} ${h * 0.025} L${g.right + w * 0.025} ${g.top + g.t}`}
        fill="none"
        stroke="#b84a3a"
        strokeWidth={Math.max(3, m * 0.012)}
        strokeLinejoin="round"
      />
      <circle cx={g.cx} cy={h * 0.13} r={Math.min(m * 0.04, h * 0.045)} fill="#fff3c4" stroke="#fff" strokeWidth={Math.max(2, m * 0.008)} />

      {/* Walls */}
      <rect x={g.left} y={g.top} width={g.right - g.left} height={g.bottom - g.top} fill="#f0c58e" />

      {/* Bedroom: lilac, a window with curtains, a rug */}
      <rect x={b.x0} y={b.y0} width={rw(b)} height={rh(b)} fill="#efe2ff" />
      <Window x={b.x0 + rw(b) * 0.36} y={b.y0 + rh(b) * 0.12} ww={rw(b) * 0.28} wh={rh(b) * 0.28} curtains="#f6a6c8" />
      <Floor r={b} color="#dcab73" stripe="#c9965e" />
      <ellipse cx={b.x0 + rw(b) * 0.5} cy={b.y1 - rh(b) * 0.06} rx={rw(b) * 0.3} ry={rh(b) * 0.04} fill="#c9b2f0" />

      {/* Bathroom: tiles and a round mirror */}
      <rect x={ba.x0} y={ba.y0} width={rw(ba)} height={rh(ba)} fill="#dff2fb" />
      {tiles.map((x) => (
        <rect key={x} x={x} y={ba.y0} width="1" height={rh(ba)} fill="#c6e3f0" />
      ))}
      <ellipse
        cx={ba.x0 + rw(ba) * 0.3}
        cy={ba.y0 + rh(ba) * 0.3}
        rx={rw(ba) * 0.1}
        ry={rh(ba) * 0.14}
        fill="#e8f7ff"
        stroke="#9cc9de"
        strokeWidth={Math.max(2, m * 0.008)}
      />
      <Floor r={ba} color="#ffffff" stripe="#d7e6ee" />

      {/* Kitchen: a counter with cupboards under a window */}
      <rect x={k.x0} y={k.y0} width={rw(k)} height={rh(k)} fill="#fff3cf" />
      <Window x={k.x0 + rw(k) * 0.56} y={k.y0 + rh(k) * 0.12} ww={rw(k) * 0.3} wh={rh(k) * 0.26} />
      <rect x={k.x0 + rw(k) * 0.45} y={counterTop} width={rw(k) * 0.55} height={k.y1 - counterTop} fill="#e8c08f" />
      <rect x={k.x0 + rw(k) * 0.45} y={counterTop} width={rw(k) * 0.55} height={Math.max(4, rh(k) * 0.05)} fill="#b9835a" />
      {[0.58, 0.82].map((fx) => (
        <rect key={fx} x={k.x0 + rw(k) * fx} y={counterTop + rh(k) * 0.14} width={rw(k) * 0.08} height={Math.max(3, rh(k) * 0.025)} rx="2" fill="#b9835a" />
      ))}
      <Floor r={{ ...k, x1: k.x0 + rw(k) * 0.45 }} color="#ead7ae" stripe="#d9c08d" />

      {/* Living room: peach, a picture on the wall, a rug */}
      <rect x={l.x0} y={l.y0} width={rw(l)} height={rh(l)} fill="#ffe6d6" />
      <rect
        x={l.x0 + rw(l) * 0.1}
        y={l.y0 + rh(l) * 0.16}
        width={rw(l) * 0.2}
        height={rh(l) * 0.22}
        fill="#bfe7ff"
        stroke="#c98a5a"
        strokeWidth={Math.max(3, m * 0.01)}
      />
      <path
        d={`M${l.x0 + rw(l) * 0.1} ${l.y0 + rh(l) * 0.38} l${rw(l) * 0.07} ${-rh(l) * 0.1} l${rw(l) * 0.05} ${rh(l) * 0.06} l${rw(l) * 0.08} ${rh(l) * 0.04} Z`}
        fill="#7cc35a"
      />
      <Floor r={l} color="#dcab73" stripe="#c9965e" />
      <ellipse cx={l.x0 + rw(l) * 0.5} cy={l.y1 - rh(l) * 0.06} rx={rw(l) * 0.34} ry={rh(l) * 0.045} fill="#f2a88d" />
    </svg>
  );
}

/** The scene's drawing for a box of this size. */
export function SceneArt({ id, w, h }: { id: SceneId; w: number; h: number }) {
  return id === 'farm' ? <FarmArt w={w} h={h} /> : <HouseArt w={w} h={h} />;
}

/** The size of a thing in the scene: big enough for a small finger, small enough to leave room. */
export function thingSize(id: SceneId, w: number, h: number): number {
  const m = Math.min(w, h);
  return id === 'farm' ? clamp(m * 0.22, 56, 170) : clamp(m * 0.19, 52, 150);
}

/** Where each spot is, in this box. */
export function spotPlaces(id: SceneId, w: number, h: number): Record<string, SpotPlace> {
  const base = thingSize(id, w, h);
  return id === 'farm' ? farmSpots(w, h, base) : houseSpots(w, h, base);
}
