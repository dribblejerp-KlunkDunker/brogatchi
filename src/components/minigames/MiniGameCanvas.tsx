import { useEffect, useRef, useState, useCallback } from 'react';
import type { PetType } from '../../store';
import type { MiniGameType, GameInputState } from './types';
import { FlappyEngine } from './flappyEngine';
import { BreakerEngine } from './breakerEngine';
import { PlatformerEngine } from './platformerEngine';
import { RPGEngine } from './rpgEngine';
import { audio } from '../../audio';

interface MiniGameCanvasProps {
  gameType: MiniGameType;
  pet: PetType;
  onClose: (earnedCoins: number) => void;
}

export function MiniGameCanvas({ gameType, pet, onClose }: MiniGameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverStats, setGameOverStats] = useState<{ finalScore: number; coinReward: number }>({
    finalScore: 0,
    coinReward: 0,
  });

  // Input states
  const inputRef = useRef<GameInputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
  });

  const engineRef = useRef<FlappyEngine | BreakerEngine | PlatformerEngine | RPGEngine | null>(null);

  // Sound handler
  const handleSound = useCallback((sound: string) => {
    switch (sound) {
      case 'beep': audio.playBeep(); break;
      case 'coin': audio.playCoin(); break;
      case 'hit': audio.playHit(); break;
      case 'jump': audio.playJump(); break;
      case 'levelup': audio.playLevelUp(); break;
      case 'eat': audio.playEat(); break;
      case 'laser': audio.playLaser(); break;
      case 'explosion': audio.playExplosion(); break;
      case 'powerup': audio.playPowerup(); break;
      case 'slash': audio.playSlash(); break;
      case 'stomp': audio.playStomp(); break;
    }
  }, []);

  // Initialize engine
  useEffect(() => {
    const callbacks = {
      onScoreUpdate: (s: number) => setScore(s),
      onLivesUpdate: (l: number) => setLives(l),
      onGameOver: (finalScore: number, coinReward: number) => {
        setIsGameOver(true);
        setGameOverStats({ finalScore, coinReward });
      },
      onSound: handleSound,
    };

    if (gameType === 'flappy') {
      engineRef.current = new FlappyEngine(pet, callbacks);
    } else if (gameType === 'breaker') {
      engineRef.current = new BreakerEngine(pet, callbacks);
    } else if (gameType === 'mario') {
      engineRef.current = new PlatformerEngine(pet, callbacks);
    } else if (gameType === 'rpg') {
      engineRef.current = new RPGEngine(pet, callbacks);
    }

    setIsGameOver(false);
    setScore(0);
    setLives(3);
  }, [gameType, pet, handleSound]);

  // Main fixed-timestep game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed virtual resolution
    const VIRTUAL_W = 400;
    const VIRTUAL_H = 600;

    canvas.width = VIRTUAL_W;
    canvas.height = VIRTUAL_H;
    ctx.imageSmoothingEnabled = false;

    let animFrame: number;
    let lastTime = performance.now();
    let accumulator = 0;
    const FIXED_STEP = 1 / 60; // 60Hz physics tick

    const loop = (time: number) => {
      let dt = (time - lastTime) / 1000;
      lastTime = time;

      // Clamp max dt to prevent spiral-of-death on background tabs
      if (dt > 0.1) dt = 0.1;
      accumulator += dt;

      const engine = engineRef.current;
      if (engine && !isGameOver) {
        // Pass current input state to engine
        engine.handleInput?.(inputRef.current);

        // Fixed physics sub-ticks
        while (accumulator >= FIXED_STEP) {
          engine.update(FIXED_STEP);
          accumulator -= FIXED_STEP;
        }

        // Render at screen refresh rate
        ctx.clearRect(0, 0, VIRTUAL_W, VIRTUAL_H);
        engine.render(ctx);
      }

      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isGameOver]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        inputRef.current.up = true;
        inputRef.current.action = true;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') inputRef.current.down = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        inputRef.current.up = false;
        inputRef.current.action = false;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') inputRef.current.down = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Pointer / Touch Coordinates Helper
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);

    if (gameType === 'flappy') {
      inputRef.current.action = true;
      inputRef.current.up = true;
      // Quick release
      setTimeout(() => {
        inputRef.current.action = false;
        inputRef.current.up = false;
      }, 50);
    } else if (gameType === 'breaker') {
      if (engineRef.current && 'setPaddleTargetX' in engineRef.current) {
        (engineRef.current as BreakerEngine).setPaddleTargetX(coords.x);
      }
    } else if (gameType === 'rpg') {
      if (engineRef.current && 'handleClick' in engineRef.current) {
        (engineRef.current as RPGEngine).handleClick(coords.x, coords.y);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameType === 'breaker' && e.buttons > 0) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      if (engineRef.current && 'setPaddleTargetX' in engineRef.current) {
        (engineRef.current as BreakerEngine).setPaddleTargetX(coords.x);
      }
    }
  };

  const getGameTitle = () => {
    switch (gameType) {
      case 'flappy': return '🐦 Flappy Bro';
      case 'breaker': return '🧱 Pixel Breaker';
      case 'mario': return '🍄 Super Bro Land';
      case 'rpg': return '⚔️ Final Bro-tasy';
    }
  };

  return (
    <div className="flex-1 flex flex-col relative w-full h-full bg-black overflow-hidden select-none">
      {/* Top Arcade HUD */}
      <div className="flex justify-between items-center px-3 py-1.5 bg-slate-900 border-b-2 border-slate-700 text-white z-20 font-pixel text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400">{getGameTitle()}</span>
          <span className="text-white">SCORE: {score}</span>
        </div>

        <div className="flex items-center gap-3">
          {gameType !== 'rpg' && (
            <span className="text-red-500 tracking-wider">
              {'❤️'.repeat(Math.max(0, lives))}
            </span>
          )}
          <button
            onClick={() => onClose(0)}
            className="pixel-btn bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 text-[8px]"
          >
            EXIT
          </button>
        </div>
      </div>

      {/* Main Canvas Container */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="w-full h-full object-contain cursor-crosshair touch-none"
        />

        {/* Virtual Gamepad for Super Bro Land & Pixel Breaker */}
        {(gameType === 'mario' || gameType === 'breaker') && (
          <div className="absolute bottom-4 left-0 right-0 px-5 flex justify-between z-30 pointer-events-none">
            {/* D-pad Horizontal */}
            <div className="flex gap-3 pointer-events-auto">
              <button
                onPointerDown={(e) => { e.preventDefault(); inputRef.current.left = true; }}
                onPointerUp={() => { inputRef.current.left = false; }}
                onPointerLeave={() => { inputRef.current.left = false; }}
                className="w-13 h-13 bg-white/30 active:bg-white/70 border-2 border-white/80 rounded-full flex items-center justify-center text-white text-xl font-bold backdrop-blur-sm touch-none shadow-lg"
              >
                ◀
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); inputRef.current.right = true; }}
                onPointerUp={() => { inputRef.current.right = false; }}
                onPointerLeave={() => { inputRef.current.right = false; }}
                className="w-13 h-13 bg-white/30 active:bg-white/70 border-2 border-white/80 rounded-full flex items-center justify-center text-white text-xl font-bold backdrop-blur-sm touch-none shadow-lg"
              >
                ▶
              </button>
            </div>

            {/* Jump Action Button (A) */}
            {gameType === 'mario' && (
              <div className="pointer-events-auto">
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    inputRef.current.up = true;
                    inputRef.current.action = true;
                  }}
                  onPointerUp={() => {
                    inputRef.current.up = false;
                    inputRef.current.action = false;
                  }}
                  onPointerLeave={() => {
                    inputRef.current.up = false;
                    inputRef.current.action = false;
                  }}
                  className="w-14 h-14 bg-red-500/60 active:bg-red-500/90 border-2 border-red-300 rounded-full flex items-center justify-center text-white text-xl font-pixel font-bold backdrop-blur-sm touch-none shadow-lg"
                >
                  A
                </button>
              </div>
            )}
          </div>
        )}

        {/* Game Over Screen */}
        {isGameOver && (
          <div className="absolute inset-0 bg-black/90 flex flex-col justify-center items-center z-40 p-6 text-center animate-fade-in">
            <h2 className="text-2xl text-red-500 font-pixel font-bold mb-3">GAME OVER</h2>
            <div className="bg-slate-900 border-2 border-slate-700 p-4 rounded-xl w-full max-w-xs mb-5 flex flex-col gap-2 font-pixel">
              <div className="flex justify-between text-xs text-white">
                <span>FINAL SCORE:</span>
                <span className="text-yellow-400">{gameOverStats.finalScore}</span>
              </div>
              <div className="flex justify-between text-xs text-white border-t border-slate-800 pt-2">
                <span>COINS EARNED:</span>
                <span className="text-green-400">+{gameOverStats.coinReward} 🪙</span>
              </div>
            </div>

            <button
              onClick={() => onClose(gameOverStats.coinReward)}
              className="pixel-btn bg-green-500 hover:bg-green-600 text-black px-6 py-3 text-xs font-pixel font-bold shadow-lg"
            >
              COLLECT & RETURN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
