import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { audio } from '../audio';
import type { HatName, ThemeName, PetType } from '../store';

interface ShopModalProps {
  onClose: () => void;
  onOpenArcade?: () => void;
}

const HATS: HatName[] = ['none', '🧢', '👑', '🛸'];

const THEMES: { value: ThemeName; label: string; icon: string }[] = [
  { value: 'lounge',    label: 'Vanilla Lounge',   icon: '🛋️' },
  { value: 'gamer',     label: 'RGB Gamer Room',   icon: '🎮' },
  { value: 'bunker',    label: 'Area 51 Bunker',   icon: '☢️' },
  { value: 'cyberpunk', label: 'Cyberpunk 2077',   icon: '🌆' },
  { value: 'space',     label: 'Cosmic Space',     icon: '🌌' },
  { value: 'synthwave', label: 'Retro Synthwave',  icon: '🌅' },
  { value: 'sakura',    label: 'Sakura Garden',    icon: '🌸' },
  { value: 'dungeon',   label: '8-Bit Dungeon',    icon: '🏰' },
  { value: 'beach',     label: 'Pixel Beach',      icon: '🏖️' },
];

const PETS: { value: PetType; label: string; icon: string; desc: string }[] = [
  { value: 'ryan',           label: 'Bro Ryan',       icon: '🧔', desc: 'The OG gamer conspiracy bro' },
  { value: 'cyber_dog',      label: 'Cyber K-9',      icon: '🐶', desc: 'Robotic pup with antenna tail' },
  { value: 'neko_cat',       label: 'Neko Cat',       icon: '🐱', desc: 'Curious lucky cat with bell' },
  { value: 'pixel_dragon',   label: 'Pixel Drake',    icon: '🐲', desc: 'Mythical mini fire dragon' },
  { value: 'tactical_frog',  label: 'Ops Frog',       icon: '🐸', desc: 'Spec-ops frog with red bandana' },
  { value: 'alien_xeno',     label: 'Cosmic Xeno',    icon: '🛸', desc: 'Extraterrestrial star buddy' },
  { value: 'spooky_ghost',   label: 'Boo Ghost',      icon: '👻', desc: 'Floating ethereal spirit' },
];

export function ShopModal({ onClose, onOpenArcade }: ShopModalProps) {
  const { inventory, setInventory, coins, spendCoins } = useGameStore(
    useShallow((s) => ({
      inventory: s.inventory,
      setInventory: s.setInventory,
      coins: s.coins,
      spendCoins: s.spendCoins,
    }))
  );

  const currentPet: PetType = inventory.pet || 'ryan';

  const buyMiner = () => {
    if (inventory.miner) return;
    if (spendCoins(100)) {
      audio.playCoin();
      setInventory({ miner: true });
    }
  };

  const handleSelectPet = (pet: PetType) => {
    audio.playCoin();
    setInventory({ pet });
  };

  const handleSelectTheme = (theme: ThemeName) => {
    audio.playCoin();
    setInventory({ theme });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white text-black p-4 rounded-xl border-4 border-black w-full max-w-sm flex flex-col gap-3 relative max-h-[88%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-2 right-2 text-xl hover:text-red-500">✖</button>
        <h2 className="text-sm font-pixel font-bold text-center border-b-2 border-black pb-2">Customization & Arcade</h2>

        {/* Arcade Shortcut Banner */}
        {onOpenArcade && (
          <button
            onClick={() => {
              onClose();
              onOpenArcade();
            }}
            className="pixel-btn p-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-pixel font-bold text-[9px] flex items-center justify-between shadow-md hover:brightness-105"
          >
            <span className="flex items-center gap-1.5">
              <span>🕹️</span>
              <span>PLAY RETRO ARCADE (4 GAMES)</span>
            </span>
            <span>▶</span>
          </button>
        )}

        {/* Pets Selection */}
        <h3 className="text-[10px] font-pixel font-bold bg-blue-200 p-1 border border-black flex justify-between items-center">
          <span>🐾 Companion Pets</span>
          <span className="text-[8px] font-normal text-blue-800">Choose your buddy</span>
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {PETS.map((p) => {
            const isSelected = currentPet === p.value;
            return (
              <button
                key={p.value}
                className={`pixel-btn p-1.5 text-left flex items-center gap-1.5 ${
                  isSelected ? 'bg-blue-500 text-white shadow-none translate-x-[2px] translate-y-[2px]' : 'bg-gray-50 hover:bg-gray-100 text-black'
                }`}
                onClick={() => handleSelectPet(p.value)}
              >
                <span className="text-lg select-none">{p.icon}</span>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[8px] font-bold leading-tight truncate">{p.label}</span>
                  <span className={`text-[6.5px] leading-tight truncate ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                    {p.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* High Quality Backgrounds / Themes */}
        <h3 className="text-[10px] font-pixel font-bold bg-purple-200 p-1 border border-black flex justify-between items-center">
          <span>🎨 Room Backgrounds ({THEMES.length})</span>
          <span className="text-[8px] font-normal text-purple-800">Instant switch</span>
        </h3>
        <div className="grid grid-cols-3 gap-1">
          {THEMES.map((t) => {
            const isSelected = inventory.theme === t.value;
            return (
              <button
                key={t.value}
                className={`pixel-btn p-1.5 flex flex-col items-center justify-center gap-0.5 text-center ${
                  isSelected ? 'bg-purple-600 text-white shadow-none translate-x-[2px] translate-y-[2px]' : 'bg-gray-50 hover:bg-gray-100 text-black'
                }`}
                onClick={() => handleSelectTheme(t.value)}
              >
                <span className="text-base select-none">{t.icon}</span>
                <span className="text-[6.5px] leading-tight">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Hats */}
        <h3 className="text-[10px] font-pixel font-bold bg-green-200 p-1 border border-black">🧢 Hats</h3>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {HATS.map((hat) => (
            <button
              key={hat}
              className={`pixel-btn p-2 text-lg ${inventory.hat === hat ? 'bg-yellow-300' : 'bg-gray-100'}`}
              onClick={() => setInventory({ hat })}
            >
              {hat === 'none' ? '🚫' : hat}
            </button>
          ))}
        </div>

        {/* Upgrades */}
        <h3 className="text-[10px] font-pixel font-bold bg-yellow-200 p-1 border border-black">🛒 Upgrades</h3>
        <button
          className={`pixel-btn p-2 text-[9px] flex justify-between items-center w-full ${inventory.miner ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={buyMiner}
        >
          <span>⛏️ Auto Mining Rig</span>
          <span className="text-yellow-600 font-bold">{inventory.miner ? 'OWNED' : '100c'}</span>
        </button>

        <p className="text-[10px] text-center text-gray-500 font-vt">Coins: {coins}🪙</p>
      </div>
    </div>
  );
}
