// Unit coverage for the pure unstuck-reports/hotspots view-shaping helpers
// extracted from server/admin.ts (server/admin_unstuck_view.ts). Both the legacy
// admin dispatcher and the RouteDef handler call through unstuckQuery and
// adminUnstuckPayload, so this file pins their query-clamping and wire-shaping
// behavior directly, independent of either call site.

import { describe, expect, it } from 'vitest';
import { adminUnstuckPayload, unstuckQuery } from '../../server/admin_unstuck_view';
import {
  UNSTUCK_REPORT_MAX_DAYS,
  UNSTUCK_REPORT_MAX_LIMIT,
  type UnstuckHotspotRow,
  type UnstuckReportPage,
  type UnstuckReportRow,
} from '../../server/unstuck_db';

describe('unstuckQuery', () => {
  it('falls back to the given defaults when a param is absent or non-numeric', () => {
    expect(unstuckQuery(new URLSearchParams())).toEqual({ days: 30, limit: 50 });
    expect(unstuckQuery(new URLSearchParams({ days: 'nope', limit: 'nah' }))).toEqual({
      days: 30,
      limit: 50,
    });
  });

  it('clamps out-of-range days and limit to the max constants', () => {
    const result = unstuckQuery(
      new URLSearchParams({ days: String(UNSTUCK_REPORT_MAX_DAYS + 500), limit: '999999' }),
    );
    expect(result.days).toBe(UNSTUCK_REPORT_MAX_DAYS);
    expect(result.limit).toBe(UNSTUCK_REPORT_MAX_LIMIT);
  });

  it('honors an in-range days/limit request verbatim', () => {
    const result = unstuckQuery(new URLSearchParams({ days: '7', limit: '10' }));
    expect(result).toEqual({ days: 7, limit: 10 });
  });

  it('includes beforeId only for a positive safe integer, omitting it otherwise', () => {
    expect(unstuckQuery(new URLSearchParams({ beforeId: '42' })).beforeId).toBe(42);
    expect(unstuckQuery(new URLSearchParams()).beforeId).toBeUndefined();
    expect(unstuckQuery(new URLSearchParams({ beforeId: '0' })).beforeId).toBeUndefined();
    expect(unstuckQuery(new URLSearchParams({ beforeId: '-5' })).beforeId).toBeUndefined();
    expect(unstuckQuery(new URLSearchParams({ beforeId: 'nope' })).beforeId).toBeUndefined();
    expect(
      unstuckQuery(new URLSearchParams({ beforeId: String(Number.MAX_SAFE_INTEGER + 1) })).beforeId,
    ).toBeUndefined();
  });
});

function reportRow(overrides: Partial<UnstuckReportRow> = {}): UnstuckReportRow {
  return {
    id: 1,
    realm: 'test-realm',
    accountId: 5,
    characterId: 9,
    characterName: 'Testchar',
    areaKind: 'zone',
    areaId: 'eastbrook',
    instanceId: null,
    instanceSlot: null,
    originRawX: 1,
    originRawY: 2,
    originRawZ: 3,
    originLocalX: 4,
    originLocalY: 5,
    originLocalZ: 6,
    destinationRawX: 7,
    destinationRawY: 8,
    destinationRawZ: 9,
    destinationLocalX: 10,
    destinationLocalY: 11,
    destinationLocalZ: 12,
    outcome: 'completed',
    reason: 'stuck-in-geometry',
    invokedAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: '2026-01-01T00:00:05.000Z',
    createdAt: '2026-01-01T00:00:05.000Z',
    ...overrides,
  };
}

function hotspotRow(overrides: Partial<UnstuckHotspotRow> = {}): UnstuckHotspotRow {
  return {
    areaKind: 'zone',
    areaId: 'eastbrook',
    instanceId: null,
    bucketLocalX: 100,
    bucketLocalY: 0,
    bucketLocalZ: 200,
    reportCount: 3,
    completedCount: 2,
    cancelledCount: 1,
    failedCount: 0,
    firstInvokedAt: '2026-01-01T00:00:00.000Z',
    lastResolvedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('adminUnstuckPayload', () => {
  it('maps a report page + hotspot rows into the wire shape, passing days/limit/hasMore/nextBeforeId through unchanged', () => {
    const page: UnstuckReportPage = {
      rows: [reportRow()],
      hasMore: true,
      nextBeforeId: 41,
    };
    const hotspots = [hotspotRow()];
    const query = { days: 14, limit: 25 };

    const payload = adminUnstuckPayload(page, hotspots, query) as {
      reports: unknown[];
      hotspots: unknown[];
      days: number;
      limit: number;
      hasMore: boolean;
      nextBeforeId: number | null;
    };

    expect(payload.days).toBe(14);
    expect(payload.limit).toBe(25);
    expect(payload.hasMore).toBe(true);
    expect(payload.nextBeforeId).toBe(41);
    expect(payload.reports).toEqual([
      {
        id: 1,
        characterId: 9,
        characterName: 'Testchar',
        area: { kind: 'zone', id: 'eastbrook', instanceId: null, slot: null },
        origin: { x: 1, y: 2, z: 3, localX: 4, localY: 5, localZ: 6 },
        destination: { x: 7, y: 8, z: 9, localX: 10, localY: 11, localZ: 12 },
        outcome: 'completed',
        reason: 'stuck-in-geometry',
        invokedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: '2026-01-01T00:00:05.000Z',
      },
    ]);
    expect(payload.hotspots).toEqual([
      {
        area: { kind: 'zone', id: 'eastbrook', instanceId: null, slot: null },
        bucket: { x: 100, y: 0, z: 200 },
        count: 3,
        completed: 2,
        cancelled: 1,
        failed: 0,
        lastUsedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('maps to a null destination when any destination coordinate field is null', () => {
    const cases: Array<Partial<UnstuckReportRow>> = [
      { destinationRawX: null },
      { destinationRawY: null },
      { destinationRawZ: null },
      { destinationLocalX: null },
      { destinationLocalZ: null },
    ];
    for (const overrides of cases) {
      const page: UnstuckReportPage = {
        rows: [reportRow(overrides)],
        hasMore: false,
        nextBeforeId: null,
      };
      const payload = adminUnstuckPayload(page, [], { days: 1, limit: 1 }) as {
        reports: Array<{ destination: unknown }>;
      };
      expect(payload.reports[0].destination).toBeNull();
    }
  });

  it('maps to a populated destination object when every destination coordinate is present', () => {
    const page: UnstuckReportPage = { rows: [reportRow()], hasMore: false, nextBeforeId: null };
    const payload = adminUnstuckPayload(page, [], { days: 1, limit: 1 }) as {
      reports: Array<{ destination: unknown }>;
    };
    expect(payload.reports[0].destination).toEqual({
      x: 7,
      y: 8,
      z: 9,
      localX: 10,
      localY: 11,
      localZ: 12,
    });
  });
});
