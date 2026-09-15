import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { audio } from '../audio';

interface ActionBarProps {
  onFeed: () => void;
  onArcade: () => void;
  onShop: () => void;
  onTasks: () => void;
  onAsk: () => void;
}

export function ActionBar({ onFeed, onArcade, onShop, onTasks, onAsk: _onAsk }: ActionBarProps) {
  const { sleeping, setSleeping, clearClutter, stats, setStats } = useGameStore(
    useShallow((s) => ({
      sleeping: s.sleeping,
      setSleeping: s.setSleeping,
      clearClutter: s.clearClutter,
      stats: s.stats,
      setStats: s.setStats,
    }))
  );

  const toggleSleep = () => {
    audio.playBeep();
    setSleeping(!sleeping);
  };

  const clean = () => {
    audio.playBeep();
    clearClutter();
    setStats({ happy: Math.min(100, stats.happy + 5) });
  };

  const buttons = [
    { emoji: '🍕', bg: 'bg-red-400',    label: 'Feed',   action: onFeed },
    { emoji: '🚿', bg: 'bg-blue-400',   label: 'Clean',  action: clean },
    { emoji: '🕹️', bg: 'bg-yellow-400', label: 'Arcade', action: onArcade },
    { emoji: '🛒', bg: 'bg-amber-400',  label: 'Shop',   action: onShop },
    { emoji: '💤', bg: 'bg-indigo-400', label: 'Sleep',  action: toggleSleep },
    { emoji: '📋', bg: 'bg-green-400',  label: 'Tasks',  action: onTasks },
  ];

  return (
    <div className="grid grid-cols-6 gap-1.5 mt-2 px-0.5 z-40 relative">
      {buttons.map(({ emoji, bg, label, action }) => (
        <button
          key={label}
          className={`pixel-btn p-2 text-xl ${bg}`}
          onClick={action}
          title={label}
          aria-label={label}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
