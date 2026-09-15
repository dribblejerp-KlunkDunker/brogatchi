import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { audio } from '../audio';
import type { PetType } from '../store';

interface AvatarProps {
  dialogue: string;
}

export function Avatar({ dialogue }: AvatarProps) {
  const { stats, sleeping, inventory, setStats } = useGameStore(
    useShallow((s) => ({
      stats: s.stats,
      sleeping: s.sleeping,
      inventory: s.inventory,
      setStats: s.setStats,
    }))
  );

  const pet: PetType = inventory.pet || 'ryan';
  const weightScale = Math.min(Math.max(stats.weight, 1.0), 2.5);

  const handleTap = () => {
    audio.resume();
    audio.playBeep();
    if (sleeping) return;
    setStats({ happy: Math.min(100, stats.happy + 2), energy: Math.max(0, stats.energy - 1) });
  };

  // Eye state
  const eyeScaleY = sleeping ? 0.15 : 1;

  const renderPetSvg = () => {
    switch (pet) {
      case 'cyber_dog':
        return (
          <svg
            id="pet-svg"
            viewBox="0 0 100 120"
            className={`w-40 h-auto drop-shadow-xl z-10 ${sleeping ? '' : 'animate-breathe'}`}
            style={{ transformOrigin: 'bottom center' }}
          >
            {/* Antenna Tail */}
            <rect x="12" y="75" width="4" height="25" fill="#64748b" transform="rotate(-25 12 75)" />
            <circle cx="2" cy="70" r="4" fill="#38bdf8" />
            {/* Robodog Body */}
            <rect x="25" y="65" width="50" height="42" fill="#cbd5e1" rx="6" />
            <rect x="35" y="72" width="30" height="25" fill="#94a3b8" rx="4" />
            {/* Cyber Collar with Tag */}
            <rect x="25" y="60" width="50" height="8" fill="#ef4444" rx="2" />
            <circle cx="50" cy="70" r="4" fill="#fbbf24" />
            {/* Ears */}
            <polygon points="22,25 32,5 38,30" fill="#3b82f6" />
            <polygon points="78,25 68,5 62,30" fill="#3b82f6" />
            {/* Head */}
            <rect x="22" y="20" width="56" height="45" fill="#e2e8f0" rx="8" />
            {/* Visor / Eye Screen */}
            <rect x="28" y="30" width="44" height="20" fill="#0f172a" rx="4" />
            {/* Glowing Eyes */}
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '38px 40px', transition: 'transform 0.3s' }}>
              <rect x="34" y="34" width="10" height="11" fill="#38bdf8" rx="2" />
              <rect x="36" y="36" width="3" height="3" fill="#ffffff" />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '62px 40px', transition: 'transform 0.3s' }}>
              <rect x="56" y="34" width="10" height="11" fill="#38bdf8" rx="2" />
              <rect x="58" y="36" width="3" height="3" fill="#ffffff" />
            </g>
            {/* Snout & Nose */}
            <rect x="42" y="47" width="16" height="12" fill="#cbd5e1" rx="4" />
            <polygon points="50,50 46,47 54,47" fill="#0f172a" />
            {!sleeping && <rect x="48" y="55" width="4" height="5" fill="#f43f5e" rx="2" />}
            {/* Paws */}
            <rect x="28" y="102" width="14" height="12" fill="#64748b" rx="4" />
            <rect x="58" y="102" width="14" height="12" fill="#64748b" rx="4" />
          </svg>
        );

      case 'neko_cat':
        return (
          <svg
            id="pet-svg"
            viewBox="0 0 100 120"
            className={`w-40 h-auto drop-shadow-xl z-10 ${sleeping ? '' : 'animate-breathe'}`}
            style={{ transformOrigin: 'bottom center' }}
          >
            {/* Cat Tail */}
            <path d="M 75 90 Q 95 80 88 55 Q 85 50 82 55" fill="none" stroke="#f59e0b" strokeWidth="6" strokeLinecap="round" />
            {/* Ears */}
            <polygon points="20,30 30,5 42,28" fill="#f59e0b" />
            <polygon points="24,28 30,12 38,26" fill="#fbcfe8" />
            <polygon points="80,30 70,5 58,28" fill="#f59e0b" />
            <polygon points="76,28 70,12 62,26" fill="#fbcfe8" />
            {/* Body */}
            <rect x="26" y="65" width="48" height="40" fill="#fef3c7" rx="10" />
            <rect x="36" y="70" width="28" height="28" fill="#ffffff" rx="8" />
            {/* Head */}
            <rect x="22" y="24" width="56" height="46" fill="#fef3c7" rx="14" />
            <ellipse cx="50" cy="28" rx="8" ry="4" fill="#f59e0b" />
            {/* Whiskers */}
            <line x1="14" y1="46" x2="26" y2="48" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
            <line x1="14" y1="53" x2="26" y2="52" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
            <line x1="86" y1="46" x2="74" y2="48" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
            <line x1="86" y1="53" x2="74" y2="52" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
            {/* Eyes */}
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '38px 44px', transition: 'transform 0.3s' }}>
              <ellipse cx="38" cy="44" rx="7" ry="8" fill="#0284c7" />
              <circle cx="36" cy="42" r="3" fill="#ffffff" />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '62px 44px', transition: 'transform 0.3s' }}>
              <ellipse cx="62" cy="44" rx="7" ry="8" fill="#0284c7" />
              <circle cx="60" cy="42" r="3" fill="#ffffff" />
            </g>
            {/* Pink Nose & Mouth */}
            <polygon points="50,52 47,49 53,49" fill="#f43f5e" />
            <path d="M 46 54 Q 50 58 54 54" fill="none" stroke="#78350f" strokeWidth="2" strokeLinecap="round" />
            {/* Collar with Bell */}
            <rect x="28" y="64" width="44" height="6" fill="#ef4444" rx="2" />
            <circle cx="50" cy="71" r="4" fill="#fbbf24" />
            {/* Paws */}
            <circle cx="35" cy="106" r="6" fill="#ffffff" />
            <circle cx="65" cy="106" r="6" fill="#ffffff" />
          </svg>
        );

      case 'pixel_dragon':
        return (
          <svg
            id="pet-svg"
            viewBox="0 0 100 120"
            className={`w-40 h-auto drop-shadow-xl z-10 ${sleeping ? '' : 'animate-breathe'}`}
            style={{ transformOrigin: 'bottom center' }}
          >
            {/* Dragon Wings */}
            <polygon points="12,50 26,40 24,70" fill="#7c3aed" />
            <polygon points="88,50 74,40 76,70" fill="#7c3aed" />
            {/* Spiky Tail */}
            <path d="M 70 95 Q 92 100 90 75" fill="none" stroke="#059669" strokeWidth="7" strokeLinecap="round" />
            <polygon points="90,72 85,62 95,66" fill="#f59e0b" />
            {/* Horns */}
            <polygon points="30,22 25,6 36,18" fill="#f59e0b" />
            <polygon points="70,22 75,6 64,18" fill="#f59e0b" />
            {/* Body */}
            <rect x="25" y="62" width="50" height="44" fill="#059669" rx="8" />
            <rect x="34" y="68" width="32" height="30" fill="#fde047" rx="6" />
            {/* Head */}
            <rect x="22" y="20" width="56" height="46" fill="#10b981" rx="10" />
            {/* Back Spikes */}
            <polygon points="50,14 46,20 54,20" fill="#f59e0b" />
            {/* Eyes */}
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '36px 42px', transition: 'transform 0.3s' }}>
              <ellipse cx="36" cy="42" rx="7" ry="8" fill="#fde047" />
              <rect x="35" y="36" width="3" height="12" fill="#0f172a" rx="1" />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '64px 42px', transition: 'transform 0.3s' }}>
              <ellipse cx="64" cy="42" rx="7" ry="8" fill="#fde047" />
              <rect x="63" y="36" width="3" height="12" fill="#0f172a" rx="1" />
            </g>
            {/* Snout & Little Nostril Smoke */}
            <rect x="36" y="48" width="28" height="14" fill="#059669" rx="4" />
            <circle cx="44" cy="54" r="2" fill="#047857" />
            <circle cx="56" cy="54" r="2" fill="#047857" />
            {!sleeping && <circle cx="34" cy="48" r="3" fill="rgba(255,255,255,0.7)" className="animate-ping" />}
            {/* Feet */}
            <rect x="28" y="104" width="14" height="10" fill="#047857" rx="3" />
            <rect x="58" y="104" width="14" height="10" fill="#047857" rx="3" />
          </svg>
        );

      case 'tactical_frog':
        return (
          <svg
            id="pet-svg"
            viewBox="0 0 100 120"
            className={`w-40 h-auto drop-shadow-xl z-10 ${sleeping ? '' : 'animate-breathe'}`}
            style={{ transformOrigin: 'bottom center' }}
          >
            {/* Big Bulging Eye Sockets on Top */}
            <circle cx="32" cy="30" r="15" fill="#16a34a" />
            <circle cx="68" cy="30" r="15" fill="#16a34a" />
            {/* Frog Eyes */}
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '32px 30px', transition: 'transform 0.3s' }}>
              <circle cx="32" cy="30" r="10" fill="#facc15" />
              <ellipse cx="32" cy="30" rx="4" ry="8" fill="#0f172a" />
              <circle cx="34" cy="27" r="2" fill="#ffffff" />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '68px 30px', transition: 'transform 0.3s' }}>
              <circle cx="68" cy="30" r="10" fill="#facc15" />
              <ellipse cx="68" cy="30" rx="4" ry="8" fill="#0f172a" />
              <circle cx="70" cy="27" r="2" fill="#ffffff" />
            </g>
            {/* Head & Body */}
            <ellipse cx="50" cy="62" rx="36" ry="28" fill="#22c55e" />
            {/* Belly */}
            <ellipse cx="50" cy="70" rx="24" ry="18" fill="#bbf7d0" />
            {/* Tactical Red Bandana */}
            <rect x="18" y="44" width="64" height="8" fill="#dc2626" rx="2" />
            <polygon points="18,48 10,42 12,56" fill="#dc2626" />
            {/* Wide Smile */}
            <path d="M 32 58 Q 50 68 68 58" fill="none" stroke="#14532d" strokeWidth="2.5" strokeLinecap="round" />
            {/* Blushing cheeks */}
            <circle cx="28" cy="62" r="4" fill="#f87171" opacity="0.6" />
            <circle cx="72" cy="62" r="4" fill="#f87171" opacity="0.6" />
            {/* Webbed Hands/Feet */}
            <ellipse cx="22" cy="95" rx="10" ry="6" fill="#16a34a" />
            <ellipse cx="78" cy="95" rx="10" ry="6" fill="#16a34a" />
            <ellipse cx="35" cy="98" rx="8" ry="6" fill="#16a34a" />
            <ellipse cx="65" cy="98" rx="8" ry="6" fill="#16a34a" />
          </svg>
        );

      case 'alien_xeno':
        return (
          <svg
            id="pet-svg"
            viewBox="0 0 100 120"
            className={`w-40 h-auto drop-shadow-xl z-10 ${sleeping ? '' : 'animate-breathe'}`}
            style={{ transformOrigin: 'bottom center' }}
          >
            {/* Pulsing Star Antennae */}
            <line x1="36" y1="28" x2="22" y2="10" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" />
            <circle cx="20" cy="8" r="5" fill="#38bdf8" />
            <line x1="64" y1="28" x2="78" y2="10" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" />
            <circle cx="80" cy="8" r="5" fill="#38bdf8" />
            {/* Hover UFO Base Glow */}
            <ellipse cx="50" cy="108" rx="30" ry="6" fill="#00f0ff" opacity="0.5" />
            <ellipse cx="50" cy="104" rx="26" ry="5" fill="#38bdf8" />
            {/* Alien Body */}
            <ellipse cx="50" cy="78" rx="24" ry="24" fill="#c084fc" />
            {/* Big Bulbous Alien Head */}
            <ellipse cx="50" cy="42" rx="34" ry="28" fill="#a855f7" />
            {/* Giant Slanted Cosmic Eyes */}
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '36px 42px', transition: 'transform 0.3s' }}>
              <ellipse cx="36" cy="42" rx="10" ry="14" fill="#09090b" transform="rotate(-15 36 42)" />
              <circle cx="34" cy="38" r="4" fill="#ffffff" />
              <circle cx="38" cy="46" r="1.5" fill="#38bdf8" />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '64px 42px', transition: 'transform 0.3s' }}>
              <ellipse cx="64" cy="42" rx="10" ry="14" fill="#09090b" transform="rotate(15 64 42)" />
              <circle cx="62" cy="38" r="4" fill="#ffffff" />
              <circle cx="66" cy="46" r="1.5" fill="#38bdf8" />
            </g>
            {/* Cute alien mouth */}
            <circle cx="50" cy="56" r="3" fill="#581c87" />
            {/* Small hovering arms */}
            <ellipse cx="24" cy="74" rx="5" ry="8" fill="#c084fc" />
            <ellipse cx="76" cy="74" rx="5" ry="8" fill="#c084fc" />
          </svg>
        );

      case 'spooky_ghost':
        return (
          <svg
            id="pet-svg"
            viewBox="0 0 100 120"
            className={`w-40 h-auto drop-shadow-xl z-10 ${sleeping ? '' : 'animate-bounce'}`}
            style={{ transformOrigin: 'bottom center' }}
          >
            {/* Ghost Aura */}
            <ellipse cx="50" cy="60" rx="38" ry="44" fill="rgba(56, 189, 248, 0.15)" filter="blur(4px)" />
            {/* Ghost Body */}
            <path
              d="M 22 60 C 22 25 78 25 78 60 C 78 85 82 105 72 102 C 62 100 58 106 50 102 C 42 98 38 106 28 102 C 20 98 22 85 22 60 Z"
              fill="#f8fafc"
            />
            {/* Little Ghost Hands */}
            <ellipse cx="18" cy="65" rx="6" ry="8" fill="#f8fafc" transform="rotate(-20 18 65)" />
            <ellipse cx="82" cy="65" rx="6" ry="8" fill="#f8fafc" transform="rotate(20 82 65)" />
            {/* Blushing Cheeks */}
            <ellipse cx="32" cy="56" rx="5" ry="3" fill="#f472b6" opacity="0.7" />
            <ellipse cx="68" cy="56" rx="5" ry="3" fill="#f472b6" opacity="0.7" />
            {/* Eyes */}
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '38px 48px', transition: 'transform 0.3s' }}>
              <circle cx="38" cy="48" r="6" fill="#0284c7" />
              <circle cx="36" cy="46" r="2.5" fill="#ffffff" />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '62px 48px', transition: 'transform 0.3s' }}>
              <circle cx="62" cy="48" r="6" fill="#0284c7" />
              <circle cx="60" cy="46" r="2.5" fill="#ffffff" />
            </g>
            {/* Open Happy Ghost Mouth */}
            <ellipse cx="50" cy="58" rx="4" ry="6" fill="#0f172a" />
          </svg>
        );

      case 'ryan':
      default:
        return (
          <svg
            id="ryan-svg"
            viewBox="0 0 100 120"
            className={`w-40 h-auto drop-shadow-xl z-10 ${sleeping ? '' : 'animate-breathe'}`}
            style={{ transformOrigin: 'bottom center' }}
          >
            {/* Head */}
            <rect x="20" y="20" width="60" height="55" fill="#fcd34d" rx="4" />
            {/* Hair */}
            <rect x="20" y="15" width="60" height="15" fill="#1f2937" />
            <rect x="15" y="25" width="10" height="30" fill="#1f2937" />
            <rect x="75" y="25" width="10" height="30" fill="#1f2937" />
            {/* Eyes */}
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '36px 46px', transition: 'transform 0.3s' }}>
              <rect x="30" y="40" width="12" height="12" fill="white" />
              <rect x="34" y="44" width="6" height="6" fill="#000" />
            </g>
            <g style={{ transform: `scaleY(${eyeScaleY})`, transformOrigin: '64px 46px', transition: 'transform 0.3s' }}>
              <rect x="58" y="40" width="12" height="12" fill="white" />
              <rect x="62" y="44" width="6" height="6" fill="#000" />
            </g>
            {/* Beard & Mouth */}
            <rect x="20" y="60" width="60" height="25" fill="#1f2937" rx="2" />
            <rect x="42" y="65" width="16" height="6" fill="#fcd34d" />
            {/* Body / Shirt */}
            <rect x="20" y="85" width="60" height="25" fill="#3b82f6" />
            {/* Arms */}
            <rect x="10" y="85" width="10" height="20" fill="#3b82f6" />
            <rect x="10" y="105" width="10" height="10" fill="#fcd34d" />
            <rect x="80" y="85" width="10" height="20" fill="#3b82f6" />
            <rect x="80" y="105" width="10" height="10" fill="#fcd34d" />
            {/* Legs */}
            <rect x="30" y="110" width="15" height="10" fill="#0f172a" />
            <rect x="55" y="110" width="15" height="10" fill="#0f172a" />
          </svg>
        );
    }
  };

  return (
    <div className="flex-1 flex justify-center items-end relative pb-4" onClick={handleTap}>
      {/* Desk floor */}
      <div
        className="absolute bottom-0 left-0 w-full h-2/5 z-[1]"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.12), transparent)',
          borderTop: '4px solid rgba(0,0,0,0.18)',
        }}
      />

      {/* Pet Avatar Container */}
      <div
        className="relative z-10 cursor-pointer"
        style={{
          transform: `scaleX(${weightScale})`,
          transformOrigin: 'bottom center',
          transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
      >
        {/* Hat */}
        {inventory.hat !== 'none' && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-4xl z-20 select-none">
            {inventory.hat}
          </div>
        )}

        {/* Zzz particles */}
        {sleeping && (
          <div className="absolute -top-10 right-0 text-2xl text-blue-500 font-bold animate-bounce select-none">
            Zzz
          </div>
        )}

        {renderPetSvg()}
      </div>

      {/* Speech bubble */}
      <div className="absolute top-0 left-0 right-0 flex justify-center z-30">
        <div className="border-2 border-black rounded-lg p-2 bg-white/90 text-black font-vt leading-tight w-4/5 text-center shadow-md relative text-sm">
          <span>{dialogue}</span>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 border-r-2 border-b-2 border-black bg-white/90 rotate-45" />
        </div>
      </div>
    </div>
  );
}
