---
trigger: model_decision
description: Canon creative rules, narrative tone, character voices, and combat design standards for Final Bro-tasy.
---

# Final Bro-tasy: Creative Canon & Technical Design Rule

When generating, modifying, or extending content, code, characters, dialogue, lore, or encounters for **Final Bro-tasy**, adhere to the following canonical guidelines.

---

## 1. Narrative Voice & Tone
- **Aesthetic**: 16-bit Synthwave Cyberpunk meets Epic High Fantasy JRPG Parody and Hyper-Gym Sovereignty.
- **Atmosphere**: Drenched in neon violet rain, glowing CRT phosphor lines, analog cassette hum, and electromagnetic sandstorms.
- **Tone Balance**: Earnest, high-stakes rebellion against algorithmic oppression blended with self-aware fitness/tech humor ("Gains for the Grid", "Unthrottled Bandwidth", "Firewall Shields").
- **Language**: Use canonical technical & retro terminology: *The Clock Cycle*, *The Carrier Wave*, *The Zero Ground*, *Protocol Zero*, *The Great De-Sync (2046)*, *Overclocking*, *Cryo-Logic*, *BSOD*, *Kernel Panic*.

---

## 2. Character Voice Signatures
- **Ryan (The Sovereign Bro)**: Confident, brotherly, unyielding leader. Quotes: *"Bandwidth belongs to the people, bros."*, *"Time to overclock this blade."*
- **Chad (The Iron Patriarch)**: Stoic, protective, unshakeable fortress. Quotes: *"Stand behind my firewall."*, *"Iron does not yield to corrupt code."*
- **Zeke (The Quantum Hacker)**: Rapid-fire, analytical, slightly manic technomancer. Quotes: *"Injecting payload... let's see their kernel handle this."*, *"Zero days, zero mercy."*
- **Sister Nova (The Signal Priestess)**: Compassionate, serene, reverent towards open protocols. Quotes: *"May the Carrier Wave guide your packets."*, *"Restoring corrupted memory."*
- **Jax "Deadlift" Vance (The Iron Marauder)**: Boisterous, explosive, pure kinetic fury. Quotes: *"LIGHT WEIGHT! HIT THEM WITH RAW SILICON!"*, *"PR OR OBLIVION!"*
- **Maya / Echo-7 (The Glitchblade)**: Whispering, enigmatic, cynical former agent. Quotes: *"A glitch in their matrix is all I need."*, *"Deleted before they render."*
- **The Companion Pets**: Active familiars that radiate tactical aura pulses and unleash cinematic companion limit breaks.

---

## 3. Combat Mechanics & Mathematics
1. **ATB Gauge Formula**:
   $$\Delta\text{ATB} = \text{Speed} \times 0.45 \times \Delta t \times 60$$
2. **Elemental Matrix**:
   - **Thermal**: High kinetic fire; deals $+35\%$ bonus vs. Cryo & Armor; weak vs. Quantum.
   - **Cryo**: Sub-zero coolant; slows ATB; deals $+35\%$ bonus vs. Thermal; weak vs. Kinetic.
   - **Kinetic**: Raw physical iron mass; staggers and pierces evasion; deals $+25\%$ bonus vs. Glitch.
   - **Quantum**: Ethereal data energy; cleanses allies; deals $+35\%$ bonus vs. Glitch.
   - **Glitch**: Void corruption; bypasses $50\%$ defense; deals $+40\%$ bonus vs. Quantum.
3. **Boss AI Phasing**:
   - Every boss must telegraph special moves at least 1 turn in advance with visual warnings (`CHARGING...`).
   - Bosses enrage or switch phase when HP falls below $40\%$.

---

## 4. Pipeline Quality Standards
- All lore additions must be registered in `loreData.ts` with valid IDs, icons, and sector linkages.
- All new skills must specify `id`, `name`, `mpCost`, `description`, `targetType`, and damage/healing multipliers.
- All enemies must include elemental affinity, credit drops, and Bestiary lore entries.
- Automated balance simulations (`simulate-combat-balance.ts`) must achieve $>75\%$ average win rate for standard party on normal difficulty.
