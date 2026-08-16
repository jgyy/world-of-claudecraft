# Mount fixes: Grimtusk saddle, Cinderhide facing, Nightprowl panther, Windrend shadewolf, Solmane rider-hip-bone lock

One-off record of the PR #3365 follow-up fixes, referenced here so the CI
sparse-checkout cone for their screenshot evidence has a real coupling
(see `tests/ci_workflow.test.ts`, "sparse-checkout on the test jobs covers
every referenced screenshot subtree").

- **Grimtusk the Ironhide Boar**: the rider sat past the saddle's rear edge.
  `seatFwd` moved from `-1.4` to `-1.15`, re-measured with the model isolated
  so the rider centers on the leather. Before/after evidence:
  `docs/screenshots/grimtusk-boar-saddle-fix/`.
- **Ashfang the Cinderhide Hound**: the mount rendered backwards relative to
  its rider and direction of travel, missing the `yaw: Math.PI` correction
  the Veil-Wraith Courser already carries for the same `-z`-resting Tripo rig.
- **Nightprowl the Duskveil Panther**: a fourth rideable mount, the rogue
  counterpart to the Courser/priest and Hound/warlock mount-lore pattern
  (tied to the rogue's Smokestep/Duskveil ability). Its raw rig rests facing
  `+X` rather than `+/-Z`, corrected with `yaw: Math.PI / 2` and verified with
  an isolated side-on capture. Evidence: `docs/screenshots/nightprowl-panther-mount/`.

Full catalog wiring for the panther (mounts/items/reliquary/deeds, i18n
catalog plus the five M16 non-Latin locale fills, KTX2-compressed GLB, wiki
regen) shipped in the same change as the boar/hound fixes.

- **Windrend the Stormveil Shadewolf**: a fifth rideable mount, the shaman
  counterpart to the Courser/priest, Hound/warlock, and Panther/rogue
  mount-lore pattern (tied to the shaman's Shadewolf travel form). Same full
  catalog wiring as the panther, plus jump and idle animations added to every
  mount in this PR and improved gait keyframe density/amplitude on the
  rigged mounts. Evidence: `docs/screenshots/windrend-stormveil-shadewolf-mount/`.
- **Solmane the Sunveil Charger**: a sixth rideable mount, the paladin's story
  mount (Solar Step ability), the best-rigged and best-VFX'd mount in the
  catalog. Also lands the rider-hip-bone lock across all six mounts: sockets
  baked into each rig (`RiderSeatL`/`RiderSeatR`, `scripts/lib/mount_rider_seat_sockets.mjs`)
  track the mount's actual animated saddle position every frame, read live via
  `CharacterVisual.mountSeatWorldPosition` (extracted into
  `src/render/mount_rider_lock.ts`), so a rider no longer stays glued to a
  fixed world-space offset through twist/stomp animations. Evidence,
  captured the same way as the other five (real in-game ride, not a bare
  asset-pipeline preview): `docs/screenshots/solmane-charger-mount/`.
