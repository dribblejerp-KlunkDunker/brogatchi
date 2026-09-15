import { useGameStore } from '../store';

export function StatBars() {
  const stats = useGameStore((s) => s.stats);

  const bars = [
    { label: 'HAPPY',  value: stats.happy,  color: 'bg-green-500' },
    { label: 'HUNGER', value: stats.hunger, color: 'bg-orange-500' },
    { label: 'ENERGY', value: stats.energy, color: 'bg-blue-500' },
  ];

  return (
    <div className="space-y-2 mb-2 bg-white/80 p-2 rounded border-2 border-black z-20 relative">
      {bars.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[8px] w-12 font-bold font-pixel">{label}</span>
          <div className="flex-1 h-3 bg-gray-300 border border-black rounded-full overflow-hidden">
            <div
              className={`h-full ${color} transition-all duration-500`}
              style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
          </div>
          <span className="text-[7px] w-6 text-right font-vt">{Math.floor(value)}</span>
        </div>
      ))}
    </div>
  );
}
