# Mount fixes: Grimtusk saddle, Cinderhide facing, Nightprowl panther

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
