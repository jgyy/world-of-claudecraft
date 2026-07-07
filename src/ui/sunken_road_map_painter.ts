// Canvas-2D painter for the Sunken Road underground map schematic.
//
// The imperative half of the pure-core + painter split: the pure geometry lives in
// sunken_road_map.ts (buildSunkenRoadMapModel, unit-tested there); this module
// turns that flat model into canvas draws, mirroring delve_map_painter.ts's world-map
// branch (a self-contained schematic, no cached terrain blit).
//
// NO-MAGIC-VALUES: a 2D context cannot read CSS vars, so the painter resolves the
// `--color-sunken-road-*` / `--color-map-*` tokens via getComputedStyle ONCE per
// redraw; every other literal (font, radius, line width) is a named constant.

import type { IWorld } from '../world_api';
import { zonePoiLabel } from './entity_i18n';
import { buildSunkenRoadMapModel } from './sunken_road_map_view';

const TITLE_FONT = 'bold 16px Georgia';
const TITLE_BASELINE_Y = 20;
const LABEL_FONT = 'bold 13px Georgia';
const LABEL_LINE_WIDTH = 3;
const PATH_LINE_WIDTH = 10;
const MOUTH_DOT_RADIUS = 6;
const MOUTH_LABEL_OFFSET_Y = 10;
const RIDGE_DOT_RADIUS = 4;
const PLAYER_ARROW_TIP_Y = -7;
const PLAYER_ARROW_HALF_WIDTH = 5;
const PLAYER_ARROW_BASE_Y = 6;

const COLOR_TOKENS = {
  bg: '--color-sunken-road-bg',
  path: '--color-sunken-road-path',
  label: '--color-map-label',
  outline: '--color-map-outline',
  portalDot: '--color-map-portal-dot',
  portalLabel: '--color-map-portal-label',
  player: '--color-map-player',
} as const;

type SunkenRoadColors = Record<keyof typeof COLOR_TOKENS, string>;

function resolveColors(): SunkenRoadColors {
  const cs = getComputedStyle(document.documentElement);
  const read = (token: string): string => cs.getPropertyValue(token).trim();
  const colors = {} as SunkenRoadColors;
  for (const key of Object.keys(COLOR_TOKENS) as (keyof typeof COLOR_TOKENS)[]) {
    colors[key] = read(COLOR_TOKENS[key]);
  }
  return colors;
}

/** Paint the Sunken Road's underground schematic onto the map-window canvas. */
export function paintWorldMapSunkenRoad(
  ctx: CanvasRenderingContext2D,
  world: IWorld,
  S: number,
): void {
  const model = buildSunkenRoadMapModel(world, S);
  const colors = resolveColors();

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = colors.path;
  ctx.lineWidth = PATH_LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(model.path[0].mx, model.path[0].my);
  for (let i = 1; i < model.path.length; i++) ctx.lineTo(model.path[i].mx, model.path[i].my);
  ctx.stroke();

  ctx.fillStyle = colors.outline;
  ctx.beginPath();
  ctx.arc(model.ridge.mx, model.ridge.my, RIDGE_DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.lineWidth = LABEL_LINE_WIDTH;
  ctx.font = TITLE_FONT;
  ctx.strokeStyle = colors.outline;
  ctx.fillStyle = colors.label;
  const title = zonePoiLabel(model.mouths[0].zoneId, model.mouths[0].poiIndex);
  ctx.strokeText(title, S / 2, TITLE_BASELINE_Y);
  ctx.fillText(title, S / 2, TITLE_BASELINE_Y);

  ctx.font = LABEL_FONT;
  for (const mouth of model.mouths) {
    ctx.fillStyle = colors.portalDot;
    ctx.beginPath();
    ctx.arc(mouth.mx, mouth.my, MOUTH_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.portalLabel;
    const label = zonePoiLabel(mouth.zoneId, mouth.poiIndex);
    ctx.strokeText(label, mouth.mx, mouth.my - MOUTH_LABEL_OFFSET_Y);
    ctx.fillText(label, mouth.mx, mouth.my - MOUTH_LABEL_OFFSET_Y);
  }

  if (model.player) {
    ctx.save();
    ctx.translate(model.player.mx, model.player.my);
    ctx.rotate(model.player.angle);
    ctx.fillStyle = colors.player;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = LABEL_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(0, PLAYER_ARROW_TIP_Y);
    ctx.lineTo(PLAYER_ARROW_HALF_WIDTH, PLAYER_ARROW_BASE_Y);
    ctx.lineTo(-PLAYER_ARROW_HALF_WIDTH, PLAYER_ARROW_BASE_Y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
