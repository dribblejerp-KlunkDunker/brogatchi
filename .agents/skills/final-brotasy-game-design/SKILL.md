---
name: final-brotasy-game-design
description: >-
  Comprehensive game design, combat math, world-building lore, and architecture pipeline for the Final Bro-tasy RPG.
  Use when developing, extending, or balancing characters, enemies, encounters, lore, or tactical mechanics in Final Bro-tasy.
---

# Final Bro-tasy: Technical & Creative Game Design Manual

This skill provides the complete design specifications, combat formulas, encounter pipelines, and lore references for **Final Bro-tasy** in the Bro'gatchi suite.

---

## 1. Combat System Architecture (ATB 2.0)

Final Bro-tasy operates on an **Active Time Battle (ATB)** engine running on a fixed 60Hz delta-time loop:

```text
               ┌───────────────────────┐
               │    ATB Fill Phase     │
               │  gauge += spd * 0.45  │
               └───────────┬───────────┘
                           │
                 [ Gauge reaches 100 ]
                           │
               ┌───────────▼───────────┐
       ┌───────┤   Player / AI Turn    ├───────┐
       │       └───────────────────────┘       │
       ▼                                       ▼
 [ Basic Attack ]                      [ Tactical Tech Skill ]
   - Generates +10 MP                    - Consumes MP
   - Builds +15% Limit                   - Applies Status Buff/Debuff
   - Targets Enemy                       - High Kinetic / Elemental Damage
```

### Core Formulas

1. **Damage Mitigation**:
   $$\text{RawDamage} = \text{Attacker.ATK} \times \text{SkillMultiplier} + \text{RNG}(0, \text{Variance})$$
   $$\text{DamageDealt} = \max\left(1, \text{RawDamage} - \lfloor\text{Target.DEF} \times 0.6\rfloor\right)$$

2. **Critical Hits**:
   - Base Critical Rate: $10\% + (\text{Attacker.Speed} \times 0.5\%)$
   - Critical Damage Multiplier: $1.65\times$ base damage
   - Screen Shake triggered on Crit: $6.0\text{px}$

3. **Limit Break Super**:
   - Limit gauge builds when dealing damage ($+12\%$) and receiving damage ($+20\%$).
   - At $100\%$, character aura pulses gold and unlocks cinematic ultimate:
     $$\text{LimitDamage} = \text{RawDamage} \times 3.5$$

4. **Status Effects**:
   - **Overheated**: Takes $5\%$ max HP thermal damage per tick; speed $+20\%$.
   - **Firewalled**: Defense doubled; immune to debuffs for 2 turns.
   - **Glitched / Stunned**: ATB gauge paused for $1.5\text{s}$; evasion dropped to $0\%$.
   - **Regen**: Heals $8\%$ max HP per turn.

---

## 2. World Building & Content Pipeline

When expanding Final Bro-tasy content, follow the established world bible:
- See detailed faction history in [world_lore.md](./references/world_lore.md).
- Ensure new sectors follow the progression curve:
  1. **Sector 01: The Neon Slums (Low-Ping Border)**: Tutorial, Hegemony Drone Scouts, Overclocker Thugs.
  2. **Sector 02: The Silicon Sinks**: Scrap Golems, Dial-Up Marauders, Rust Wurms.
  3. **Sector 03: The Vapor Crypts**: Buffer Wraiths, Corrupted Glitches, Icewall Daemons.
  4. **Sector 04: The Hegemony Core Spire**: Elite Inquisitors, Dread Archon Null.

---

## 3. Implementation Verification Checklist
- [ ] Ensure character and enemy sprites implement retro pixel aesthetics matching `drawPixelPet`.
- [ ] Verify that all combat damage values spawn a rising `FloatingText` popup.
- [ ] Confirm screen shake triggers on critical strikes and Limit Breaks.
- [ ] Ensure audio cues match: `playSlash()`, `playExplosion()`, `playPowerup()`, `playHit()`.
