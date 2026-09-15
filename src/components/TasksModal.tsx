import { useState } from 'react';
import { useGameStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { audio } from '../audio';

interface TasksModalProps {
  onClose: () => void;
}

const DAILY_QUESTS = [
  { id: 'clean',  label: '🧹 Clean Setup',   coins: 10, happy: 5  },
  { id: 'grind',  label: '🎮 Ranked Grind',   coins: 20, happy: 10 },
];

export function TasksModal({ onClose }: TasksModalProps) {
  const { irlTasks, addIrlTask, toggleIrlTask, removeIrlTask, addCoins, setStats, stats } = useGameStore(
    useShallow((s) => ({
      irlTasks: s.irlTasks,
      addIrlTask: s.addIrlTask,
      toggleIrlTask: s.toggleIrlTask,
      removeIrlTask: s.removeIrlTask,
      addCoins: s.addCoins,
      setStats: s.setStats,
      stats: s.stats,
    }))
  );

  const [inputVal, setInputVal] = useState('');
  const [completedQuests, setCompletedQuests] = useState<Set<string>>(new Set());

  const completeQuest = (id: string, coins: number, happy: number) => {
    if (completedQuests.has(id)) return;
    audio.playCoin();
    addCoins(coins);
    setStats({ happy: Math.min(100, stats.happy + happy) });
    setCompletedQuests((prev) => new Set(prev).add(id));
  };

  const submitIrl = () => {
    const text = inputVal.trim();
    if (!text) return;
    addIrlTask(text);
    setInputVal('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white text-black p-4 rounded-xl border-4 border-black w-full max-w-sm flex flex-col gap-3 relative max-h-[85%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-2 right-2 text-xl hover:text-red-500">✖</button>
        <h2 className="text-sm font-pixel font-bold text-center border-b-2 border-black pb-2">Daily Quests</h2>

        <div className="flex flex-col gap-2">
          {DAILY_QUESTS.map((q) => (
            <button
              key={q.id}
              className={`pixel-btn p-2 text-[8px] text-left ${completedQuests.has(q.id) ? 'bg-green-200 opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => completeQuest(q.id, q.coins, q.happy)}
            >
              {completedQuests.has(q.id) ? '✅' : ''} {q.label} (+{q.coins}c)
            </button>
          ))}
        </div>

        <h3 className="text-[10px] font-pixel font-bold border-t-2 border-dashed border-gray-400 pt-2 mt-2">IRL Quests</h3>
        <div className="flex gap-2">
          <input
            type="text"
            className="border-2 border-black p-2 text-[10px] flex-1 font-vt rounded"
            placeholder="E.g., Do Laundry"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitIrl()}
          />
          <button className="pixel-btn px-3 text-[8px] bg-green-400" onClick={submitIrl}>Add</button>
        </div>

        <div className="flex flex-col gap-1">
          {irlTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-2 border border-gray-300 rounded p-1">
              <button
                className={`w-5 h-5 border-2 border-black rounded text-[10px] flex items-center justify-center ${task.done ? 'bg-green-400' : 'bg-white'}`}
                onClick={() => { toggleIrlTask(task.id); if (!task.done) { audio.playCoin(); addCoins(5); } }}
              >
                {task.done ? '✓' : ''}
              </button>
              <span className={`flex-1 text-[10px] font-vt ${task.done ? 'line-through text-gray-400' : ''}`}>{task.text}</span>
              <button className="text-red-400 text-xs hover:text-red-600" onClick={() => removeIrlTask(task.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
