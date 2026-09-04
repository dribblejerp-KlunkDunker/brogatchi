// Renders Ryan's SVG from a ryanSpec. Pure DOM-free string building.

const OUTLINE = '#0f172a';
const PANTS = '#0f172a';
const SKIN = '#fcd34d';
const HAIR = '#1f2937';

function rect(x, y, w, h, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
}
function rrect(x, y, w, h, r, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" ${extra}/>`;
}

export function renderRyanSVG(spec) {
  const P = spec.physique;
  const O = spec.outfit;
  const M = spec.moodInfo;
  const S = P.scale;

  const parts = [];
  const cls = [];

  // ---------- geometry ----------
  const shirtW = Math.round(56 * S);
  const shirtX = 50 - shirtW / 2;
  const shirtH = 25;
  const armX1 = shirtX - P.armW - 2;
  const armX2 = shirtX + shirtW + 2;
  const bellyR = P.belly > 0 ? Math.round(shirtW * 0.45 * P.belly) : 0;

  // ---------- backpack (behind body) ----------
  if (O.backpack.id !== 'none') {
    const bx = shirtX + shirtW + 1;
    parts.push(rrect(bx, 72, 22, 34, 4, O.backpack.color, `stroke="${OUTLINE}" stroke-width="1.5"`));
    parts.push(rect(bx + 5, 84, 12, 6, '#00000066'));
  }

  // ---------- legs ----------
  const pantsColor = O.pants ? O.pants.color : PANTS;
  parts.push(rect(50 - P.legW - 11, 108, P.legW + 2, 10, pantsColor, `stroke="${OUTLINE}" stroke-width="1"`));
  parts.push(rect(50 + 9, 108, P.legW + 2, 10, pantsColor, `stroke="${OUTLINE}" stroke-width="1"`));
  // shoes
  const shoeColor = O.shoes ? O.shoes.color : '#334155';
  parts.push(rect(50 - P.legW - 13, 116, P.legW + 5, 4, shoeColor));
  parts.push(rect(50 + 8, 116, P.legW + 5, 4, shoeColor));

  // ---------- torso ----------
  parts.push(rect(shirtX, 85, shirtW, shirtH, O.shirt.color, `stroke="${OUTLINE}" stroke-width="2"`));
  // shirt highlight + logo
  parts.push(rect(shirtX + 2, 87, 3, shirtH - 4, '#ffffff33'));
  parts.push(`<text x="50" y="101" font-size="7" text-anchor="middle">${O.shirt.logo}</text>`);

  // belly bulge
  if (bellyR > 0) {
    const big = spec.tier >= 4 ? ' big' : '';
    parts.push(
      `<ellipse class="belly${big}" cx="50" cy="110" rx="${bellyR}" ry="${Math.round(bellyR * 0.62)}" fill="${O.shirt.color}" stroke="${OUTLINE}" stroke-width="1.5"/>`
    );
  }

  // ---------- arms ----------
  parts.push(rect(armX1, 85, P.armW, 20, O.shirt.color, `stroke="${OUTLINE}" stroke-width="1.5"`));
  parts.push(rect(armX2, 85, P.armW, 20, O.shirt.color, `stroke="${OUTLINE}" stroke-width="1.5"`));
  parts.push(rect(armX1 - 1, 103, P.armW + 3, 8, SKIN, `stroke="${OUTLINE}" stroke-width="1"`));
  parts.push(rect(armX2 - 2, 103, P.armW + 3, 8, SKIN, `stroke="${OUTLINE}" stroke-width="1"`));

  // ---------- wrist gear (over hands) ----------
  if (O.wrist && O.wrist.id !== 'none') {
    const w = O.wrist;
    parts.push(rect(armX1 - 2, 101, P.armW + 5, 5, w.color, `stroke="${OUTLINE}" stroke-width="1"`));
    parts.push(rect(armX2 - 3, 101, P.armW + 5, 5, w.color, `stroke="${OUTLINE}" stroke-width="1"`));
  }

  // ---------- backpack straps ----------
  if (O.backpack.id !== 'none') parts.push(rect(shirtX, 93, shirtW, 3, '#00000055'));

  // ---------- chain ----------
  if (O.chain.id !== 'none') {
    parts.push(`<path d="M ${shirtX + 6} 90 Q 50 112 ${shirtX + shirtW - 6} 90" fill="none" stroke="${O.chain.color}" stroke-width="2"/>`);
    parts.push(`<text x="50" y="114" font-size="9" text-anchor="middle">${O.chain.pendant}</text>`);
  }

  // ---------- face ----------
  const jawW = Math.round(60 * P.jaw);
  const faceX = 50 - jawW / 2;
  // hair
  parts.push(rect(faceX, 13, jawW, 13 + (P.jaw > 1 ? 2 : 0), HAIR, `stroke="${OUTLINE}" stroke-width="1.5"`));
  parts.push(rect(faceX - 4, 30, 8, 26, HAIR, `stroke="${OUTLINE}" stroke-width="1"`));
  parts.push(rect(faceX + jawW - 4, 30, 8, 26, HAIR, `stroke="${OUTLINE}" stroke-width="1"`));
  // face
  parts.push(rect(faceX, 20, jawW, 55, SKIN, `stroke="${OUTLINE}" stroke-width="2"`));

  // cheeks on chonk
  if (P.cheeks) {
    parts.push(`<circle cx="${faceX + 8}" cy="62" r="4" fill="#fb7185" opacity="0.6"/>`);
    parts.push(`<circle cx="${faceX + jawW - 8}" cy="62" r="4" fill="#fb7185" opacity="0.6"/>`);
  }

  // beard
  parts.push(rect(faceX, 60, jawW, 25, HAIR, `stroke="${OUTLINE}" stroke-width="1.5"`));

  // eyes
  const eyeY = 44;
  const lx = faceX + 12;
  const rxP = faceX + jawW - 24;
  const eyeW = 12;
  parts.push(drawEye(lx, eyeY, eyeW, M.eyes, 'left'));
  parts.push(drawEye(rxP, eyeY, eyeW, M.eyes, 'right'));

  // ---------- third eye (Crustafarianism) ----------
  // Sits mid-forehead: closed = faint seam, flickering = dim slit eye,
  // open = glowing amber eye with radial glow. Rendered before glasses so a
  // visor sits over it, like a headband would.
  const eyeStage = spec.thirdEye || 'closed';
  const thirdEyeCx = 50;
  const thirdEyeCy = 33;
  if (eyeStage === 'flickering') {
    parts.push(`<g class="third-eye flickering"><ellipse cx="${thirdEyeCx}" cy="${thirdEyeCy}" rx="5" ry="3" fill="#fbbf24" opacity="0.55" stroke="${OUTLINE}" stroke-width="1"/><rect x="${thirdEyeCx - 2}" y="${thirdEyeCy - 1.5}" width="4" height="3" fill="#78350f"/></g>`);
  } else if (eyeStage === 'open') {
    parts.push(`<g class="third-eye open"><circle cx="${thirdEyeCx}" cy="${thirdEyeCy}" r="9" fill="#fbbf24" opacity="0.25"/><ellipse cx="${thirdEyeCx}" cy="${thirdEyeCy}" rx="6" ry="4" fill="#fde047" stroke="${OUTLINE}" stroke-width="1.2"/><circle cx="${thirdEyeCx}" cy="${thirdEyeCy}" r="2" fill="#78350f"/><circle cx="${thirdEyeCx + 1.5}" cy="${thirdEyeCy - 1.5}" r="0.8" fill="#fff"/></g>`);
  } else {
    parts.push(`<g class="third-eye closed"><rect x="${thirdEyeCx - 4}" y="${thirdEyeCy - 1}" width="8" height="1.4" rx="0.7" fill="#d9a235" opacity="0.5"/></g>`);
  }

  // glasses (after eyes)
  if (O.glasses.frame) {
    const g = O.glasses;
    if (g.id === 'visor') {
      parts.push(rect(faceX - 2, eyeY - 4, jawW + 4, 14, g.lens, `stroke="${g.frame}" stroke-width="2" rx="4"`));
      parts.push(rect(faceX - 2, eyeY - 6, jawW + 4, 3, g.frame));
    } else {
      parts.push(rect(lx - 3, eyeY - 4, eyeW + 8, 13, g.lens, `stroke="${g.frame}" stroke-width="2" rx="3"`));
      parts.push(rect(rxP - 3, eyeY - 4, eyeW + 8, 13, g.lens, `stroke="${g.frame}" stroke-width="2" rx="3"`));
      parts.push(rect(faceX + 22, eyeY - 1, 16, 4, g.frame));
      if (g.id === 'aviator') {
        parts.push(rect(lx - 3, eyeY + 2, 16, 4, 'rgba(255,255,255,0.25)'));
        parts.push(rect(rxP - 3, eyeY + 2, 16, 4, 'rgba(255,255,255,0.25)'));
      }
    }
  }

  // mouth (on beard)
  parts.push(mouthSVG(M.mouth, faceX, jawW));

  // NOTE: injected as the inner markup of the existing #ryan-svg element so
  // CSS classes (anim-idle / sleeping / chewing) live on the svg itself.
  return parts.join('');
}

function baseLegY() {
  return 108;
}

function legY() {
  return baseLegY() + 2;
}

function drawEye(x, y, w, kind, side) {
  const inner = eyeInner(kind, w, side);
  return `<g class="eye ${side}-eye" transform="translate(${x}, ${y})">${inner}</g>`;
}

function eyeInner(kind, w, side) {
  const white = (w2, h2) => rect(0, 0, w2, h2, '#fff', `stroke="${OUTLINE}" stroke-width="1"`);
  switch (kind) {
    case 'squint': return white(12, 9) + rect(3, 2, 6, 5, '#000');
    case 'sleepy': return rect(1, 4, 10, 3, OUTLINE);
    case 'sad': return white(12, 10) + rect(2 + (side === 'right' ? 3 : 0), 5, 6, 4, '#000') + rect(0, 10, 12, 2, OUTLINE);
    case 'spiral': return white(12, 12) + rect(3, 5, 6, 2, '#000') + rect(5, 3, 2, 6, '#000');
    case 'flat': return white(12, 7) + rect(3, 1, 6, 4, '#000');
    default: return white(12, 12) + rect(4, 4, 6, 6, '#000');
  }
}

function mouthSVG(kind, fx, jawW) {
  const cx = fx + jawW / 2;
  const yBase = 68;
  const stroke = `stroke="${OUTLINE}" stroke-width="2" fill="none"`;
  switch (kind) {
    case 'smile': return `<path d="M ${cx - 7} ${yBase} Q ${cx} ${yBase + 7} ${cx + 7} ${yBase}" ${stroke}/>`;
    case 'big': return `<path d="M ${cx - 8} ${yBase - 1} Q ${cx} ${yBase + 9} ${cx + 8} ${yBase - 1}" ${stroke}/> <rect x="${cx - 8}" y="${yBase}" width="16" height="9" fill="#7c2d12" rx="2"/> <rect x="${cx - 6}" y="${yBase + 2}" width="3" height="7" fill="#fff"/> <rect x="${cx + 1}" y="${yBase + 2}" width="3" height="7" fill="#fff"/>`;
    case 'open': return rect(cx - 7, yBase - 1, 14, 8, '#7c2d12', `rx="3"`) + rect(cx - 5, yBase + 1, 3, 6, '#fff') + rect(cx, yBase + 1, 3, 6, '#fff');
    case 'flat': return rect(cx - 6, yBase, 12, 3, OUTLINE);
    case 'wobble': return `<path d="M ${cx - 7} ${yBase} q 3 4 7 0 q 3 -4 7 0" ${stroke}/>`;
    case 'frown': return `<path d="M ${cx - 7} ${yBase + 4} Q ${cx} ${yBase - 2} ${cx + 7} ${yBase + 4}" ${stroke}/>`;
    default: return rect(cx - 6, yBase - 1, 12, 3, OUTLINE);
  }
}
