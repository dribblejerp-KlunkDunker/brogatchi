import { useState } from 'react';
import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { audio } from '../audio';
import type { MiniGameType } from './minigames/types';
import { MiniGameCanvas } from './minigames/MiniGameCanvas';
import { FinalBrotasyGame } from './minigames/rpg/FinalBrotasyGame';

interface ArcadeModalProps {
  onClose: () => void;
}

interface GameCard {
  type: MiniGameType;
  title: string;
  badge: string;
  desc: string;
  icon: string;
  bgGradient: string;
  borderClass: string;
}

const ARCADE_GAMES: GameCard[] = [
  {
    type: 'flappy',
    title: 'Flappy Bro',
    badge: 'ARCADE CLONE',
    desc: 'Flap through parallax night skyline and dodge surveillance pipes.',
    icon: '🐦',
    bgGradient: 'from-blue-900/60 to-indigo-950/80',
    borderClass: 'border-blue-500 hover:border-blue-400',
  },
  {
    type: 'breaker',
    title: 'Pixel Breaker',
    badge: 'BRICK SMASH',
    desc: 'Smash firewall bricks with deflection physics and power-ups.',
    icon: '🧱',
    bgGradient: 'from-red-900/60 to-rose-950/80',
    borderClass: 'border-red-500 hover:border-red-400',
  },
  {
    type: 'mario',
    title: 'Super Bro Land',
    badge: '2D PLATFORMER',
    desc: 'Jump, stomp reptilian agents, hit ? blocks, and reach the 5G goal.',
    icon: '🍄',
    bgGradient: 'from-emerald-900/60 to-green-950/80',
    borderClass: 'border-green-500 hover:border-green-400',
  },
  {
    type: 'rpg',
    title: 'Final Bro-tasy',
    badge: 'SYNTHWAVE RPG',
    desc: 'Tactical ATB battle against federal agents with Limit Break gauges.',
    icon: '⚔️',
    bgGradient: 'from-purple-900/60 to-fuchsia-950/80',
    borderClass: 'border-purple-500 hover:border-purple-400',
  },
];

export function ArcadeModal({ onClose }: ArcadeModalProps) {
  const [activeGame, setActiveGame] = useState<MiniGameType | null>(null);

  const { inventory, addCoins, stats, setStats } = useGameStore(
    useShallow((s) => ({
      inventory: s.inventory,
      addCoins: s.addCoins,
      stats: s.stats,
      setStats: s.setStats,
    }))
  );

  const currentPet = inventory.pet || 'ryan';

  const handleLaunchGame = (type: MiniGameType) => {
    audio.playCoin();
    setActiveGame(type);
  };

  const handleGameEnd = (earnedCoins: number) => {
    if (earnedCoins > 0) {
      addCoins(earnedCoins);
      setStats({
        happy: Math.min(100, stats.happy + 15),
        weight: Math.max(1.0, stats.weight - 0.1),
      });
    }
    setActiveGame(null);
  };

  // If playing a game, render full arcade canvas or JRPG engine
  if (activeGame) {
    if (activeGame === 'rpg') {
      return (
        <div className="modal-overlay" style={{ padding: 0, background: '#000' }}>
          <FinalBrotasyGame
            pet={currentPet}
            onClose={handleGameEnd}
          />
        </div>
      );
    }

    return (
      <div className="modal-overlay" style={{ padding: 0, background: '#000' }}>
        <MiniGameCanvas
          gameType={activeGame}
          pet={currentPet}
          onClose={handleGameEnd}
        />
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-slate-950 text-white p-4 rounded-2xl border-4 border-slate-700 w-full max-w-sm flex flex-col gap-3 relative max-h-[90%] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 0 25px rgba(56, 189, 248, 0.25), inset 0 0 15px rgba(0, 0, 0, 0.8)',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b-2 border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🕹️</span>
            <div>
              <h2 className="text-xs font-pixel font-bold text-yellow-400">BRO ARCADE</h2>
              <p className="text-[7px] font-pixel text-slate-400">Fixed-Physics 60Hz Suite</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-lg hover:text-red-400 px-2 py-0.5 rounded text-slate-400"
          >
            ✖
          </button>
        </div>

        {/* Companion Pet Status */}
        <div className="bg-slate-900/90 border border-slate-700 p-2 rounded-lg flex items-center justify-between text-[8px] font-pixel">
          <span className="text-slate-300">AVATAR:</span>
          <span className="text-cyan-400 capitalize font-bold">
            {currentPet.replace('_', ' ')} (READY)
          </span>
        </div>

        {/* Game Selection Grid */}
        <div className="flex flex-col gap-2.5">
          {ARCADE_GAMES.map((game) => (
            <div
              key={game.type}
              onClick={() => handleLaunchGame(game.type)}
              className={`p-2.5 rounded-xl border-2 bg-gradient-to-r ${game.bgGradient} ${game.borderClass} cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-3 relative overflow-hidden`}
            >
              {/* Game Icon */}
              <div className="w-12 h-12 bg-black/40 border border-white/20 rounded-lg flex items-center justify-center text-2xl select-none flex-shrink-0">
                {game.icon}
              </div>

              {/* Game Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <h3 className="text-[10px] font-pixel font-bold text-white truncate">
                    {game.title}
                  </h3>
                  <span className="text-[6.5px] font-pixel font-bold px-1.5 py-0.5 rounded bg-white/10 text-yellow-300 border border-yellow-300/30">
                    {game.badge}
                  </span>
                </div>
                <p className="text-[8px] text-slate-300 font-vt leading-snug line-clamp-2">
                  {game.desc}
                </p>
              </div>

              {/* Play arrow */}
              <div className="text-slate-400 text-sm font-bold pl-1">▶</div>
            </div>
          ))}
        </div>

        <p className="text-[8px] font-pixel text-center text-slate-500 pt-1">
          Play to earn coins & boost happiness!
        </p>
      </div>
    </div>
  );
}
