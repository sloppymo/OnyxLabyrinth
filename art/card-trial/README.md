# Card Trial illustration sources

- `cards/*.aseprite` are the editable native 128×96 production masters.
- `public/assets/card-trial/cards/*.png` are the runtime-ready exports.
- `references/rat-king-identity.png` and `references/old-man-identity.png` are
  identity references only; their battlefield density is not the card-art target.
- `references/king-of-the-heap-composition.png` is the composition/style anchor.

The five previously approved illustrations (`nip`, `king-of-the-heap`, `tide`,
`swarm-the-wound`, `staff`) remain unchanged. The other 17 cards use the same
chunky native-scale language and are reviewed in the art ledger under
`docs/card-trial-art-review/`.

For a new native candidate, import it with:

```sh
aseprite -b candidate.png --script scripts/art/aseprite-card-trial-finish.lua
```

The finish pass adds a `Pixel cleanup` layer and normalizes only meaningless
near-black noise; it does not flatten meaningful dark midtones or resize art.
