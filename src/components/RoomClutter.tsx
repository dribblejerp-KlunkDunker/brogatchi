import { useGameStore } from '../store';

export function RoomClutter() {
  const poop = useGameStore((s) => s.poop);
  const clutter = useGameStore((s) => s.clutter);
  const clearClutter = useGameStore((s) => s.clearClutter);

  return (
    <div
      className="absolute bottom-4 w-full h-16 pointer-events-none z-20"
      title="Tap to clean"
      onClick={(e) => { e.stopPropagation(); clearClutter(); }}
      style={{ pointerEvents: (poop > 0 || clutter.length > 0) ? 'auto' : 'none' }}
    >
      {Array.from({ length: poop }, (_, i) => (
        <div
          key={`poop-${i}`}
          className="absolute bottom-1 text-xl drop-shadow"
          style={{ left: `${15 + i * 15}%` }}
        >
          💩
        </div>
      ))}
      {clutter.map((item, i) => (
        <div
          key={`clutter-${i}`}
          className="absolute bottom-0 text-lg opacity-80"
          style={{ left: `${item.x}%` }}
        >
          {item.type}
        </div>
      ))}
    </div>
  );
}
