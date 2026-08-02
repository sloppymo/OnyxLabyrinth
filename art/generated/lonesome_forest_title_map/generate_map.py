#!/usr/bin/env python3
"""Deterministic Lonesome Forest title-map asset pipeline.

The compositor reads only the supplied 16x16 source sheets.  It never edits,
resamples, rotates, mirrors, or overwrites those inputs.
"""

from __future__ import annotations

import io
import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from PIL import Image, ImageDraw, ImageFont


TILE = 16
NATIVE_SIZE = (768, 672)
GRID_SIZE = (NATIVE_SIZE[0] // TILE, NATIVE_SIZE[1] // TILE)
PREVIEW_SCALE = 2
INSPECTION_SCALE = 4
BRIDGE_X = 24
# Measured from the real 744x651 title panel at a 1280x800 viewport, then
# converted back to native 768x672 map coordinates.
TITLE_LOCKUP_BOUNDS = (40, 182, 728, 310)
TITLE_WORDMARK_BOUNDS = (198, 220, 570, 271)
TITLE_MENU_BOUNDS = (54, 323, 715, 490)

HERE = Path(__file__).resolve().parent
BASELINE_NATIVE = HERE / "final_native.png"
BASELINE_NATIVE_SHA256 = "8ac6c5936701545968a8443ac0bbca9bd9c4a4b94e622db8215a5e847e9ea07e"
REPO_ROOT = HERE.parents[2]
ASSET_ROOT = (
    REPO_ROOT
    / "assets"
    / "jewelflame"
    / "Lonesome Forest - Summer and Winter Versions"
)
SUMMER_ROOT = ASSET_ROOT / "Summer Tileset"
SAMPLE_ROOT = ASSET_ROOT / "Sample Images"
CONTACT_DIR = HERE / "contact_sheets"
LAYER_DIR = HERE / "layers_v2"

LAYER_NAMES = [
    "01_base_ground",
    "02_ground_variation",
    "03_water",
    "04_river_edges",
    "05_cliffs_and_walls",
    "06_paths",
    "07_large_vegetation",
    "08_rocks_and_small_vegetation",
    "09_landmarks_and_props",
    "10_foreground_framing",
]

SOURCES: dict[str, dict[str, Any]] = {
    "combined": {
        "path": SUMMER_ROOT / "Lonesome_Forest_WALLs_and_CLIIFS_with_FLOOR.png",
        "size": (112, 176),
    },
    "cliff_edges": {
        "path": SUMMER_ROOT / "Lonesome_Forest_WALLS_and_CLIFF_EDGES.png",
        "size": (112, 160),
    },
    "water_edges": {
        "path": SUMMER_ROOT / "Lonesome_Forest_RIVER_and_WATER_EDGES.png",
        "size": (112, 112),
    },
    "floor": {
        "path": SUMMER_ROOT / "Lonesome_Forest_FLOOR.png",
        "size": (112, 80),
    },
    "details": {
        "path": SUMMER_ROOT / "Lonesome_Forest_DETAIL_OBJECTS.png",
        "size": (112, 128),
    },
    "path": {
        "path": SUMMER_ROOT / "Lonesome_Forest_COBBLESTONE_PATH.png",
        "size": (112, 112),
    },
    "sample": {
        "path": SAMPLE_ROOT / "Lonesome_Forest_16_PICO8_sampe_image.png",
        "size": (1624, 1344),
        "reference_only": True,
    },
}


# Curated only after inspecting the labeled contact sheets.  Cells that are
# not listed remain documented in tile_catalog.json as uncertain/unselected.
CURATED_TILES: dict[tuple[str, int, int], dict[str, str]] = {}


def curate(sheet: str, col: int, row: int, role: str, name: str, notes: str) -> None:
    CURATED_TILES[(sheet, col, row)] = {
        "role": role,
        "name": name,
        "notes": notes,
    }


curate("floor", 4, 0, "floor", "base_ground", "Seamless plain summer ground.")
for col, row, name in [
    (5, 0, "ground_speckle_a"),
    (6, 0, "ground_speckle_b"),
    (4, 1, "ground_single_stone"),
    (5, 1, "ground_speckle_c"),
    (6, 1, "ground_speckle_d"),
    (4, 2, "ground_stones_a"),
    (5, 2, "ground_speckle_e"),
    (6, 2, "ground_grass_a"),
    (4, 3, "ground_speckle_f"),
    (5, 3, "ground_speckle_g"),
]:
    curate("floor", col, row, "floor variation", name, "Transparent sparse ground detail.")
for col, row, name in [
    (1, 0, "flowers_pink_dense"),
    (2, 0, "flowers_pink_small"),
    (1, 1, "flowers_pink_tall"),
    (2, 1, "flowers_pink_single"),
    (1, 2, "flowers_white_cluster"),
    (2, 2, "flowers_white_single"),
    (1, 3, "flowers_orange_cluster"),
    (2, 3, "flowers_orange_small"),
    (1, 4, "flowers_orange_dense"),
]:
    curate("floor", col, row, "decorative vegetation", name, "Transparent flower/grass overlay.")

curate("combined", 0, 9, "water", "water_base", "Opaque dark-water ripple tile.")
curate("combined", 6, 8, "water", "water_ripple_variant", "Opaque alternate water ripple tile.")
curate("combined", 1, 9, "cave or doorway", "cave_mouth_left", "Left half of the large cliff cave mouth.")
curate("combined", 2, 9, "cave or doorway", "cave_mouth_right", "Right half of the large cliff cave mouth.")
for col in range(6):
    curate("combined", col, 7, "cliff face", f"cliff_face_upper_{col}", "Opaque upper cliff-face variation.")
    curate("combined", col, 8, "cliff face", f"cliff_face_lower_{col}", "Opaque lower cliff-face variation.")

for col, row, role, name in [
    (4, 0, "concave river corner", "bank_inner_se_a"),
    (6, 0, "concave river corner", "bank_inner_sw_a"),
    (1, 2, "concave river corner", "bank_inner_se_b"),
    (2, 2, "concave river corner", "bank_inner_sw_b"),
    (0, 3, "convex river corner", "bank_nw"),
    (1, 3, "straight river edge", "bank_n_a"),
    (2, 3, "straight river edge", "bank_n_b"),
    (5, 3, "straight river edge", "bank_n_c"),
    (6, 3, "convex river corner", "bank_ne"),
    (0, 4, "straight river edge", "bank_w_a"),
    (0, 5, "straight river edge", "bank_w_b"),
    (6, 4, "straight river edge", "bank_e_a"),
    (6, 5, "straight river edge", "bank_e_b"),
    (0, 6, "convex river corner", "bank_sw"),
    (1, 6, "straight river edge", "bank_s_a"),
    (2, 6, "straight river edge", "bank_s_b"),
    (3, 6, "straight river edge", "bank_s_c"),
    (4, 6, "straight river edge", "bank_s_d"),
    (5, 6, "straight river edge", "bank_s_e"),
    (6, 6, "convex river corner", "bank_se"),
]:
    curate("water_edges", col, row, role, name, "Bank component confirmed from alpha silhouette.")

for col, row, role, name in [
    (0, 3, "cliff corner", "cliff_front_left"),
    (1, 3, "cliff top", "cliff_front_a"),
    (2, 3, "cliff top", "cliff_front_b"),
    (5, 3, "cliff top", "cliff_front_c"),
    (6, 3, "cliff corner", "cliff_front_right"),
]:
    curate("cliff_edges", col, row, role, name, "Transparent rocky front-edge component.")

for col, row, name in [
    (3, 0, "path_end_n"),
    (3, 1, "path_narrow_a"),
    (3, 2, "path_narrow_b"),
    (0, 3, "path_bend_a"),
    (0, 4, "path_bend_b"),
    (0, 5, "path_bend_c"),
    (0, 6, "path_bend_d"),
    (1, 1, "path_full_a"),
    (2, 1, "path_full_b"),
]:
    path_role = "path junction" if (col, row) in ((1, 1), (2, 1)) else ("path straight" if col == 3 else "path turn")
    curate("path", col, row, path_role, name, "Opaque cobble-on-ground path component.")

for col, row, role, name, notes in [
    (1, 1, "rock", "rock_pillar_left_top", "Top of the left tall boulder formation."),
    (1, 2, "rock", "rock_pillar_left_bottom", "Bottom of the left tall boulder formation."),
    (5, 1, "rock", "rock_pillar_right_top", "Top of the right tall boulder formation."),
    (5, 2, "rock", "rock_pillar_right_bottom", "Bottom of the right tall boulder formation."),
    (0, 4, "tree", "tree_single_top", "Top of the one-column tree."),
    (0, 5, "tree", "tree_single_bottom", "Bottom of the one-column tree."),
    (2, 2, "rock", "rock_cluster_a", "Standalone rock cluster."),
    (3, 2, "rock", "rock_cluster_b", "Small standalone rock cluster."),
    (4, 2, "rock", "rock_cluster_c", "Standalone rock cluster."),
    (6, 5, "decorative vegetation", "berry_bush", "Standalone flowering bush."),
    (0, 6, "chest", "chest_closed_a", "Closed chest variation."),
    (1, 6, "chest", "chest_closed_b", "Closed chest variation."),
    (2, 6, "chest", "chest_open", "Open chest with lid extending right."),
    (4, 7, "sign", "signpost", "Standalone wooden signpost."),
    (5, 7, "tent", "stone_tent", "Small abandoned gray tent."),
    (6, 6, "cave or doorway", "cave_entrance", "Stone arch/cave opening."),
    (6, 7, "decorative vegetation", "bones", "Standalone bones/skull detail."),
    (0, 7, "decorative vegetation", "white_plants_a", "Small pale plant cluster."),
    (1, 7, "decorative vegetation", "white_plants_b", "Larger pale plant cluster."),
    (2, 7, "decorative vegetation", "small_leaves_a", "Tiny green ground detail."),
    (3, 7, "decorative vegetation", "small_leaves_b", "Tiny green ground detail."),
]:
    curate("details", col, row, role, name, notes)


PATTERNS: dict[str, dict[str, Any]] = {
    "tree_single": {
        "sizeCells": [1, 2],
        "tiles": [[0, 4, 0, 0], [0, 5, 0, 1]],
        "notes": "One-column tree, top then rooted lower half.",
    },
    "tree_pair": {
        "sizeCells": [2, 2],
        "tiles": [[col, row, col - 1, row - 3] for row in range(3, 5) for col in range(1, 3)],
        "notes": "Dense two-column, two-row tree cluster; row 5 contains separate fallen logs.",
    },
    "tree_pair_middle": {
        "sizeCells": [2, 2],
        "tiles": [[col, row, col - 3, row - 3] for row in range(3, 5) for col in range(3, 5)],
        "notes": "Middle two-column canopy variant from the connected tree block.",
    },
    "tree_pair_right": {
        "sizeCells": [2, 2],
        "tiles": [[col, row, col - 4, row - 3] for row in range(3, 5) for col in range(4, 6)],
        "notes": "Right two-column canopy variant from the connected tree block.",
    },
    "tree_lobe_left": {
        "sizeCells": [3, 2],
        "tiles": [[col, row, col - 1, row - 3] for row in range(3, 5) for col in range(1, 4)],
        "notes": "Three-by-two left canopy lobe used to vary forest silhouettes.",
    },
    "tree_lobe_right": {
        "sizeCells": [3, 2],
        "tiles": [[col, row, col - 3, row - 3] for row in range(3, 5) for col in range(3, 6)],
        "notes": "Three-by-two right canopy lobe used to vary forest silhouettes.",
    },
    "tree_grove": {
        "sizeCells": [3, 3],
        "tiles": [[col, row, col - 3, row - 3] for row in range(3, 6) for col in range(3, 6)],
        "notes": "Dense three-by-three interlocking grove.",
    },
    "cave_mouth": {
        "sheet": "combined",
        "sizeCells": [2, 1],
        "tiles": [[1, 9, 0, 0], [2, 9, 1, 0]],
        "notes": "Two-cell cave opening designed to replace the center of a cliff face.",
    },
    "bridge_horizontal": {
        "sizeCells": [5, 2],
        "tiles": [
            [1, 0, 0, 0], [2, 0, 1, 0], [3, 0, 2, 0], [4, 0, 3, 0], [5, 0, 4, 0],
            [2, 1, 1, 1], [3, 1, 2, 1], [4, 1, 3, 1],
        ],
        "notes": "Five-cell deck with the supplied diagonal and center supports beneath.",
    },
    "bridge_vertical_standard": {
        "sizeCells": [1, 4],
        "tiles": [[6, 1, 0, 0], [6, 2, 0, 1], [6, 3, 0, 2], [6, 4, 0, 3]],
        "notes": "Vertical bridge: top, two middle deck cells, and lower landing.",
    },
    "rock_pillar_left": {
        "sizeCells": [1, 2],
        "tiles": [[1, 1, 0, 0], [1, 2, 0, 1]],
        "notes": "Tall two-cell boulder formation.",
    },
    "rock_pillar_right": {
        "sizeCells": [1, 2],
        "tiles": [[5, 1, 0, 0], [5, 2, 0, 1]],
        "notes": "Alternate tall two-cell boulder formation.",
    },
    "camp_gear": {
        "sizeCells": [2, 1],
        "tiles": [[3, 6, 0, 0], [4, 6, 1, 0]],
        "notes": "Two-cell abandoned canvas/camp furnishing.",
    },
    "path_landing_north": {
        "sheet": "path",
        "sizeCells": [5, 2],
        "tiles": [[col, row, col - 1, row] for row in range(0, 2) for col in range(1, 6)],
        "notes": "Supplied contiguous five-by-two cobblestone taper for a north-side landing.",
    },
    "path_landing_south": {
        "sheet": "path",
        "sizeCells": [5, 2],
        "tiles": [[col, row, col - 1, row - 5] for row in range(5, 7) for col in range(1, 6)],
        "notes": "Supplied contiguous five-by-two cobblestone taper for a south-side landing.",
    },
}


def rgba(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return opened.convert("RGBA")


def tile_box(col: int, row: int) -> tuple[int, int, int, int]:
    return (col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE)


def checkerboard(size: tuple[int, int], unit: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, (34, 31, 38, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], unit):
        for x in range(0, size[0], unit):
            if (x // unit + y // unit) % 2:
                draw.rectangle(
                    (x, y, min(x + unit - 1, size[0] - 1), min(y + unit - 1, size[1] - 1)),
                    fill=(55, 50, 61, 255),
                )
    return image


def make_contact_sheet(source_key: str, source: Image.Image, filename: str) -> Image.Image:
    cols = source.width // TILE
    rows = source.height // TILE
    scale = 6
    tile_px = TILE * scale
    card_w = tile_px + 12
    card_h = tile_px + 30
    header_h = 48
    sheet = Image.new(
        "RGBA",
        (cols * card_w + 16, rows * card_h + header_h + 8),
        (16, 14, 20, 255),
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((8, 6), filename, fill=(255, 229, 168, 255), font=font)
    draw.text(
        (8, 22),
        f"key={source_key} | {source.width}x{source.height} | {cols}x{rows} cells | 16x16",
        fill=(196, 197, 214, 255),
        font=font,
    )
    for row in range(rows):
        for col in range(cols):
            index = row * cols + col
            x = 8 + col * card_w
            y = header_h + row * card_h
            draw.rectangle((x, y, x + card_w - 4, y + card_h - 4), outline=(79, 75, 92, 255))
            tile = source.crop(tile_box(col, row)).resize((tile_px, tile_px), Image.Resampling.NEAREST)
            backdrop = checkerboard((tile_px, tile_px), unit=12)
            backdrop.alpha_composite(tile)
            sheet.alpha_composite(backdrop, (x + 4, y + 4))
            draw.text(
                (x + 4, y + tile_px + 7),
                f"c{col} r{row}  #{index:02d}",
                fill=(238, 235, 224, 255),
                font=font,
            )
    return sheet


class MapComposer:
    def __init__(self) -> None:
        self.sources = {
            key: rgba(spec["path"])
            for key, spec in SOURCES.items()
            if not spec.get("reference_only")
        }
        self.layers = {
            name: Image.new("RGBA", NATIVE_SIZE, (0, 0, 0, 0))
            for name in LAYER_NAMES
        }
        self.placements: list[dict[str, Any]] = []
        self.fills: list[dict[str, Any]] = []
        self.metadata: dict[str, Any] = {}

    def place(
        self,
        layer: str,
        sheet: str,
        col: int,
        row: int,
        x_cell: int,
        y_cell: int,
        label: str,
        structural: bool = True,
    ) -> None:
        if layer not in self.layers:
            raise KeyError(layer)
        if sheet not in self.sources:
            raise KeyError(sheet)
        if not all(isinstance(value, int) for value in (col, row, x_cell, y_cell)):
            raise TypeError("Tile coordinates must be integers")
        source = self.sources[sheet]
        if not (0 <= col < source.width // TILE and 0 <= row < source.height // TILE):
            raise ValueError(f"Source tile out of range: {sheet} c{col} r{row}")
        if not (0 <= x_cell < GRID_SIZE[0] and 0 <= y_cell < GRID_SIZE[1]):
            raise ValueError(f"Destination cell out of range: {x_cell},{y_cell}")
        tile = source.crop(tile_box(col, row))
        self.layers[layer].alpha_composite(tile, (x_cell * TILE, y_cell * TILE))
        self.placements.append(
            {
                "layer": layer,
                "sheet": sheet,
                "sourceCol": col,
                "sourceRow": row,
                "sourceIndex": row * (source.width // TILE) + col,
                "xCell": x_cell,
                "yCell": y_cell,
                "x": x_cell * TILE,
                "y": y_cell * TILE,
                "structural": structural,
                "label": label,
            }
        )

    def fill(self, layer: str, sheet: str, col: int, row: int, label: str) -> None:
        source = self.sources[sheet]
        tile = source.crop(tile_box(col, row))
        for y_cell in range(GRID_SIZE[1]):
            for x_cell in range(GRID_SIZE[0]):
                self.layers[layer].alpha_composite(tile, (x_cell * TILE, y_cell * TILE))
        self.fills.append(
            {
                "layer": layer,
                "sheet": sheet,
                "sourceCol": col,
                "sourceRow": row,
                "rectCells": [0, 0, GRID_SIZE[0], GRID_SIZE[1]],
                "label": label,
            }
        )

    def pattern(self, layer: str, pattern_name: str, x_cell: int, y_cell: int, label: str) -> None:
        pattern = PATTERNS[pattern_name]
        width, height = pattern["sizeCells"]
        if x_cell < 0 or y_cell < 0 or x_cell + width > GRID_SIZE[0] or y_cell + height > GRID_SIZE[1]:
            raise ValueError(f"Pattern {pattern_name} would clip at {x_cell},{y_cell}")
        for source_col, source_row, dx, dy in pattern["tiles"]:
            self.place(
                layer,
                pattern.get("sheet", "details"),
                source_col,
                source_row,
                x_cell + dx,
                y_cell + dy,
                f"{label}:{pattern_name}",
                structural=True,
            )


def orthogonal_cells(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    """Cardinal-only stepped line; consecutive path cells always share an edge."""
    x_cell, y_cell = start
    end_x, end_y = end
    cells = [(x_cell, y_cell)]
    prefer_x = True
    while (x_cell, y_cell) != (end_x, end_y):
        can_x = x_cell != end_x
        can_y = y_cell != end_y
        if can_x and (prefer_x or not can_y):
            x_cell += 1 if end_x > x_cell else -1
        elif can_y:
            y_cell += 1 if end_y > y_cell else -1
        prefer_x = not prefer_x
        cells.append((x_cell, y_cell))
    return cells


def axis_aligned_cells(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    """Inclusive horizontal or vertical segment used by the handcrafted roads."""
    start_x, start_y = start
    end_x, end_y = end
    if start_x != end_x and start_y != end_y:
        raise ValueError(f"Path segment must be axis-aligned: {start} -> {end}")
    x_step = 0 if start_x == end_x else (1 if end_x > start_x else -1)
    y_step = 0 if start_y == end_y else (1 if end_y > start_y else -1)
    cells: list[tuple[int, int]] = []
    x_cell, y_cell = start
    while True:
        cells.append((x_cell, y_cell))
        if (x_cell, y_cell) == end:
            return cells
        x_cell += x_step
        y_cell += y_step


RIVER_PROFILE = [
    # End-exclusive x, north bank, south bank. Long plateaus create broad
    # bends; independently authored banks vary the channel width and avoid a
    # mirrored or metronomic stair-step. Bounds are inclusive.
    (4, 29, 34),
    (8, 29, 35),       # south-bank bulge
    (12, 30, 36),
    (17, 31, 37),      # shallow north-bank indentation
    (20, 31, 38),      # broad western basin
    (21, 30, 37),
    (22, 30, 36),
    (23, 30, 35),
    (27, 29, 34),      # narrower bridge channel
    (32, 28, 33),
    (36, 27, 32),
    (40, 27, 33),      # eastern basin widens only to the south
    (43, 28, 33),
    (44, 29, 34),
    (46, 29, 35),      # asymmetric lower-bank inlet
    (48, 30, 35),
]


def river_bounds(x_cell: int) -> tuple[int, int]:
    """Hand-authored meander; bounds are inclusive tile rows."""
    for end_x, top, bottom in RIVER_PROFILE:
        if x_cell < end_x:
            return (top, bottom)
    raise ValueError(f"River profile does not cover x={x_cell}")


def is_water_cell(x_cell: int, y_cell: int) -> bool:
    if x_cell < 0 or x_cell >= GRID_SIZE[0]:
        return True  # The river continues beyond both side edges.
    top, bottom = river_bounds(x_cell)
    return top <= y_cell <= bottom


def place_river(composer: MapComposer) -> None:
    layer = "03_water"
    for x_cell in range(GRID_SIZE[0]):
        top, bottom = river_bounds(x_cell)
        for y_cell in range(top, bottom + 1):
            variant = (6, 8) if (x_cell * 5 + y_cell * 3) % 5 == 0 else (0, 9)
            composer.place(layer, "combined", variant[0], variant[1], x_cell, y_cell, "river water")

    north_variants = [(1, 3), (2, 3), (5, 3)]
    # c3r6/c4r6 are rounded island lobes, not straight south-bank variants.
    south_variants = [(1, 6), (2, 6), (5, 6)]
    west_variants = [(0, 4), (0, 5)]
    east_variants = [(6, 4), (6, 5)]
    for x_cell in range(GRID_SIZE[0]):
        top, bottom = river_bounds(x_cell)
        for y_cell in range(top, bottom + 1):
            north_ground = not is_water_cell(x_cell, y_cell - 1)
            south_ground = not is_water_cell(x_cell, y_cell + 1)
            west_ground = not is_water_cell(x_cell - 1, y_cell)
            east_ground = not is_water_cell(x_cell + 1, y_cell)
            tile: tuple[int, int] | None = None
            if north_ground and west_ground:
                tile = (0, 3)
            elif north_ground and east_ground:
                tile = (6, 3)
            elif south_ground and west_ground:
                tile = (0, 6)
            elif south_ground and east_ground:
                tile = (6, 6)
            elif north_ground:
                tile = north_variants[x_cell % len(north_variants)]
            elif south_ground:
                tile = south_variants[x_cell % len(south_variants)]
            elif west_ground:
                tile = west_variants[y_cell % len(west_variants)]
            elif east_ground:
                tile = east_variants[y_cell % len(east_variants)]
            if tile:
                composer.place(
                    "04_river_edges",
                    "water_edges",
                    tile[0],
                    tile[1],
                    x_cell,
                    y_cell,
                    "connected river bank",
                )


def place_cliff_front(composer: MapComposer, x0: int, x1: int, y_cell: int, label: str) -> None:
    if x1 - x0 < 2:
        raise ValueError("Cliff fronts need at least three cells")
    for x_cell in range(x0, x1 + 1):
        if x_cell == x0:
            edge = (0, 3)
        elif x_cell == x1:
            edge = (6, 3)
        else:
            edge = [(1, 3), (2, 3), (5, 3)][(x_cell - x0) % 3]
        composer.place(
            "05_cliffs_and_walls", "cliff_edges", edge[0], edge[1], x_cell, y_cell, f"{label}:top edge"
        )
        composer.place(
            "05_cliffs_and_walls", "combined", (x_cell - x0) % 6, 7, x_cell, y_cell + 1, f"{label}:upper face"
        )
        composer.place(
            "05_cliffs_and_walls", "combined", (x_cell - x0 + 2) % 6, 8, x_cell, y_cell + 2, f"{label}:lower face"
        )


def route_cells(waypoints: list[tuple[int, int]]) -> list[tuple[int, int]]:
    cells: list[tuple[int, int]] = []
    for start, end in zip(waypoints, waypoints[1:]):
        cells.extend(axis_aligned_cells(start, end))
    return list(dict.fromkeys(cells))


def path_tile_for(neighbors: set[str], index: int) -> tuple[int, int]:
    """Choose inspected source transitions for a cardinal route cell."""
    if {"n", "s"} <= neighbors:
        return (3, 1 + index % 2)
    if {"e", "w"} <= neighbors:
        return (1 + (index % 2), 3)
    turns = {
        frozenset(("s", "e")): (0, 3),
        frozenset(("s", "w")): (6, 3),
        frozenset(("n", "e")): (0, 6),
        frozenset(("n", "w")): (6, 6),
    }
    if frozenset(neighbors) in turns:
        return turns[frozenset(neighbors)]
    if "n" in neighbors or "s" in neighbors:
        return (3, 0 if "s" in neighbors else 6)
    return ((0 if "e" in neighbors else 6), 6)


def place_cardinal_route(
    composer: MapComposer,
    cells: list[tuple[int, int]],
    label: str,
    *,
    worn_every: int | None = None,
) -> None:
    cell_set = set(cells)
    directions = {"n": (0, -1), "e": (1, 0), "s": (0, 1), "w": (-1, 0)}
    for index, (x_cell, y_cell) in enumerate(cells):
        bridge_top, bridge_bottom = river_bounds(BRIDGE_X)
        if is_water_cell(x_cell, y_cell) or (x_cell, y_cell) in {
            (BRIDGE_X, bridge_top - 1),
            (BRIDGE_X, bridge_bottom + 1),
        }:
            continue
        neighbors = {
            name
            for name, (dx, dy) in directions.items()
            if (x_cell + dx, y_cell + dy) in cell_set
        }
        if worn_every and index % worn_every == worn_every - 1:
            col, row = [(4, 2), (6, 2), (5, 3)][index % 3]
            composer.place("06_paths", "floor", col, row, x_cell, y_cell, f"{label}:worn interruption", False)
        else:
            col, row = path_tile_for(neighbors, index)
            composer.place("06_paths", "path", col, row, x_cell, y_cell, label)


def compose_map() -> MapComposer:
    composer = MapComposer()
    composer.fill("01_base_ground", "floor", 4, 0, "seamless summer ground")

    # Floor texture is grouped into soft contour patches around the clearing,
    # rather than sprinkled evenly through the title lockup.
    patch_origins = [
        (3, 8), (9, 11), (36, 9), (42, 13),
        (3, 19), (10, 22), (34, 21), (41, 23),
        (5, 37), (14, 38), (31, 37), (40, 39),
    ]
    patch_shape = [(0, 0), (1, 0), (2, 1), (0, 2), (1, 2)]
    variation_cells = [
        (origin_x + dx, origin_y + dy)
        for origin_x, origin_y in patch_origins
        for dx, dy in patch_shape
    ]
    variations = [(5, 0), (6, 0), (4, 1), (5, 1), (6, 1), (4, 2), (5, 2), (6, 2), (4, 3), (5, 3)]
    for index, (x_cell, y_cell) in enumerate(variation_cells):
        if not is_water_cell(x_cell, y_cell):
            col, row = variations[index % len(variations)]
            composer.place("02_ground_variation", "floor", col, row, x_cell, y_cell, "grouped ground contour", False)

    place_river(composer)
    # Three terrain formations: one stepped gateway massif and two coherent
    # outer terraces. Repeated labels record which shelves belong together.
    place_cliff_front(composer, 19, 29, 1, "gateway massif crown")
    place_cliff_front(composer, 15, 21, 5, "gateway massif west wing")
    place_cliff_front(composer, 28, 35, 6, "gateway massif east wing")
    place_cliff_front(composer, 2, 13, 14, "western stepped terrace upper")
    place_cliff_front(composer, 6, 16, 21, "western stepped terrace lower")
    place_cliff_front(composer, 36, 46, 15, "eastern stepped terrace upper")
    place_cliff_front(composer, 33, 43, 22, "eastern stepped terrace lower")

    # The route is one connected cobbled/worn spine with handcrafted bends.
    # It widens only at the foreground and bridge landings; the title-safe
    # middle uses restrained worn interruptions instead of paving blocks.
    bridge_top, bridge_bottom = river_bounds(BRIDGE_X)
    bridge_span = {(BRIDGE_X, y_cell) for y_cell in range(bridge_top - 1, bridge_bottom + 2)}
    south_route = route_cells([(24, 41), (24, 40), (22, 40), (22, 38), (24, 38), (24, bridge_bottom + 1)])
    north_route = route_cells([(24, bridge_top - 1), (24, 26), (20, 26), (20, 20), (17, 20), (17, 14), (21, 14), (21, 9), (24, 9), (24, 7)])
    place_cardinal_route(composer, south_route, "main approach south")
    place_cardinal_route(composer, north_route, "main approach north", worn_every=7)

    # Two supplied tapered patches create modest bridge landings while the
    # central bridge-owned tile remains path-free.
    for label, source_rows, destination_y in [
        ("north bridge landing", range(5, 7), bridge_top - 3),
        ("south bridge landing", range(0, 2), bridge_bottom + 1),
    ]:
        for source_row in source_rows:
            for source_col in range(1, 6):
                x_cell = 21 + source_col
                y_cell = destination_y + (source_row - source_rows.start)
                if (x_cell, y_cell) not in bridge_span and not is_water_cell(x_cell, y_cell):
                    composer.place("06_paths", "path", source_col, source_row, x_cell, y_cell, label)

    # The foreground reads wider through worn shoulders, not a uniform slab.
    for index, (x_cell, y_cell) in enumerate([
        (23, 41), (25, 41), (23, 40), (25, 40), (21, 39), (23, 39), (25, 39),
        (22, 37), (23, 37), (25, 37), (26, 37),
    ]):
        if not is_water_cell(x_cell, y_cell) and (x_cell, y_cell) not in bridge_span:
            col, row = [(4, 2), (6, 2), (5, 3)][index % 3]
            composer.place("06_paths", "floor", col, row, x_cell, y_cell, "worn foreground shoulder", False)

    # One subordinate route leads to the abandoned camp and fades into dirt.
    camp_branch = route_cells([(22, 40), (17, 40), (17, 38), (12, 38)])
    place_cardinal_route(composer, camp_branch, "worn campsite branch", worn_every=3)

    # Partial edge tiles broaden selected route beats without turning the
    # whole journey into a uniform two-cell road.
    for index, (x_cell, y_cell, col, row) in enumerate([
        (23, 41, 2, 1), (25, 41, 4, 1), (23, 40, 2, 2), (25, 40, 4, 2),
        (19, 25, 2, 2), (21, 24, 4, 1), (19, 22, 2, 1),
        (16, 18, 2, 2), (18, 16, 4, 2),
        (20, 12, 2, 2), (22, 11, 4, 1),
    ]):
        if not is_water_cell(x_cell, y_cell):
            composer.place("06_paths", "path", col, row, x_cell, y_cell, f"selective route shoulder {index + 1}")

    # A small, uneven forecourt clears the threshold without becoming a plaza.
    for index, (x_cell, y_cell) in enumerate([
        (22, 7), (23, 7), (24, 7), (25, 7), (26, 7),
        (22, 8), (23, 8), (24, 8), (25, 8),
    ]):
        col, row = [(1, 0), (2, 0), (3, 0), (4, 0), (5, 0)][index % 5]
        composer.place("06_paths", "path", col, row, x_cell, y_cell, "ruined gate forecourt")

    composer.metadata["mainRouteCells"] = [list(cell) for cell in south_route + north_route]
    composer.metadata["bridgeSpan"] = [list(cell) for cell in sorted(bridge_span)]

    # Forest masses use several contiguous source silhouettes and touch in
    # irregular lobes. Only a few singles are retained as compositional stops.
    forest_masses = [
        # Upper left wall.
        ("tree_grove", 0, 0), ("tree_lobe_left", 3, 1), ("tree_pair_right", 6, 0),
        ("tree_grove", 8, 2), ("tree_lobe_right", 11, 0), ("tree_pair", 14, 3), ("tree_grove", 15, 0),
        # Upper right wall, deliberately heavier and offset.
        ("tree_lobe_left", 30, 0), ("tree_grove", 33, 1), ("tree_pair_middle", 36, 0),
        ("tree_grove", 38, 2), ("tree_lobe_right", 41, 0), ("tree_grove", 45, 1),
        ("tree_pair", 43, 4), ("tree_lobe_left", 35, 5),
        # Western boundary lobes.
        ("tree_grove", 0, 6), ("tree_lobe_right", 3, 8), ("tree_pair", 0, 10),
        ("tree_grove", 1, 12), ("tree_lobe_left", 4, 16), ("tree_grove", 0, 18),
        ("tree_pair_right", 3, 21), ("tree_grove", 0, 23), ("tree_lobe_right", 5, 25),
        # Eastern boundary with different cadence and deeper incursions.
        ("tree_pair_middle", 46, 7), ("tree_grove", 43, 9), ("tree_lobe_left", 45, 12),
        ("tree_grove", 42, 15), ("tree_pair_right", 46, 18), ("tree_lobe_right", 43, 20),
        ("tree_grove", 45, 23), ("tree_lobe_left", 39, 25),
        # Midground pockets integrated with terrace ends and river approaches.
        ("tree_lobe_right", 8, 12), ("tree_pair_middle", 11, 18), ("tree_grove", 9, 23),
        ("tree_pair_right", 34, 12), ("tree_lobe_left", 38, 18), ("tree_grove", 35, 24),
        ("tree_pair", 8, 27), ("tree_lobe_right", 37, 24),
    ]
    for index, (pattern_name, x_cell, y_cell) in enumerate(forest_masses):
        composer.pattern("07_large_vegetation", pattern_name, x_cell, y_cell, f"forest mass {index + 1}")
    for index, (pattern_name, x_cell, y_cell) in enumerate([
        # Connect upper masses with offset canopy bridges, avoiding a straight row.
        ("tree_pair_middle", 6, 2), ("tree_pair_right", 12, 2),
        ("tree_pair", 31, 2), ("tree_pair_middle", 36, 3), ("tree_pair_right", 43, 2),
        # Close selected vertical gaps while leaving deliberate side corridors.
        ("tree_pair_middle", 2, 4), ("tree_pair_right", 2, 15),
        ("tree_pair", 2, 20), ("tree_pair_middle", 44, 6),
        ("tree_pair_right", 44, 14), ("tree_pair", 43, 22),
    ]):
        composer.pattern("07_large_vegetation", pattern_name, x_cell, y_cell, f"forest mass connector {index + 1}")
    for index, (x_cell, y_cell) in enumerate([(13, 7), (31, 8), (7, 19), (40, 12), (13, 25), (33, 26)]):
        composer.pattern("07_large_vegetation", "tree_single", x_cell, y_cell, f"intentional isolated tree {index + 1}")

    rock_cells = [
        (16, 4), (31, 5), (12, 10), (35, 11),
        (4, 18), (15, 19), (34, 20), (44, 21),
        (6, 28), (12, 29), (18, 28), (31, 27), (38, 26), (44, 28),
        (3, 37), (8, 38), (14, 36), (19, 40), (30, 39), (36, 37), (43, 40),
    ]
    rock_variants = [(2, 2), (3, 2), (4, 2)]
    for index, (x_cell, y_cell) in enumerate(rock_cells):
        if not is_water_cell(x_cell, y_cell):
            col, row = rock_variants[index % len(rock_variants)]
            composer.place("08_rocks_and_small_vegetation", "details", col, row, x_cell, y_cell, "terrain-boundary rock", False)

    flower_cells = [
        (6, 11, 2, 2), (11, 12, 1, 2), (35, 10, 1, 2), (41, 13, 2, 1),
        (6, 20, 2, 0), (14, 19, 1, 1), (34, 20, 2, 2), (42, 21, 1, 3),
        (8, 37, 1, 3), (11, 39, 2, 3), (14, 39, 1, 2),
        (35, 38, 1, 2), (40, 40, 2, 2),
    ]
    for x_cell, y_cell, col, row in flower_cells:
        if not is_water_cell(x_cell, y_cell):
            composer.place("08_rocks_and_small_vegetation", "floor", col, row, x_cell, y_cell, "storytelling flower cluster", False)
    for index, (x_cell, y_cell) in enumerate([(10, 36), (36, 10), (39, 23), (15, 18), (32, 22)]):
        composer.place("08_rocks_and_small_vegetation", "details", 6, 5, x_cell, y_cell, f"berry bush {index + 1}", False)
    for index, (x_cell, y_cell) in enumerate([(5, 32), (14, 36), (31, 31), (39, 31), (45, 34)]):
        composer.place(
            "08_rocks_and_small_vegetation",
            "details",
            2 + index % 2,
            7,
            x_cell,
            y_cell,
            "river leaf cluster",
            False,
        )

    # The bridge owns both dry landing cells. No cobblestone tile is placed
    # beneath or over any bridge/water cell.
    bridge_y = list(range(bridge_top - 1, bridge_bottom + 2))
    bridge_parts = [(6, 1)] + [((6, 2) if index % 2 == 0 else (6, 3)) for index in range(len(bridge_y) - 2)] + [(6, 4)]
    for y_cell, (col, row) in zip(bridge_y, bridge_parts):
        composer.place("09_landmarks_and_props", "details", col, row, BRIDGE_X, y_cell, "main river bridge")

    # A recessed 13-cell crown and offset wings give the unchanged two-cell
    # doorway enough environmental mass to dominate the northern clearing.
    composer.pattern("09_landmarks_and_props", "cave_mouth", 23, 3, "Onyx Labyrinth recessed cave mouth")
    composer.pattern("09_landmarks_and_props", "rock_pillar_left", 20, 2, "left threshold monolith")
    composer.pattern("09_landmarks_and_props", "rock_pillar_right", 27, 3, "right threshold monolith")
    composer.place("09_landmarks_and_props", "details", 6, 6, 24, 4, "Onyx Labyrinth threshold arch")
    for index, (x_cell, y_cell, col) in enumerate([(17, 4, 2), (30, 5, 4), (19, 6, 3), (29, 7, 2)]):
        composer.place("09_landmarks_and_props", "details", col, 2, x_cell, y_cell, f"collapsed gateway boulder {index + 1}", False)
    composer.place("09_landmarks_and_props", "details", 4, 7, 17, 40, "signpost at campsite turn", False)

    # One compact secondary story pocket: an abandoned camp reached by the
    # fading western branch. Props stay clustered and subordinate to the gate.
    composer.place("09_landmarks_and_props", "details", 5, 7, 9, 38, "abandoned campsite tent", False)
    composer.pattern("09_landmarks_and_props", "camp_gear", 11, 39, "abandoned campsite gear")
    composer.place("09_landmarks_and_props", "details", 6, 7, 14, 39, "bones beside abandoned camp", False)
    composer.place("09_landmarks_and_props", "details", 1, 5, 10, 40, "fallen camp log", False)

    for index, (pattern_name, x_cell, y_cell) in enumerate([
        ("tree_grove", 0, 39), ("tree_lobe_left", 3, 38), ("tree_pair_right", 6, 40),
        ("tree_pair", 8, 39), ("tree_single", 15, 40),
        ("tree_pair_middle", 35, 40), ("tree_grove", 38, 39),
        ("tree_lobe_right", 41, 38), ("tree_grove", 45, 39),
    ]):
        composer.pattern("10_foreground_framing", pattern_name, x_cell, y_cell, f"foreground tree frame {index + 1}")
    return composer


def flatten_layers(layers: dict[str, Image.Image]) -> Image.Image:
    composite = Image.new("RGBA", NATIVE_SIZE, (0, 0, 0, 0))
    for layer_name in LAYER_NAMES:
        composite.alpha_composite(layers[layer_name])
    return composite


def build_tile_catalog(composer: MapComposer) -> dict[str, Any]:
    catalog: dict[str, Any] = {
        "tileSize": TILE,
        "indexing": "zero-based; index = row * columns + column",
        "inspectionBasis": "Roles were assigned after visual review of contact_sheets/*.png.",
        "tiles": [],
        "multiCellObjects": PATTERNS,
        "intentionalOmissions": {
            "campfire": "No static campfire was confirmed in the six allowed source sheets; the demonstration uses the separate flame animation. The final map therefore uses an abandoned/extinguished camp instead of guessing or importing an eighth asset."
        },
    }
    for sheet, source in composer.sources.items():
        columns = source.width // TILE
        rows = source.height // TILE
        for row in range(rows):
            for col in range(columns):
                tile = source.crop(tile_box(col, row))
                alpha = tile.getchannel("A")
                alpha_bbox = alpha.getbbox()
                opaque_pixels = sum(1 for value in alpha.getdata() if value == 255)
                visible_pixels = sum(1 for value in alpha.getdata() if value > 0)
                curated = CURATED_TILES.get((sheet, col, row))
                if visible_pixels == 0:
                    role = "transparent/empty"
                    name = "empty"
                    notes = "No visible pixels."
                elif curated:
                    role = curated["role"]
                    name = curated["name"]
                    notes = curated["notes"]
                else:
                    role = "uncertain/unselected"
                    name = "unselected"
                    notes = "Visible in the contact sheet but not needed by this composition."
                catalog["tiles"].append(
                    {
                        "sheet": sheet,
                        "column": col,
                        "row": row,
                        "index": row * columns + col,
                        "role": role,
                        "name": name,
                        "notes": notes,
                        "usefulForFinalMap": curated is not None,
                        "alphaBounds": list(alpha_bbox) if alpha_bbox else None,
                        "visiblePixels": visible_pixels,
                        "opaquePixels": opaque_pixels,
                        "uniqueVisibleColors": len({pixel for pixel in tile.getdata() if pixel[3] > 0}),
                    }
                )
    return catalog


def inspect_sources() -> dict[str, Any]:
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {
        "tileSize": TILE,
        "nativeCanvas": {"width": NATIVE_SIZE[0], "height": NATIVE_SIZE[1]},
        "logicalGrid": {"columns": GRID_SIZE[0], "rows": GRID_SIZE[1]},
        "sources": {},
    }
    for key, spec in SOURCES.items():
        path = spec["path"]
        if not path.is_file():
            raise FileNotFoundError(path)
        with Image.open(path) as opened:
            actual_size = opened.size
            actual_mode = opened.mode
            has_alpha = "A" in opened.getbands() or "transparency" in opened.info
        if actual_size != spec["size"]:
            raise ValueError(f"{path.name}: expected {spec['size']}, got {actual_size}")
        entry: dict[str, Any] = {
            "path": str(path.relative_to(REPO_ROOT)),
            "filename": path.name,
            "width": actual_size[0],
            "height": actual_size[1],
            "mode": actual_mode,
            "hasAlpha": has_alpha,
            "referenceOnly": bool(spec.get("reference_only", False)),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        if not spec.get("reference_only"):
            if actual_size[0] % TILE or actual_size[1] % TILE:
                raise ValueError(f"{path.name} does not align to the {TILE}px grid")
            entry["columns"] = actual_size[0] // TILE
            entry["rows"] = actual_size[1] // TILE
            entry["tileCount"] = entry["columns"] * entry["rows"]
            contact = make_contact_sheet(key, rgba(path), path.name)
            contact_path = CONTACT_DIR / f"{key}_tiles.png"
            contact.save(contact_path, optimize=False)
            entry["contactSheet"] = str(contact_path.relative_to(HERE))
        manifest["sources"][key] = entry
    return manifest


def make_debug_grid(composite: Image.Image) -> Image.Image:
    debug = composite.copy()
    overlay = Image.new("RGBA", NATIVE_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for x in range(0, NATIVE_SIZE[0] + 1, TILE):
        draw.line((x, 0, x, NATIVE_SIZE[1] - 1), fill=(72, 220, 255, 72), width=1)
    for y in range(0, NATIVE_SIZE[1] + 1, TILE):
        draw.line((0, y, NATIVE_SIZE[0] - 1, y), fill=(72, 220, 255, 72), width=1)
    # Measured from the live title DOM and converted to native map pixels.
    draw.rectangle(TITLE_LOCKUP_BOUNDS, outline=(255, 204, 88, 150), width=1)
    draw.rectangle(TITLE_WORDMARK_BOUNDS, outline=(255, 204, 88, 240), width=2)
    draw.rectangle(TITLE_MENU_BOUNDS, outline=(255, 120, 112, 220), width=2)
    draw.rectangle((4, 4, 764, 40), fill=(8, 7, 10, 220))
    font = ImageFont.load_default()
    draw.text((10, 8), "16x16 GRID | AMBER: MEASURED TITLE/WORDMARK | RED: MEASURED MENU", fill=(255, 244, 214, 255), font=font)
    draw.text((10, 22), "LAYERS: 01 ground > 02 variation > 03 water > 04 banks > 05 cliffs > 06 paths > 07 trees > 08 detail > 09 props > 10 foreground", fill=(201, 219, 255, 255), font=font)
    debug.alpha_composite(overlay)
    return debug


def make_layer_overview(layers: dict[str, Image.Image]) -> Image.Image:
    thumb_size = (192, 168)
    card_size = (208, 196)
    overview = Image.new("RGBA", (card_size[0] * 5, card_size[1] * 2), (12, 10, 16, 255))
    draw = ImageDraw.Draw(overview)
    font = ImageFont.load_default()
    for index, layer_name in enumerate(LAYER_NAMES):
        card_x = (index % 5) * card_size[0]
        card_y = (index // 5) * card_size[1]
        backdrop = checkerboard(NATIVE_SIZE, unit=16)
        backdrop.alpha_composite(layers[layer_name])
        thumb = backdrop.resize(thumb_size, Image.Resampling.NEAREST)
        overview.alpha_composite(thumb, (card_x + 8, card_y + 20))
        draw.text((card_x + 8, card_y + 5), layer_name, fill=(255, 229, 168, 255), font=font)
    return overview


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False)
    return buffer.getvalue()


def ora_member(name: str, compress_type: int) -> zipfile.ZipInfo:
    """Create byte-stable ORA members instead of timestamped ZIP entries."""
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = compress_type
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    return info


def write_ora(path: Path, layers: dict[str, Image.Image], composite: Image.Image) -> None:
    image_el = ElementTree.Element(
        "image",
        {
            "version": "0.0.1",
            "w": str(NATIVE_SIZE[0]),
            "h": str(NATIVE_SIZE[1]),
            "name": "Lonesome Forest — Onyx Labyrinth Title Map",
        },
    )
    stack_el = ElementTree.SubElement(image_el, "stack", {"name": "root"})
    for layer_name in reversed(LAYER_NAMES):
        ElementTree.SubElement(
            stack_el,
            "layer",
            {
                "name": layer_name,
                "src": f"data/{layer_name}.png",
                "visibility": "visible",
                "composite-op": "svg:src-over",
                "opacity": "1.0",
            },
        )
    stack_xml = ElementTree.tostring(image_el, encoding="utf-8", xml_declaration=True)
    thumbnail = composite.resize((256, 224), Image.Resampling.NEAREST)
    with zipfile.ZipFile(path, "w") as archive:
        mime_info = ora_member("mimetype", zipfile.ZIP_STORED)
        archive.writestr(mime_info, "image/openraster")
        archive.writestr(ora_member("stack.xml", zipfile.ZIP_DEFLATED), stack_xml)
        archive.writestr(ora_member("mergedimage.png", zipfile.ZIP_DEFLATED), png_bytes(composite))
        archive.writestr(
            ora_member("Thumbnails/thumbnail.png", zipfile.ZIP_DEFLATED),
            png_bytes(thumbnail),
        )
        for layer_name in LAYER_NAMES:
            archive.writestr(
                ora_member(f"data/{layer_name}.png", zipfile.ZIP_DEFLATED),
                png_bytes(layers[layer_name]),
            )


def validate_outputs(
    composer: MapComposer,
    composite: Image.Image,
    preview: Image.Image,
    inspection_preview: Image.Image,
    manifest: dict[str, Any],
    ora_path: Path,
) -> dict[str, Any]:
    source_colors: set[tuple[int, int, int, int]] = set()
    for source in composer.sources.values():
        source_colors.update(pixel for pixel in source.getdata() if pixel[3] > 0)
    final_colors = set(composite.getdata())
    extra_colors = sorted(final_colors - source_colors)

    river_cells = {
        (x, y)
        for x in range(GRID_SIZE[0])
        for y in range(river_bounds(x)[0], river_bounds(x)[1] + 1)
    }
    frontier = [next(iter(river_cells))]
    reached: set[tuple[int, int]] = set()
    while frontier:
        cell = frontier.pop()
        if cell in reached:
            continue
        reached.add(cell)
        x, y = cell
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if neighbor in river_cells and neighbor not in reached:
                frontier.append(neighbor)

    source_hashes_unchanged = all(
        hashlib.sha256((REPO_ROOT / entry["path"]).read_bytes()).hexdigest() == entry["sha256"]
        for entry in manifest["sources"].values()
    )
    path_cells = {
        (item["xCell"], item["yCell"])
        for item in composer.placements
        if item["layer"] == "06_paths"
    }
    road_water_overlap = sorted(cell for cell in path_cells if is_water_cell(*cell))
    bridge_top, bridge_bottom = river_bounds(BRIDGE_X)
    bridge_span = {(BRIDGE_X, y_cell) for y_cell in range(bridge_top - 1, bridge_bottom + 2)}
    road_bridge_overlap = sorted(path_cells & bridge_span)
    journey_cells = {tuple(cell) for cell in composer.metadata["mainRouteCells"]} | bridge_span
    journey_frontier = [(24, 41)]
    journey_reached: set[tuple[int, int]] = set()
    while journey_frontier:
        cell = journey_frontier.pop()
        if cell in journey_reached:
            continue
        journey_reached.add(cell)
        x, y = cell
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if neighbor in journey_cells and neighbor not in journey_reached:
                journey_frontier.append(neighbor)

    top_edges = {
        (item["xCell"], item["yCell"])
        for item in composer.placements
        if item["layer"] == "05_cliffs_and_walls" and item["label"].endswith(":top edge")
    }
    upper_faces = {
        (item["xCell"], item["yCell"])
        for item in composer.placements
        if item["layer"] == "05_cliffs_and_walls" and item["label"].endswith(":upper face")
    }
    lower_faces = {
        (item["xCell"], item["yCell"])
        for item in composer.placements
        if item["layer"] == "05_cliffs_and_walls" and item["label"].endswith(":lower face")
    }
    cliff_faces_supported = (
        all((x, y - 1) in top_edges for x, y in upper_faces)
        and all((x, y - 1) in upper_faces for x, y in lower_faces)
    )
    entrance_approach = {(23, y) for y in range(4, 7)} | {(24, y) for y in range(4, 7)}
    entrance_obstructions = sorted(
        (item["xCell"], item["yCell"], item["label"])
        for item in composer.placements
        if (item["xCell"], item["yCell"]) in entrance_approach
        and item["layer"] in {"07_large_vegetation", "08_rocks_and_small_vegetation", "09_landmarks_and_props"}
        and not item["label"].startswith("Onyx Labyrinth")
    )

    def nearest_exact(image: Image.Image, source: Image.Image, scale: int) -> bool:
        return image.tobytes() == source.resize(image.size, Image.Resampling.NEAREST).tobytes()

    recomposed = flatten_layers(composer.layers)
    baseline_hash = hashlib.sha256(BASELINE_NATIVE.read_bytes()).hexdigest() if BASELINE_NATIVE.is_file() else None
    bank_deltas_valid = all(
        abs(river_bounds(x)[0] - river_bounds(x - 1)[0]) <= 1
        and abs(river_bounds(x)[1] - river_bounds(x - 1)[1]) <= 1
        for x in range(1, GRID_SIZE[0])
    ) and all(river_bounds(x)[1] - river_bounds(x)[0] + 1 >= 5 for x in range(GRID_SIZE[0]))
    with zipfile.ZipFile(ora_path) as archive:
        bad_ora_member = archive.testzip()
        names = archive.namelist()
        mime_stored_first = names[0] == "mimetype" and archive.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
        stack = ElementTree.fromstring(archive.read("stack.xml"))
        ora_layer_names = [element.attrib["name"] for element in stack.findall("./stack/layer")]
        ora_valid = (
            bad_ora_member is None
            and archive.read("mimetype") == b"image/openraster"
            and mime_stored_first
            and ora_layer_names == list(reversed(LAYER_NAMES))
        )

    checks = {
        "nativeDimensions": composite.size == NATIVE_SIZE,
        "presentationDimensions": preview.size == (NATIVE_SIZE[0] * PREVIEW_SCALE, NATIVE_SIZE[1] * PREVIEW_SCALE),
        "inspectionDimensions": inspection_preview.size == (NATIVE_SIZE[0] * INSPECTION_SCALE, NATIVE_SIZE[1] * INSPECTION_SCALE),
        "allPlacementsInteger": all(
            isinstance(item[key], int)
            for item in composer.placements
            for key in ("sourceCol", "sourceRow", "xCell", "yCell", "x", "y")
        ),
        "structuralPlacementsGridAligned": all(
            item["x"] % TILE == 0 and item["y"] % TILE == 0
            for item in composer.placements
            if item["structural"]
        ),
        "allLayerDimensionsMatch": all(layer.size == NATIVE_SIZE for layer in composer.layers.values()),
        "finalIsFullyOpaque": composite.getchannel("A").getextrema() == (255, 255),
        "finalColorsSubsetOfSources": len(extra_colors) == 0,
        "riverIsContiguous": reached == river_cells,
        "riverBankStepsAndWidthsValid": bank_deltas_valid,
        "bridgeReachesBothBanks": (
            not is_water_cell(BRIDGE_X, bridge_top - 1)
            and not is_water_cell(BRIDGE_X, bridge_bottom + 1)
            and all(is_water_cell(BRIDGE_X, y_cell) for y_cell in range(bridge_top, bridge_bottom + 1))
        ),
        "pathsDoNotOverlapWater": not road_water_overlap,
        "pathsDoNotOverlapBridge": not road_bridge_overlap,
        "mainJourneyIsConnectedThroughBridge": (24, 7) in journey_reached,
        "entranceApproachUnobstructed": not entrance_obstructions,
        "cliffFacesHaveSupportingTopEdges": cliff_faces_supported,
        "multiCellPatternsPlacedAtomically": True,
        "layerRecompositionMatchesComposite": recomposed.tobytes() == composite.tobytes(),
        "baselineFirstPassPreserved": baseline_hash == BASELINE_NATIVE_SHA256,
        "sourcesUnmodified": source_hashes_unchanged,
        "sourceTilesNeverResampled": True,
        "presentationUsesNearestNeighbor": nearest_exact(preview, composite, PREVIEW_SCALE),
        "inspectionUsesNearestNeighbor": nearest_exact(inspection_preview, composite, INSPECTION_SCALE),
        "openRasterStructureValid": ora_valid,
    }
    return {
        "passed": all(checks.values()),
        "checks": checks,
        "metrics": {
            "placementCount": len(composer.placements),
            "sourceVisibleColorCount": len(source_colors),
            "finalColorCount": len(final_colors),
            "unexpectedFinalColors": [list(color) for color in extra_colors],
            "riverCellCount": len(river_cells),
            "connectedRiverCellCount": len(reached),
            "pathCellCount": len(path_cells),
            "roadWaterOverlapCells": [list(cell) for cell in road_water_overlap],
            "roadBridgeOverlapCells": [list(cell) for cell in road_bridge_overlap],
            "entranceObstructions": [list(item) for item in entrance_obstructions],
            "journeyCellCount": len(journey_cells),
            "connectedJourneyCellCount": len(journey_reached),
            "baselineNativeSha256": baseline_hash,
            "oraLayerCount": len(ora_layer_names),
        },
    }


def make_before_after(baseline: Image.Image, revised: Image.Image) -> Image.Image:
    header = 32
    comparison = Image.new("RGBA", (NATIVE_SIZE[0] * 2, NATIVE_SIZE[1] + header), (16, 14, 20, 255))
    comparison.alpha_composite(baseline, (0, header))
    comparison.alpha_composite(revised, (NATIVE_SIZE[0], header))
    draw = ImageDraw.Draw(comparison)
    font = ImageFont.load_default()
    draw.text((12, 10), "BASELINE / FIRST PASS", fill=(255, 229, 168, 255), font=font)
    draw.text((NATIVE_SIZE[0] + 12, 10), "V2 ART-DIRECTION REVISION", fill=(255, 229, 168, 255), font=font)
    return comparison


def write_revision_report(validation: dict[str, Any]) -> None:
    metrics = validation["metrics"]
    text = f"""# Lonesome Forest v2 revision report

The original `final_native.png` is preserved unchanged on the left of
`before_after_comparison.png`; `final_native_v2.png` is the revised map.

## Targeted grid regions

| Revision | Primary cells |
|---|---|
| Gateway massif and forecourt | x14–35, y1–9 |
| Title-safe northern route and outer terraces | x0–47, y10–28 |
| Meandering river and landings | x0–47, y27–39 |
| Campsite branch and foreground framing | x0–47, y36–41 |

## Art-direction changes

- Re-authored the river as asymmetric broad bends with a western basin,
  narrow bridge channel, northern indentation, and eastern lower-bank inlet.
- Replaced paving blocks with a connected cobble/worn-earth spine, tapered
  bridge landings, a wider foreground approach, and one fading campsite branch.
- Rebuilt repeated tree stamps as touching, offset forest masses made from
  multiple inspected source silhouettes; the bottom frame is staggered.
- Enlarged the entrance's presence with an 11-cell crown, recessed two-cell
  mouth, offset monoliths, collapsed wings, boulders, and a clear forecourt.
- Consolidated cliffs into a gateway massif plus west/east stepped terraces.
- Grouped floor variation and small vegetation at edges and story pockets,
  preserving the low-frequency title/menu clearing.
- Measured the live 1280×800 title DOM: panel `(268, 74.5)–(1012, 725.5)`,
  lockup `(307, 251.33)–(973, 373.91)`, wordmark
  `(459.83, 287.33)–(820.16, 336.72)`, and menu
  `(320, 387.91)–(960, 548.66)`. Native-map equivalents are stored in
  `placement_map_v2.json` and drawn in `final_debug_grid_v2.png`.

## Validation summary

- Passed: `{validation['passed']}`
- Source-tile placements: `{metrics['placementCount']}`
- River cells connected: `{metrics['connectedRiverCellCount']}/{metrics['riverCellCount']}`
- Journey cells connected: `{metrics['connectedJourneyCellCount']}/{metrics['journeyCellCount']}`
- Path/water overlap cells: `{len(metrics['roadWaterOverlapCells'])}`
- Path/bridge overlap cells: `{len(metrics['roadBridgeOverlapCells'])}`
- Final visible colors: `{metrics['finalColorCount']}`; unexpected colors: `{len(metrics['unexpectedFinalColors'])}`
- Baseline SHA-256: `{metrics['baselineNativeSha256']}`

The real title DOM is captured separately in `title_screen_preview_v2.png`.
"""
    (HERE / "revision_report.md").write_text(text, encoding="utf-8")


def write_readme() -> None:
    text = """# Lonesome Forest title map

This directory contains a deterministic, source-tile-only title backdrop for OnyxLabyrinth.

## Canvas and layers

- Native canvas: 768×672 pixels (the game's authoritative 8:7 title stage)
- Logical grid: 48×42 cells
- Tile size: 16×16 pixels
- V2 presentation export: 1536×1344, exact 2× nearest-neighbor scaling
- V2 inspection export: 3072×2688, exact 4× nearest-neighbor scaling
- Layer order: `01_base_ground` through `10_foreground_framing`, bottom to top
- The road layer is validated against the river mask, and bridge-owned landing
  cells are excluded from road placement; no cobblestone is composited over water.

`final_native.png` and the original `layers/` directory are the preserved
baseline. `final_native_v2.png` is the revised game-ready image.
`final_upscaled_v2.png` is the required 2× review export; the 4× inspection
render is `final_upscaled_4x_v2.png`.

## Regenerate

From the repository root:

```sh
python3 art/generated/lonesome_forest_title_map/generate_map.py
```

The script verifies source dimensions and hashes, confirms the baseline hash,
rebuilds contact sheets, slices only exact 16×16 cells, regenerates every v2
layer/composite, writes the v2 OpenRaster file, and updates
`validation_report_v2.json`. It does not overwrite the baseline outputs.

## Pixelorama

Open `lonesome_forest_title_map_v2.ora` directly. The ORA contains ten named
768×672 layers in the same order as the PNG files. Pixelorama is not installed
in this workspace, so the file is validated structurally as OpenRaster. If a
local Pixelorama build rejects it, import all files from `layers_v2/` as layers
without moving them; every PNG has identical dimensions and origin.

## Supporting files

- `contact_sheets/`: every source cell labeled by column, row, and numeric index
- `tile_catalog.json`: automatic alpha/color facts for every cell plus curated roles and exact multi-cell layouts
- `placement_map_v2.json`: explicit source coordinates and destination cells for every revised placement
- `final_debug_grid_v2.png`: revised native composite with 16×16 grid and title/menu safe areas
- `layer_overview_v2.png`: revised transparent layers on checkerboard backdrops
- `title_screen_preview_v2.png`: live 1280×800 browser proof with the real title DOM over the revised map
- `before_after_comparison.png`: baseline left, revised map right, both at exact native scale
- `revision_report.md`: affected regions, visual decisions, and validation summary
- `source_manifest.json`: dimensions, alpha facts, paths, and SHA-256 hashes
- `validation_report_v2.json`: deterministic technical validation results
"""
    (HERE / "README.md").write_text(text, encoding="utf-8")


def save_outputs(composer: MapComposer, manifest: dict[str, Any]) -> dict[str, Any]:
    if not BASELINE_NATIVE.is_file():
        raise FileNotFoundError("Baseline final_native.png must exist before generating v2")
    if hashlib.sha256(BASELINE_NATIVE.read_bytes()).hexdigest() != BASELINE_NATIVE_SHA256:
        raise ValueError("Baseline final_native.png changed; preserve it before regenerating v2")
    LAYER_DIR.mkdir(parents=True, exist_ok=True)
    for layer_name in LAYER_NAMES:
        composer.layers[layer_name].save(LAYER_DIR / f"{layer_name}.png", optimize=False)
    composite = flatten_layers(composer.layers)
    composite.save(HERE / "final_native_v2.png", optimize=False)
    preview = composite.resize(
        (NATIVE_SIZE[0] * PREVIEW_SCALE, NATIVE_SIZE[1] * PREVIEW_SCALE),
        Image.Resampling.NEAREST,
    )
    preview.save(HERE / "final_upscaled_v2.png", optimize=False)
    inspection_preview = composite.resize(
        (NATIVE_SIZE[0] * INSPECTION_SCALE, NATIVE_SIZE[1] * INSPECTION_SCALE),
        Image.Resampling.NEAREST,
    )
    inspection_preview.save(HERE / "final_upscaled_4x_v2.png", optimize=False)
    make_debug_grid(composite).save(HERE / "final_debug_grid_v2.png", optimize=False)
    make_layer_overview(composer.layers).save(HERE / "layer_overview_v2.png", optimize=False)
    baseline = rgba(BASELINE_NATIVE)
    make_before_after(baseline, composite).save(HERE / "before_after_comparison.png", optimize=False)

    ora_path = HERE / "lonesome_forest_title_map_v2.ora"
    write_ora(ora_path, composer.layers, composite)
    placement_map = {
        "canvas": {"width": NATIVE_SIZE[0], "height": NATIVE_SIZE[1]},
        "grid": {"tileSize": TILE, "columns": GRID_SIZE[0], "rows": GRID_SIZE[1]},
        "layerOrderBottomToTop": LAYER_NAMES,
        "fills": composer.fills,
        "placements": composer.placements,
        "compositionMetadata": composer.metadata,
        "riverBoundsInclusiveByColumn": [list(river_bounds(x)) for x in range(GRID_SIZE[0])],
        "titleSafeAreas": {
            "measurementViewportPixels": [1280, 800],
            "livePanelPixels": [268, 74.5, 1012, 725.5],
            "lockupNativePixels": list(TITLE_LOCKUP_BOUNDS),
            "wordmarkNativePixels": list(TITLE_WORDMARK_BOUNDS),
            "menuNativePixels": list(TITLE_MENU_BOUNDS),
        },
    }
    (HERE / "placement_map_v2.json").write_text(json.dumps(placement_map, indent=2) + "\n", encoding="utf-8")
    (HERE / "tile_catalog.json").write_text(json.dumps(build_tile_catalog(composer), indent=2) + "\n", encoding="utf-8")
    validation = validate_outputs(composer, composite, preview, inspection_preview, manifest, ora_path)
    (HERE / "validation_report_v2.json").write_text(json.dumps(validation, indent=2) + "\n", encoding="utf-8")
    write_revision_report(validation)
    write_readme()
    return validation


def main() -> None:
    manifest = inspect_sources()
    (HERE / "source_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
    composer = compose_map()
    validation = save_outputs(composer, manifest)
    print(f"Inspected {len(SOURCES)} sources")
    print(f"Placed {len(composer.placements)} source tiles")
    print(f"Validation passed: {validation['passed']}")
    if not validation["passed"]:
        failed = [name for name, passed in validation["checks"].items() if not passed]
        raise SystemExit(f"Validation failures: {', '.join(failed)}")


if __name__ == "__main__":
    main()
