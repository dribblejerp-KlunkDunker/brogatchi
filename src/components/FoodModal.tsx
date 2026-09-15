import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { audio } from '../audio';

interface FoodModalProps {
  onClose: () => void;
}

const FOODS = [
  { emoji: '🥗', name: 'Salad',   hunger: 15, cost: 0,  happy: 1,  energy: false },
  { emoji: '🍕', name: 'Pizza',   hunger: 30, cost: 5,  happy: 8,  energy: false, bg: 'bg-orange-100' },
  { emoji: '🍔', name: 'Burger',  hunger: 45, cost: 10, happy: 12, energy: false, bg: 'bg-red-100'    },
  { emoji: '⚡',  name: 'G-Fuel',  hunger: 20, cost: 15, happy: 2,  energy: true,  bg: 'bg-blue-100'  },
];

export function FoodModal({ onClose }: FoodModalProps) {
  const { stats, setStats, coins, spendCoins } = useGameStore(
    useShallow((s) => ({
      stats: s.stats,
      setStats: s.setStats,
      coins: s.coins,
      spendCoins: s.spendCoins,
    }))
  );

  const feed = (hunger: number, cost: number, happy: number, isEnergy = false) => {
    if (cost > 0 && !spendCoins(cost)) {
      return; // Not enough coins
    }
    audio.playEat();
    setStats({
      hunger: Math.min(100, stats.hunger + hunger),
      happy: Math.min(100, stats.happy + happy),
      energy: isEnergy ? Math.min(100, stats.energy + 30) : stats.energy,
      weight: stats.weight + 0.05,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white text-black p-4 rounded-xl border-4 border-black w-full max-w-sm flex flex-col gap-3 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-2 right-2 text-xl hover:text-red-500">✖</button>
        <h2 className="text-sm font-pixel font-bold text-center border-b-2 border-black pb-2">Feed Ryan</h2>
        <div className="grid grid-cols-2 gap-2">
          {FOODS.map((f) => (
            <button
              key={f.name}
              className={`pixel-btn p-2 flex flex-col items-center gap-1 ${f.bg ?? ''}`}
              onClick={() => feed(f.hunger, f.cost, f.happy, f.energy)}
            >
              <span className="text-2xl">{f.emoji}</span>
              <span className="text-[8px] font-pixel">{f.name} ({f.cost === 0 ? 'Free' : `${f.cost}c`})</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-center text-gray-500 font-vt">Coins: {coins}🪙</p>
      </div>
    </div>
  );
}
