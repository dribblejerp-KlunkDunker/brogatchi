import type { PetType } from '../../store';

export type MiniGameType = 'flappy' | 'breaker' | 'mario' | 'rpg';

export interface GameInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean; // Primary button (Jump, Flap, Serve, Limit)
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: 'spark' | 'smoke' | 'coin' | 'star' | 'feather' | 'dust';
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
  fontSize?: number;
  isCrit?: boolean;
}

export interface MiniGameCallbacks {
  onScoreUpdate: (score: number) => void;
  onLivesUpdate: (lives: number) => void;
  onGameOver: (finalScore: number, coinReward: number) => void;
  onSound: (sound: 'beep' | 'coin' | 'hit' | 'jump' | 'levelup' | 'eat' | 'laser' | 'explosion' | 'powerup' | 'slash' | 'stomp') => void;
}

/**
 * Draw any of the 7 Bro'gatchi companion pets on Canvas with retro pixel styling.
 */
export function drawPixelPet(
  ctx: CanvasRenderingContext2D,
  pet: PetType,
  x: number,
  y: number,
  w: number,
  h: number,
  facingRight: boolean = true,
  animTick: number = 0,
  invulnerable: boolean = false
) {
  if (invulnerable && Math.floor(animTick / 4) % 2 === 0) return;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (!facingRight) ctx.scale(-1, 1);
  ctx.translate(-w / 2, -h / 2);

  const bob = Math.sin(animTick * 0.2) * 2;

  switch (pet) {
    case 'cyber_dog': {
      // Metallic body
      ctx.fillStyle = '#64748b';
      ctx.fillRect(4, 10 + bob, w - 8, h - 14);
      // Cyber ear
      ctx.fillStyle = '#334155';
      ctx.fillRect(2, 4 + bob, 6, 8);
      ctx.fillRect(w - 10, 4 + bob, 6, 8);
      // Visor
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(w / 2, 8 + bob, w / 2 - 4, 5);
      // Neon collar
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(6, 16 + bob, w - 12, 3);
      // Antenna
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(w / 2 - 1, 0 + bob, 2, 6);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(w / 2, 0 + bob, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Legs
      ctx.fillStyle = '#475569';
      ctx.fillRect(6, h - 5, 4, 5);
      ctx.fillRect(w - 10, h - 5, 4, 5);
      break;
    }

    case 'neko_cat': {
      // Ginger body
      ctx.fillStyle = '#f97316';
      ctx.fillRect(4, 10 + bob, w - 8, h - 14);
      // Ears
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.moveTo(4, 10 + bob);
      ctx.lineTo(8, 2 + bob);
      ctx.lineTo(12, 10 + bob);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w - 12, 10 + bob);
      ctx.lineTo(w - 8, 2 + bob);
      ctx.lineTo(w - 4, 10 + bob);
      ctx.fill();
      // Big anime eyes
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(w / 2, 10 + bob, 4, 5);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(w / 2 + 1, 11 + bob, 2, 3);
      // Bell collar
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(6, 17 + bob, w - 12, 2);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(w / 2, 19 + bob, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Paws
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(6, h - 4, 4, 4);
      ctx.fillRect(w - 10, h - 4, 4, 4);
      break;
    }

    case 'pixel_dragon': {
      // Emerald scales
      ctx.fillStyle = '#10b981';
      ctx.fillRect(4, 8 + bob, w - 8, h - 12);
      // Horns
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(6, 2 + bob, 3, 7);
      ctx.fillRect(w - 10, 2 + bob, 3, 7);
      // Wings
      const wingFlap = Math.sin(animTick * 0.3) * 4;
      ctx.fillStyle = '#047857';
      ctx.beginPath();
      ctx.moveTo(2, 12 + bob);
      ctx.lineTo(-4, 4 + bob + wingFlap);
      ctx.lineTo(4, 8 + bob);
      ctx.fill();
      // Amber eye
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(w / 2 + 2, 10 + bob, 5, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(w / 2 + 4, 11 + bob, 2, 2);
      // Flame spark breath
      if (Math.floor(animTick / 6) % 3 === 0) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(w, 13 + bob, 4, 3);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(w + 3, 14 + bob, 2, 2);
      }
      break;
    }

    case 'tactical_frog': {
      // Camo green skin
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(3, 10 + bob, w - 6, h - 14);
      // Big frog eyes
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(8, 8 + bob, 5, 0, Math.PI * 2);
      ctx.arc(w - 8, 8 + bob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillRect(7, 7 + bob, 3, 3);
      ctx.fillRect(w - 9, 7 + bob, 3, 3);
      // Red tactical bandana
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(2, 12 + bob, w - 4, 3);
      // Bandana tails
      ctx.fillRect(-2, 14 + bob, 4, 6);
      // Webbed feet
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(2, h - 4, 6, 4);
      ctx.fillRect(w - 8, h - 4, 6, 4);
      break;
    }

    case 'alien_xeno': {
      // Purple ethereal body
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(5, 10 + bob, w - 10, h - 14);
      // Large alien head
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.ellipse(w / 2, 10 + bob, w / 2 - 2, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Glossy black almond eyes
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.ellipse(w / 2 - 4, 9 + bob, 3, 5, -0.3, 0, Math.PI * 2);
      ctx.ellipse(w / 2 + 4, 9 + bob, 3, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Floating tachyon halo
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(w / 2, 0 + bob, 8, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'spooky_ghost': {
      // Translucent ghost body
      ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
      ctx.beginPath();
      ctx.arc(w / 2, 10 + bob, w / 2 - 3, Math.PI, 0, false);
      ctx.lineTo(w - 3, h - 4 + bob);
      // Wavy tail
      ctx.lineTo(w - 8, h - 8 + bob);
      ctx.lineTo(w / 2, h - 4 + bob);
      ctx.lineTo(6, h - 8 + bob);
      ctx.lineTo(3, h - 4 + bob);
      ctx.closePath();
      ctx.fill();
      // Ethereal eyes
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(w / 2 - 5, 8 + bob, 3, 4);
      ctx.fillRect(w / 2 + 2, 8 + bob, 3, 4);
      // Blush
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(w / 2 - 7, 13 + bob, 2, 2);
      ctx.fillRect(w / 2 + 5, 13 + bob, 2, 2);
      break;
    }

    case 'ryan':
    default: {
      // Classic Ryan: Blue hoodie, yellow face, sunglasses, beard
      // Body
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(4, 12 + bob, w - 8, h - 18);
      // Face
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(6, 2 + bob, w - 12, 11);
      // Beard
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(6, 9 + bob, w - 12, 4);
      // Cool gamer sunglasses
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(8, 4 + bob, w - 14, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(10, 5 + bob, 2, 1);
      // Legs / shoes
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, h - 6, 5, 6);
      ctx.fillRect(w - 11, h - 6, 5, 6);
      break;
    }
  }

  ctx.restore();
}
