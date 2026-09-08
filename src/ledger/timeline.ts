import { UnprocessableEntityException } from '@nestjs/common';
import { MovementType, ServiceStatus } from '../common/domain';

export type TimelineMovement = {
  _id: unknown;
  type: MovementType;
  workerId: unknown | null;
  dueAt?: Date | null;
  effectiveAt: Date;
  recordedAt: Date;
  supersedesMovementId?: unknown | null;
  correction?: { effectiveAt?: Date } | null;
};

const id = (value: unknown) => String(value);

export function effectiveMovements(rows: TimelineMovement[]): TimelineMovement[] {
  const correctionByTarget = new Map<string, TimelineMovement>();
  for (const row of rows) {
    if (row.type === MovementType.CORRECTION && row.supersedesMovementId) {
      correctionByTarget.set(id(row.supersedesMovementId), row);
    }
  }
  return rows
    .filter((row) => row.type !== MovementType.CORRECTION)
    .map((row) => {
      const correction = correctionByTarget.get(id(row._id));
      return correction?.correction?.effectiveAt
        ? { ...row, effectiveAt: new Date(correction.correction.effectiveAt) }
        : row;
    })
    .sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || a.recordedAt.getTime() - b.recordedAt.getTime() || id(a._id).localeCompare(id(b._id)));
}

export function replayTimeline(rows: TimelineMovement[], asOf = new Date(8640000000000000)) {
  let holderId: string | null = null;
  let dueAt: Date | null = null;
  let serviceStatus = ServiceStatus.IN_SERVICE;
  for (const movement of effectiveMovements(rows)) {
    if (movement.effectiveAt > asOf) break;
    switch (movement.type) {
      case MovementType.ISSUE:
        if (holderId) throw new UnprocessableEntityException('Timeline would give an asset two holders');
        if (serviceStatus === ServiceStatus.OUT_OF_SERVICE) throw new UnprocessableEntityException('Timeline would issue an out-of-service asset');
        holderId = id(movement.workerId);
        dueAt = movement.dueAt ? new Date(movement.dueAt) : null;
        break;
      case MovementType.RETURN:
        if (!holderId) throw new UnprocessableEntityException('Timeline would return an asset that is not issued');
        if (holderId !== id(movement.workerId)) throw new UnprocessableEntityException('Timeline return worker does not match the holder');
        holderId = null;
        dueAt = null;
        break;
      case MovementType.OUT_OF_SERVICE:
        if (holderId) throw new UnprocessableEntityException('Timeline would take an issued asset out of service');
        serviceStatus = ServiceStatus.OUT_OF_SERVICE;
        break;
      case MovementType.BACK_IN_SERVICE:
        serviceStatus = ServiceStatus.IN_SERVICE;
        break;
    }
  }
  return { holderId, dueAt, serviceStatus };
}
