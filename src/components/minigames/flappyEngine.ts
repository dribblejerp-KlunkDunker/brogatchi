import type { PetType } from '../../store';
import { drawPixelPet, type GameInputState, type MiniGameCallbacks, type Particle, type FloatingText } from './types';

interface Pipe {
  x: number;
  gapY: number;
  gapHeight: number;
  passed: boolean;
}

export class FlappyEngine {
  private pet: PetType;
  private callbacks: MiniGameCallbacks;

  public score: number = 0;
  public lives: number = 3;
  public gameOver: boolean = false;

  private y: number = 280;
  private vy: number = 0;
  private rotation: number = 0;
  private invulnerableTimer: number = 0;
  private pipes: Pipe[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private bgOffsetFar: number = 0;
  private bgOffsetNear: number = 0;
  private spawnTimer: number = 0;
  private tickCount: number = 0;
  private lastJumpInput: boolean = false;

  private readonly GRAVITY = 0.38;
  private readonly JUMP_FORCE = -7.2;
  private readonly PIPE_SPEED = 2.4;
  private readonly PIPE_SPAWN_INTERVAL = 110; // frames
  private readonly PIPE_GAP = 150;
  private readonly VIRTUAL_WIDTH = 400;
  private readonly VIRTUAL_HEIGHT = 600;

  constructor(pet: PetType, callbacks: MiniGameCallbacks) {
    this.pet = pet;
    this.callbacks = callbacks;
    this.reset();
  }

  public reset() {
    this.score = 0;
    this.lives = 3;
    this.gameOver = false;
    this.y = 280;
    this.vy = 0;
    this.rotation = 0;
    this.invulnerableTimer = 0;
    this.pipes = [];
    this.particles = [];
    this.floatingTexts = [];
    this.spawnTimer = 40; // start spawning soon
    this.tickCount = 0;
    this.lastJumpInput = false;

    this.callbacks.onScoreUpdate(this.score);
    this.callbacks.onLivesUpdate(this.lives);
  }

  public handleInput(input: GameInputState) {
    if (this.gameOver) return;

    // Detect fresh jump press
    const jumpPressed = (input.up || input.action) && !this.lastJumpInput;
    this.lastJumpInput = input.up || input.action;

    if (jumpPressed) {
      this.vy = this.JUMP_FORCE;
      this.callbacks.onSound('jump');

      // Flap exhaust particles
      for (let i = 0; i < 4; i++) {
        this.particles.push({
          x: 90,
          y: this.y + 16,
          vx: -2 - Math.random() * 3,
          vy: (Math.random() - 0.5) * 2,
          life: 1,
          maxLife: 1,
          color: '#e2e8f0',
          size: 3 + Math.random() * 3,
          type: 'feather',
        });
      }
    }
  }

  public update(dt: number) {
    if (this.gameOver) return;

    this.tickCount++;

    // Sub-frame fixed steps (60Hz normalized)
    const steps = Math.max(1, Math.min(3, Math.round(dt * 60)));

    for (let step = 0; step < steps; step++) {
      this.stepPhysics();
    }
  }

  private stepPhysics() {
    // Gravity & position
    this.vy += this.GRAVITY;
    this.vy = Math.min(this.vy, 9.5); // Terminal velocity
    this.y += this.vy;

    // Rotation interpolation
    const targetRotation = Math.min(Math.max((this.vy / 9) * 1.1, -0.55), 1.1);
    this.rotation += (targetRotation - this.rotation) * 0.18;

    // Invulnerability ticker
    if (this.invulnerableTimer > 0) this.invulnerableTimer--;

    // Parallax background shifts
    this.bgOffsetFar = (this.bgOffsetFar - 0.4) % 400;
    this.bgOffsetNear = (this.bgOffsetNear - 1.0) % 400;

    // Pipe Spawning
    this.spawnTimer++;
    if (this.spawnTimer >= this.PIPE_SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      const minGapY = 90;
      const maxGapY = this.VIRTUAL_HEIGHT - this.PIPE_GAP - 90;
      const gapY = minGapY + Math.random() * (maxGapY - minGapY);

      this.pipes.push({
        x: this.VIRTUAL_WIDTH + 10,
        gapY,
        gapHeight: this.PIPE_GAP,
        passed: false,
      });
    }

    // Update Pipes & Collisions
    const playerRadius = 14;
    const playerCenterX = 100;
    const playerCenterY = this.y + 16;

    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const p = this.pipes[i];
      p.x -= this.PIPE_SPEED;

      const pipeWidth = 56;
      const topPipeBottom = p.gapY;
      const bottomPipeTop = p.gapY + p.gapHeight;

      // Passing check
      if (!p.passed && p.x + pipeWidth < playerCenterX) {
        p.passed = true;
        this.score++;
        this.callbacks.onScoreUpdate(this.score);
        this.callbacks.onSound('coin');

        this.floatingTexts.push({
          x: playerCenterX,
          y: playerCenterY - 20,
          text: `+1`,
          color: '#facc15',
          life: 1,
          maxLife: 1,
          vy: -1.2,
          fontSize: 16,
        });

        // Sparkles
        for (let s = 0; s < 6; s++) {
          this.particles.push({
            x: playerCenterX,
            y: playerCenterY,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1,
            maxLife: 1,
            color: '#fef08a',
            size: 3,
            type: 'star',
          });
        }
      }

      // Collision detection with top and bottom pipes
      if (this.invulnerableTimer === 0) {
        // Horizontal overlap
        const inPipeX = playerCenterX + playerRadius > p.x && playerCenterX - playerRadius < p.x + pipeWidth;

        if (inPipeX) {
          const hitTopPipe = playerCenterY - playerRadius < topPipeBottom;
          const hitBottomPipe = playerCenterY + playerRadius > bottomPipeTop;

          if (hitTopPipe || hitBottomPipe) {
            this.handlePlayerHit();
            if (this.gameOver) return;
          }
        }
      }

      // Remove off-screen pipes
      if (p.x < -pipeWidth) {
        this.pipes.splice(i, 1);
      }
    }

    // Floor & Ceiling boundaries
    if (this.y > this.VIRTUAL_HEIGHT - 38) {
      this.handlePlayerHit(true);
    } else if (this.y < -10) {
      this.y = -10;
      this.vy = 0;
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life -= 0.03;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // Update Floating Text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= 0.025;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private handlePlayerHit(floorInstant: boolean = false) {
    this.callbacks.onSound('hit');
    this.lives--;
    this.callbacks.onLivesUpdate(this.lives);

    // Poof particles
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: 100,
        y: this.y + 16,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1,
        maxLife: 1,
        color: '#ef4444',
        size: 4,
        type: 'smoke',
      });
    }

    if (this.lives <= 0 || floorInstant) {
      this.gameOver = true;
      const coinReward = Math.max(5, this.score * 2);
      this.callbacks.onGameOver(this.score, coinReward);
    } else {
      this.invulnerableTimer = 75; // 1.25s of i-frames
      this.vy = -4.5; // Little bounce
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // 1. Sky Gradient (Retro Twilight)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.VIRTUAL_HEIGHT);
    skyGrad.addColorStop(0, '#020617'); // Dark Space Top
    skyGrad.addColorStop(0.5, '#0f172a');
    skyGrad.addColorStop(0.85, '#1e1b4b'); // Twilight Indigo
    skyGrad.addColorStop(1, '#312e81');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);

    // 2. Stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let s = 0; s < 25; s++) {
      const sx = (s * 37 + this.bgOffsetFar * 0.3 + 800) % this.VIRTUAL_WIDTH;
      const sy = (s * 23) % (this.VIRTUAL_HEIGHT * 0.6);
      const twinkle = (this.tickCount + s * 10) % 30 < 15 ? 1.5 : 2.5;
      ctx.fillRect(sx, sy, twinkle, twinkle);
    }

    // 3. Moon
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(330, 80, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(322, 75, 20, 0, Math.PI * 2);
    ctx.fill();

    // 4. Distant City Silhouettes (Parallax Far)
    ctx.fillStyle = '#090d16';
    for (let b = 0; b < 6; b++) {
      const bx = (this.bgOffsetFar + b * 110 + 600) % (this.VIRTUAL_WIDTH + 110) - 110;
      const bh = 140 + (b % 3) * 50;
      ctx.fillRect(bx, this.VIRTUAL_HEIGHT - bh, 90, bh);
    }

    // 5. Near City Silhouettes (Parallax Near)
    ctx.fillStyle = '#111827';
    for (let b = 0; b < 5; b++) {
      const bx = (this.bgOffsetNear + b * 130 + 800) % (this.VIRTUAL_WIDTH + 130) - 130;
      const bh = 90 + (b % 4) * 40;
      ctx.fillRect(bx, this.VIRTUAL_HEIGHT - bh, 110, bh);

      // Cyber Windows
      ctx.fillStyle = '#38bdf8';
      for (let wy = this.VIRTUAL_HEIGHT - bh + 15; wy < this.VIRTUAL_HEIGHT - 20; wy += 22) {
        if ((b + wy) % 3 === 0) {
          ctx.fillRect(bx + 15, wy, 8, 10);
          ctx.fillRect(bx + 35, wy, 8, 10);
        }
      }
      ctx.fillStyle = '#111827';
    }

    // 6. Pipes (Retro 3D Shader look)
    const pipeWidth = 56;
    const rimHeight = 22;

    this.pipes.forEach((p) => {
      // Top Pipe
      this.drawPipeSegment(ctx, p.x, 0, pipeWidth, p.gapY, true, rimHeight);

      // Bottom Pipe
      const bottomY = p.gapY + p.gapHeight;
      const bottomH = this.VIRTUAL_HEIGHT - bottomY;
      this.drawPipeSegment(ctx, p.x, bottomY, pipeWidth, bottomH, false, rimHeight);
    });

    // 7. Ground
    ctx.fillStyle = '#15803d';
    ctx.fillRect(0, this.VIRTUAL_HEIGHT - 28, this.VIRTUAL_WIDTH, 28);
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, this.VIRTUAL_HEIGHT - 28, this.VIRTUAL_WIDTH, 6);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(0, this.VIRTUAL_HEIGHT - 28, this.VIRTUAL_WIDTH, 2);

    // 8. Particles
    this.particles.forEach((pt) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      ctx.restore();
    });

    // 9. Player (Bro'gatchi Pet with dynamic rotation)
    ctx.save();
    ctx.translate(100, this.y + 16);
    ctx.rotate(this.rotation);
    ctx.translate(-16, -16);

    const isInvuln = this.invulnerableTimer > 0;
    drawPixelPet(ctx, this.pet, 0, 0, 32, 32, true, this.tickCount, isInvuln);

    ctx.restore();

    // 10. Floating Text Popups
    this.floatingTexts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = `bold ${ft.fontSize || 16}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#000';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    ctx.restore();
  }

  private drawPipeSegment(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isTop: boolean,
    rimH: number
  ) {
    if (h <= 0) return;

    // Body
    ctx.fillStyle = '#15803d'; // Base Green
    ctx.fillRect(x, y, w, h);

    // Left Highlight
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(x + 5, y, 10, h);

    // Right Shadow
    ctx.fillStyle = '#14532d';
    ctx.fillRect(x + w - 12, y, 10, h);

    // Border
    ctx.strokeStyle = '#052e16';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Rim Cap
    const rimY = isTop ? y + h - rimH : y;
    const rimX = x - 4;
    const rimW = w + 8;

    ctx.fillStyle = '#16a34a';
    ctx.fillRect(rimX, rimY, rimW, rimH);
    ctx.fillStyle = '#86efac';
    ctx.fillRect(rimX + 6, rimY, 12, rimH);
    ctx.fillStyle = '#14532d';
    ctx.fillRect(rimX + rimW - 14, rimY, 12, rimH);
    ctx.strokeRect(rimX, rimY, rimW, rimH);
  }
}
