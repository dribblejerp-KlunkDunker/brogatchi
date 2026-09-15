import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../store';
import { Avatar } from './Avatar';
import { StatBars } from './StatBars';
import { RoomClutter } from './RoomClutter';
import { FoodModal } from './FoodModal';
import { ShopModal } from './ShopModal';
import { TasksModal } from './TasksModal';
import { ArcadeModal } from './ArcadeModal';
import { ActionBar } from './ActionBar';

import type { PetType } from '../store';

type ModalName = 'food' | 'shop' | 'tasks' | 'arcade' | null;

const PET_IDLE_LINES: Record<PetType, string[]> = {
  ryan: [
    "Lag spike?", "Skill issue.", "Need more RGB.", "Is the mic on?",
    "Bro, check this clip.", "We going again?", "This setup slaps.",
    "HP low... need snacks...", "I'm tilted bro.",
  ],
  cyber_dog: [
    "*Wags antenna tail* BARK!", "Threat analysis: 100% good boy.",
    "Sensor detects zero bacon.", "Battery status: Needs pets!",
    "Satellite link established.", "Bork! Who's at the firewall?",
  ],
  neko_cat: [
    "Nya~ Got tuna?", "Purring frequency optimal.",
    "*Swats at floating cursor*", "Napping is a tactical decision.",
    "Scratching the console screen...", "Feed me, human!",
  ],
  pixel_dragon: [
    "*Tiny puff of smoke*", "Hoarding gold coins!",
    "Rawr! Fear my pixel flames!", "Need a warm volcanic snack.",
    "Wings flapped 2,000 times today.", "Are you a wizard?",
  ],
  tactical_frog: [
    "Ribbit. Commencing covert hops.", "Target acquired: Fly at 2 o'clock.",
    "Zero dark thirty, mission green.", "Lilypad secured, over.",
    "Croak! Deep tactical recon.", "Camouflage level: 100%.",
  ],
  alien_xeno: [
    "⍙⟒ ☊ᚑ⋔⟒ ⟟⋏ ⌿⟒⏃☊⟒!", "Analyzing Earth snacks...",
    "Telemetry relayed to mothership.", "Gravity is fun on this planet!",
    "Charging tachyon shields.", "Your species is amusing, human.",
  ],
  spooky_ghost: [
    "Booo! ...did I scare you?", "Floating through walls is fun!",
    "Ectoplasm energy looking fresh.", "Boo-tiful day for spooky vibes.",
    "Boo! Give me candy coins!", "Spooky season is forever.",
  ],
};

const PET_GREETINGS: Record<PetType, string> = {
  ryan: "Booting up. Check the patch notes, bro.",
  cyber_dog: "*Antenna tail whirrs* Robo-Pup online and ready to fetch!",
  neko_cat: "Nya~ Neko Cat reporting for cuddles!",
  pixel_dragon: "*Hiss* Little Drake awoken from the hoard!",
  tactical_frog: "Ribbit! Spec-ops amphibious scout deployed.",
  alien_xeno: "Greetings earthling! Transmitting friendship signals.",
  spooky_ghost: "Boo! Spectral companion floated into the room.",
};

const useDialogue = (sleeping: boolean, pet: PetType = 'ryan') => {
  const [dialogue, setDialogue] = useState(PET_GREETINGS[pet] || "Hello!");
  const say = useCallback((text: string) => setDialogue(text), []);
  
  useEffect(() => {
    setDialogue(PET_GREETINGS[pet] || "Hello!");
  }, [pet]);

  const idleLine = useCallback(() => {
    const lines = PET_IDLE_LINES[pet] || PET_IDLE_LINES.ryan;
    return lines[Math.floor(Math.random() * lines.length)];
  }, [pet]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!sleeping) say(idleLine());
    }, 25000);
    return () => clearInterval(timer);
  }, [sleeping, say, idleLine]);

  return { dialogue, say };
};

const useClock = () => {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      let h = d.getHours(), m = d.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      setTime(`${h}:${m.toString().padStart(2, '0')} ${ampm}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
};

import { useShallow } from 'zustand/react/shallow';

export function GameScreen() {
  const { inventory, sleeping, coins, steps, tick, applyOfflineDecay, lastSave } = useGameStore(
    useShallow((s) => ({
      inventory: s.inventory,
      sleeping: s.sleeping,
      coins: s.coins,
      steps: s.steps,
      tick: s.tick,
      applyOfflineDecay: s.applyOfflineDecay,
      lastSave: s.lastSave,
    }))
  );

  const [modal, setModal] = useState<ModalName>(null);
  const currentPet: PetType = inventory.pet || 'ryan';
  const { dialogue, say } = useDialogue(sleeping, currentPet);
  const time = useClock();

  // Offline decay on first mount
  useEffect(() => {
    const minsAway = (Date.now() - lastSave) / 60000;
    if (minsAway > 1) applyOfflineDecay(minsAway);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main game tick using requestAnimationFrame + delta time
  useEffect(() => {
    const TICK_INTERVAL = 15000; // 15s
    let lastTick = Date.now();
    let raf: number;

    const loop = () => {
      const now = Date.now();
      if (now - lastTick >= TICK_INTERVAL) {
        tick();
        lastTick = now;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  const themeClass = `theme-${inventory.theme}`;

  const openModal = (name: ModalName) => setModal(name);
  const closeModal = () => setModal(null);

  return (
    <div id="console-shell" className="w-full max-w-[420px] h-screen max-h-[880px] flex flex-col rounded-[40px] relative p-[20px_15px] border-2 border-slate-600"
      style={{
        background: 'linear-gradient(135deg, #334155, #0f172a)',
        boxShadow: 'inset -5px -5px 15px rgba(0,0,0,0.5), inset 5px 5px 15px rgba(255,255,255,0.1), 0 25px 50px -12px rgba(0,0,0,0.8)',
      }}
    >
      {/* Speaker grill */}
      <div className="flex gap-[6px] justify-center mb-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-2 h-6 bg-black rounded-[10px]" style={{ boxShadow: 'inset 1px 1px 3px rgba(255,255,255,0.2)' }} />
        ))}
      </div>

      {/* Screen bezel */}
      <div className="bg-black p-[10px] rounded-[20px] flex-1 flex flex-col relative overflow-hidden"
        style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)' }}
      >
        {/* Game screen */}
        <div
          id="game-screen"
          className={`${themeClass} flex-1 rounded-[10px] relative overflow-hidden flex flex-col transition-all duration-500`}
          style={{ boxShadow: 'inset 0 0 10px rgba(0,0,0,0.2)' }}
        >
          {/* HUD bar */}
          <div className="absolute top-1 left-2 right-2 flex justify-between items-center text-[8px] opacity-60 z-30 font-pixel font-bold">
            <span>{time}</span>
            <span>REC 🔴</span>
            <span>BAT 🔋</span>
          </div>

          {/* Top stats row */}
          <div className="flex justify-between items-start pt-6 px-2 mb-1 relative z-30">
            <div className="flex gap-2">
              {/* Coins */}
              <div className="bg-white/80 border-2 border-black rounded px-2 py-1 text-[10px] text-yellow-600 font-pixel font-bold shadow-sm">
                🪙 {coins}
              </div>
              {/* Steps */}
              <div className="bg-white/80 border-2 border-black rounded px-2 py-1 text-[10px] text-blue-600 font-pixel font-bold shadow-sm">
                👟 {steps}
              </div>
            </div>
          </div>

          {/* Avatar area with clutter */}
          <div className="flex-1 relative">
            <RoomClutter />
            {/* Miner rig */}
            {inventory.miner && (
              <div className="miner-rig">
                <div className="absolute bottom-1 left-1 text-[6px] text-green-400 font-vt">MINING...</div>
              </div>
            )}
            <Avatar dialogue={dialogue} />
          </div>

          {/* Stat bars */}
          <div className="px-2 pb-2">
            <StatBars />
          </div>

          {/* Modals */}
          {modal === 'food'   && <FoodModal   onClose={closeModal} />}
          {modal === 'shop'   && <ShopModal   onClose={closeModal} onOpenArcade={() => openModal('arcade')} />}
          {modal === 'tasks'  && <TasksModal  onClose={closeModal} />}
          {modal === 'arcade' && <ArcadeModal onClose={closeModal} />}
        </div>
      </div>

      {/* Action bar */}
      <ActionBar
        onFeed={() => openModal('food')}
        onArcade={() => openModal('arcade')}
        onShop={() => openModal('shop')}
        onTasks={() => openModal('tasks')}
        onAsk={() => say("Ask feature coming in Phase 4, bro.")}
      />
    </div>
  );
}
