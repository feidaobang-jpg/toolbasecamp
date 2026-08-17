# Image Analysis — Pegasus Seiya (天马座星矢)

Reference: `references/pegasus-seiya.png` (360×640, conditional resolution)

## Suitability: **character-conditional → stylized** (PASS with caveats)

| Check | Result |
|-------|--------|
| Single clear subject | ✅ Full-body anime hero |
| Silhouette readable | ✅ Armor + punch pose distinctive |
| Materials visible | ✅ Silver armor, red cloth, gold trim |
| Hidden geometry | ⚠️ Back/sides inferred; dynamic foreshortening on punching arm |
| Resolution | ⚠️ 360px wide — micro detail (helmet scrollwork) approximated |

**Not rejected** — routes through character reconstruction (`grimoire/character/reconstruction.md`).

## Classification

- **primaryDomain**: `character` (hybrid: humanoid + hard-surface armor)
- **formLanguage**: stylized anime, ~5.5 head-units heroic
- **motionPotential**: combat idle / punch extension
- **intendedUse**: browser real-time prop, orbit preview (not rigged game character yet)

## Macro decomposition

1. **Head unit** — brown hair fringe, pegasus helmet (silver + gold horn curls), red eye line via visor shadow
2. **Torso** — red bodysuit, silver breastplate with circular medallion, layered pauldrons
3. **Arms** — right arm extended punch (foreshortened in ref); left arm bent at hip
4. **Waist** — gold belt buckle (hex), red skirt panels
5. **Legs** — silver greaves, knee caps, pegasus wing anklets
6. **Aura** — soft blue outer glow (optional emissive shell, not geometry-critical)

## Identity-defining details (detail inventory)

| ID | Feature | Implementation |
|----|---------|----------------|
| D1 | Pegasus helmet wing crest + gold side curls | Helmet mesh + horn curls |
| D2 | Red undersuit visible at joints | Red material gaps at elbows/thighs |
| D3 | Silver breastplate V + round chest gem | Chest plate + emissive disc |
| D4 | Layered pauldrons (3 tiers) | Stacked box meshes |
| D5 | Gold hex belt buckle | Box + dark inset |
| D6 | Punch-forward pose | Shoulder/arm pivots rotated from skeleton |
| D7 | Blue aura outline | Transparent outer shell |

## Single-view limitations (explicit)

- Back armor plates **inferred** symmetrically
- Punching fist scale in reference uses foreshortening — 3D model uses readable combat pose, not exact 2D projection match
- Hair = stylized cap, not strand geometry
- **Stylization level**: anime heroic (~5.5 HU), not photoreal likeness

## Pass plan

1. **blockout** — capsule skeleton + bounding boxes
2. **structure** — armor panels, helmet, limbs with pivots
3. **form** — pauldron tiers, greaves, belt
4. **material** — silver/red/gold Lambert + rim
5. **interaction** — `sculptRuntime`, punch arm socket, idle tick
