import {
  type UnstuckHotspotRow as DbUnstuckHotspotRow,
  type UnstuckReportPage as DbUnstuckReportPage,
  type UnstuckReportRow as DbUnstuckReportRow,
  UNSTUCK_REPORT_MAX_DAYS,
  UNSTUCK_REPORT_MAX_LIMIT,
} from './unstuck_db';

const UNSTUCK_DEFAULT_DAYS = 30;
const UNSTUCK_DEFAULT_LIMIT = 50;

function boundedPositiveParam(raw: string | null, fallback: number, max: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(1, Math.floor(value))) : fallback;
}

export function unstuckQuery(params: URLSearchParams): {
  days: number;
  limit: number;
  beforeId?: number;
} {
  const days = boundedPositiveParam(
    params.get('days'),
    UNSTUCK_DEFAULT_DAYS,
    UNSTUCK_REPORT_MAX_DAYS,
  );
  const limit = boundedPositiveParam(
    params.get('limit'),
    UNSTUCK_DEFAULT_LIMIT,
    UNSTUCK_REPORT_MAX_LIMIT,
  );
  const rawBeforeId = Number(params.get('beforeId'));
  return {
    days,
    limit,
    ...(Number.isSafeInteger(rawBeforeId) && rawBeforeId > 0 ? { beforeId: rawBeforeId } : {}),
  };
}

function adminUnstuckReport(row: DbUnstuckReportRow): unknown {
  const destination =
    row.destinationRawX === null ||
    row.destinationRawY === null ||
    row.destinationRawZ === null ||
    row.destinationLocalX === null ||
    row.destinationLocalZ === null
      ? null
      : {
          x: row.destinationRawX,
          y: row.destinationRawY,
          z: row.destinationRawZ,
          localX: row.destinationLocalX,
          localY: row.destinationLocalY,
          localZ: row.destinationLocalZ,
        };
  return {
    id: row.id,
    characterId: row.characterId,
    characterName: row.characterName,
    area: {
      kind: row.areaKind,
      id: row.areaId,
      instanceId: row.instanceId,
      slot: row.instanceSlot,
    },
    origin: {
      x: row.originRawX,
      y: row.originRawY,
      z: row.originRawZ,
      localX: row.originLocalX,
      localY: row.originLocalY,
      localZ: row.originLocalZ,
    },
    destination,
    outcome: row.outcome,
    reason: row.reason,
    invokedAt: row.invokedAt,
    resolvedAt: row.resolvedAt,
  };
}

function adminUnstuckHotspot(row: DbUnstuckHotspotRow): unknown {
  return {
    area: { kind: row.areaKind, id: row.areaId, instanceId: null, slot: null },
    bucket: { x: row.bucketLocalX, y: row.bucketLocalY, z: row.bucketLocalZ },
    count: row.reportCount,
    completed: row.completedCount,
    cancelled: row.cancelledCount,
    failed: row.failedCount,
    lastUsedAt: row.lastResolvedAt,
  };
}

export function adminUnstuckPayload(
  page: DbUnstuckReportPage,
  hotspots: DbUnstuckHotspotRow[],
  query: { days: number; limit: number },
): unknown {
  return {
    reports: page.rows.map(adminUnstuckReport),
    hotspots: hotspots.map(adminUnstuckHotspot),
    days: query.days,
    limit: query.limit,
    hasMore: page.hasMore,
    nextBeforeId: page.nextBeforeId,
  };
}
