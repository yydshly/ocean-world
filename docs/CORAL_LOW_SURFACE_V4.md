# Low-detail living coral surface, v4

This change addresses two separate defects visible in Root's actual final-v3c [middle view](../output/validation/screenshots/reef-1791012053555-2026-10-03T07-20-53-637Z-42acb6b6.png) and [close view](../output/validation/screenshots/reef-1791012072268-2026-10-03T07-21-12-338Z-f1c3f4fb.png): the static `createCoralLandscape(..., 'low')` branches retain pointed cone shoulders, and the massive boulder coral's polar UVs stretch its tissue pattern into a crown star. This subagent inspected both original PNGs. No post-v4 browser image or visual pass is claimed here; Root performs that check with the integrated World/terrain changes.

## Low branching and table geometry

Only six-sided, detail-0 axial landscape shells use the new allocation. The previous shell has three shaft rings, an axial lip and a narrow inner ring. The new shell keeps all three shaft rings and the original lip, inserts a rounded outer shoulder at 62% of the cap span, and replaces the narrow inner ring with an exact-position copy of the lip carrying independent inward cup normals. That inner lip connects directly to the original recessed mouth pole. The outer and inner lip edges geometrically coincide; there is no zero-length triangle strip between them.

At six sides, removing the former lip-to-inner-ring strip saves 12 triangles; the inserted shoulder costs exactly 12. Each eligible axial limb still has 60 triangles. The same six sides, original colony RNG, growth controls, radii, corallite outer-diameter/depth values, radial cups, lip, mouth pole and basal foot remain. The internal cup wall is now a single closed cone at this LOD, an authored approximation rather than measured anatomy. Named specimen geometry and every medium/high landscape position/index/normal/UV/color buffer remain byte-identical to final v3c.

The new shoulder uses the rounded profile already evaluated for v3c normals. Its radius is constrained to the AABB reconstructed from the original limb, including its removed inner ring. Only the new ring's scalar radius changes under this constraint. The finite-difference normal sampler evaluates the same constrained radius function and angular relief; candidate normals must still face all adjacent drawn wall triangles. A single deterministic retry retains the complete old shell when that bound leaves less than 2% shoulder bulge over the original linear cone. It consumes no RNG. This prevents an envelope constraint from creating a narrower tip.

The [final 40-variant inspection](../output/validation/coral-low-surface-inspection-v4a.json) compares against the [saved final-v3c source](../output/validation/organisms-before-coral-v4.mjs) and [baseline metadata](../output/validation/coral-before-v4.json). All actual colony AABB endpoints are exactly unchanged (`delta = 0` in Float32 geometry). Inserted shoulders have a measured positive radius bulge; the smallest is 2.040%. The maximum is recorded per variant. These are shape measurements, separate from the smooth-normal changes.

| Low variant | Triangles, unchanged | Rounded shoulders / axial limbs | Retained old axial tips | Added vertices | Added geometry bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| table / 0 | 5,976 | 72 / 72 | 0 | 504 | 22,176 |
| table / 1 | 5,976 | 71 / 72 | 1 | 497 | 21,868 |
| table / 2 | 5,976 | 70 / 72 | 2 | 490 | 21,560 |
| table / 3 | 5,976 | 72 / 72 | 0 | 504 | 22,176 |
| branching / 0 | 5,940 | 81 / 84 | 3 | 567 | 24,948 |
| branching / 1 | 5,940 | 82 / 84 | 2 | 574 | 25,256 |
| branching / 2 | 5,940 | 75 / 84 | 9 | 525 | 23,100 |
| branching / 3 | 5,940 | 77 / 84 | 7 | 539 | 23,716 |

The extra vertices include the separate lip-normal ownership and shoulder sampling; index-buffer triangle count stays unchanged. Each colony retains one geometry, one material, two textures and one main draw. No texture pixels change. Across all 40 variants: no nonfinite attribute or invalid index, no negative face-versus-mean-vertex-normal triangle, minimum oriented face dot `0.1607123980`. Across the 28 branch-bearing variants: closed welded shells with zero boundary/nonmanifold edges, exact duplicate-seam normals, minimum outward shaft dot `0.3470853692`, maximum inward cup dot `-0.5708368257`. These CPU checks do not prove visual tissue quality or biological fusion at overlapping branch junctions.

## Massive boulder tissue UVs

Boulder XYZ, normals, vertex colors and indexed topology remain byte-identical at all 4 variants × 3 LODs. Only UVs change from `(angle / TAU × 4, radialFraction × 2.5)` to `(localX / 0.21504, localZ / 0.192)`. The texture is actually 256×256 pixels with an 8-pixel cell, giving 32 cells per repeat. The unchanged texture's horizontal distance uses a 1.12 factor, so these denominators give 6.72×6 mm projected cell spacing and approximately 2.88 mm projected authored cup-lip diameter in both directions before instance scaling. This preserves a close-set millimetre tissue proxy while removing the polar singularity and angular seam.

All 12 actual boulder variants have finite UVs, consistent negative UV triangle winding and no UV-degenerate crown fan. Maximum mapping error is `2.41523e-7` repeats, welded seam difference is below `1e-6`, and the smallest absolute UV triangle determinant is `5.20855e-5`. Low/medium/high boulder triangle budgets remain 3,096 / 6,048 / 11,648. Original map and bump-map pixel hashes are retained in each final report row.

This is local metre projection. World's existing boulder instance scale enlarges the tissue pattern, and steep sidewalls still stretch a planar projection. The original tissue texture is an authored display proxy; this change does not establish measured species microstructure or improve the boulder silhouette itself.

## Validation, cost and evidence identity

[Three current v4 tests](../tests/coral-low-surface.test.mjs) passed. They explicitly require 8 compact-cup variants, 28 branch-bearing variants and 12 boulder variants so a missing report field cannot produce an empty filtered assertion. [Three historical v3c tests](../tests/coral-limb-surface.test.mjs) also passed against the saved final-v3c snapshot; their names and helper make that historical scope explicit. [Four real reef spatial-query tests](../tests/reef-spatial-queries.test.mjs), including 1,000 nearest/obstruction comparisons on actual coral meshes, passed with the current source. Root owns full integrated regression and real browser verification; this subagent did not edit dist or build frozen artifacts.

A separate [independent read-only audit](../output/validation/coral-low-directed-edges-review-v4.json) checks all 8 actual low table/branching variants more strictly: at 1 µm welding tolerance, every edge occurs exactly twice with opposite directed winding; bad edges are zero. The compact cup triangles have minimum tip-axis normal dot `0.6642382757` and maximum radial dot `-0.7086272837`, confirming inward concavity winding. In-memory instrumentation compares the actual `pointAt(frame, angle)` samples against the double-precision positions being written: maximum error is exactly zero, including bounded shoulders. This is a sampler-position consistency check, not an exact-normal or browser-lighting proof. The [audit script](../output/validation/review-coral-low-directed-edges-v4.mjs) can repeat with `--check-only` without overwriting evidence and verifies that source hash, mtime and ctime stay unchanged.

The [CPU preparation sample](../output/validation/coral-preparation-cpu-v4.json) uses three alternating-order pairs of 16 freshly prepared/disposed colonies (4 named, 4 low branching, 4 low table, 4 low boulder). Final-v3c mean was 801.895 ms; current v4 mean was 862.539 ms: +60.644 ms per 16 colonies, or +7.56%. Individual differences were +33.959, -2.085 and +150.057 ms. This includes procedural texture creation, JIT and GC; it measures CPU preparation only, not browser frame time, GPU work, full World initialization or a stable performance guarantee.

| Artifact | SHA-256 |
| --- | --- |
| Current `src/world/organisms.js` | `1bd30f3f59308f98abb124874b5bb3ba08a674870d95a4c4a6f4941a6f59403c` |
| Saved final-v3c source | `92e8606b4896f723cc40a518f4e2f8aafb844d51d7c409396f2b9085a86538a5` |
| v4 baseline metadata | `9d74fabf2ffbd62b92b6d0c06317b68714b2a81996b38bf4d38e39664b3f1311` |
| Final v4a geometry/UV report | `f2f29bc9c50aee42b8524a8cc07c61a9185a0c77a47697ab84e2633c393fdf89` |
| v4 CPU preparation report | `eff1e3b9ac677d6a19c03fa4f5f6a60a71f4b264d6b6c75c74c38ac302202da4` |
| Validation notes | `8d640db061510a718a85a4e9b5c641ff43056175300e86d03ebd2c1b53ab5945` |
| Independent directed-edge/sampler audit | `291989ebaf501279a825950c112ce7a47a8ac33009999d690a912e55f039a6e1` |

The first v4 report is preserved, but its missing `row.corallites` field made one filtered regression assertion empty. It is excluded from the final validation gate. The corrected helper, explicit sample counts and successful rerun are saved in v4a; application source stayed at the same hash. [Validation notes](../output/validation/coral-v4-validation-notes.json) record that issue and earlier failed development attempts without claiming retained failed-source snapshots. All [v3/v3c surface evidence](CORAL_LIMB_SURFACE_V3.md) remains unchanged.

Outside `coralLimb` and the exact boulder UV substitution, source comparison is unchanged after line-ending normalization. Fish anatomy/LOD, creature behavior, RNG, materials, ecology, habitat, World, UI, terrain, scan assets and six progress documents were outside this edit scope. Root's separately owned integration changes require their own evidence.
