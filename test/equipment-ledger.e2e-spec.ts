import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { Asset, AssetDocument } from '../src/assets/asset.schema';
import { ServiceStatus } from '../src/common/domain';
import { Movement, MovementDocument } from '../src/ledger/movement.schema';
import { Reservation, ReservationDocument } from '../src/reservations/reservation.schema';
import { Worker, WorkerDocument } from '../src/workers/worker.schema';

// Supertest currently ships without declarations in this project.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

describe('Equipment ledger HTTP and concurrency invariants', () => {
  let app: INestApplication;
  let connection: Connection;
  let assets: Model<AssetDocument>;
  let workers: Model<WorkerDocument>;
  let movements: Model<MovementDocument>;
  let reservations: Model<ReservationDocument>;
  let workerA: WorkerDocument;
  let workerB: WorkerDocument;
  let keeper: WorkerDocument;

  beforeAll(async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/equipment-ledger-test?replicaSet=rs0';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    connection = app.get(getConnectionToken());
    assets = app.get(getModelToken(Asset.name));
    workers = app.get(getModelToken(Worker.name));
    movements = app.get(getModelToken(Movement.name));
    reservations = app.get(getModelToken(Reservation.name));
  });

  beforeEach(async () => {
    await connection.dropDatabase();
    await Promise.all([assets.createIndexes(), workers.createIndexes(), movements.createIndexes(), reservations.createIndexes()]);
    [workerA, workerB, keeper] = await workers.create([
      { employeeCode: 'T-W001', name: 'Worker A', certifications: [{ type: 'GAS_SAFETY', expiresAt: new Date('2035-01-01T00:00:00Z') }] },
      { employeeCode: 'T-W002', name: 'Worker B', certifications: [{ type: 'GAS_SAFETY', expiresAt: new Date('2020-01-01T00:00:00Z') }] },
      { employeeCode: 'T-K001', name: 'Store Keeper', certifications: [] },
    ]);
  });

  afterAll(async () => {
    if (connection) await connection.dropDatabase();
    if (app) await app.close();
  });

  const createAsset = (code: string, requiredCertification: string | null = null) => assets.create({ code, name: `Test ${code}`, kind: 'TEST', requiredCertification, serviceStatus: ServiceStatus.IN_SERVICE, createdAt: new Date('2026-01-01T00:00:00Z') });
  const issueBody = (workerId: Types.ObjectId, key = randomUUID(), effectiveAt = '2026-09-08T09:00:00.000Z') => ({ workerId: String(workerId), recordedById: String(keeper._id), effectiveAt, dueAt: new Date(new Date(effectiveAt).getTime() + 8 * 60 * 60 * 1000).toISOString(), idempotencyKey: key });
  const returnBody = (workerId: Types.ObjectId, key = randomUUID(), effectiveAt = '2026-09-08T12:00:00.000Z') => ({ workerId: String(workerId), recordedById: String(keeper._id), effectiveAt, idempotencyKey: key });

  it('exposes seeded-style list endpoints and rejects unknown input', async () => {
    await createAsset('TEST-001');
    await request(app.getHttpServer()).get('/api/assets').expect(200).expect((response: { body: unknown[] }) => { expect(response.body).toHaveLength(1); });
    await request(app.getHttpServer()).get('/api/workers').expect(200).expect((response: { body: unknown[] }) => { expect(response.body).toHaveLength(3); });
    await request(app.getHttpServer()).post(`/api/assets/${new Types.ObjectId()}/issue`).send({ ...issueBody(workerA._id), unexpected: true }).expect(400);
  });

  it('allows exactly one of simultaneous issues for an asset', async () => {
    const asset = await createAsset('RACE-001');
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issueBody(index % 2 ? workerA._id : workerB._id)),
    ));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(19);
    expect(await movements.countDocuments({ assetId: asset._id, type: 'ISSUE' })).toBe(1);
    expect((await assets.findById(asset._id))?.currentHolderId).not.toBeNull();
  });

  it('deduplicates replayed issue and return requests', async () => {
    const asset = await createAsset('IDEM-001');
    const issueKey = randomUUID();
    const issue = issueBody(workerA._id, issueKey);
    const [one, two] = await Promise.all([
      request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issue),
      request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issue),
    ]);
    expect(one.status).toBe(201); expect(two.status).toBe(201);
    expect(one.body._id).toBe(two.body._id);
    expect(await movements.countDocuments({ idempotencyKey: issueKey })).toBe(1);

    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/return`).send(returnBody(workerB._id)).expect(409);
    const returnKey = randomUUID();
    const returned = await request(app.getHttpServer()).post(`/api/assets/${asset._id}/return`).send(returnBody(workerA._id, returnKey)).expect(201);
    const replay = await request(app.getHttpServer()).post(`/api/assets/${asset._id}/return`).send(returnBody(workerA._id, returnKey)).expect(201);
    expect(replay.body._id).toBe(returned.body._id);
  });

  it('refuses an expired certification with a human-readable reason', async () => {
    const asset = await createAsset('GAS-001', 'GAS_SAFETY');
    const response = await request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issueBody(workerB._id)).expect(422);
    expect(response.body.message).toContain('GAS_SAFETY');
  });

  it('allows exactly one of simultaneous overlapping reservations but permits adjacency', async () => {
    const asset = await createAsset('RES-001');
    const body = (workerId: Types.ObjectId, startAt: string, endAt: string) => ({ assetId: String(asset._id), workerId: String(workerId), startAt, endAt, idempotencyKey: randomUUID() });
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/api/reservations').send(body(workerA._id, '2030-01-01T09:00:00Z', '2030-01-01T12:00:00Z')),
      request(app.getHttpServer()).post('/api/reservations').send(body(workerB._id, '2030-01-01T10:00:00Z', '2030-01-01T13:00:00Z')),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const existing = await reservations.findOne({ assetId: asset._id });
    await request(app.getHttpServer()).post('/api/reservations').send(body(workerA._id, existing!.endAt.toISOString(), '2030-01-01T16:00:00Z')).expect(201);
    expect(await reservations.countDocuments({ assetId: asset._id })).toBe(2);
  });

  it('reconstructs holder state at exact issue and return instants', async () => {
    const asset = await createAsset('TIME-001');
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issueBody(workerA._id, randomUUID(), '2026-09-08T09:00:00Z')).expect(201);
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/return`).send(returnBody(workerA._id, randomUUID(), '2026-09-08T12:00:00Z')).expect(201);
    const atIssue = await request(app.getHttpServer()).get('/api/ledger/as-of?at=2026-09-08T09:00:00Z').expect(200);
    const atReturn = await request(app.getHttpServer()).get('/api/ledger/as-of?at=2026-09-08T12:00:00Z').expect(200);
    expect(atIssue.body.find((row: { asset: { _id: string } }) => row.asset._id === String(asset._id)).state.holderId).toBe(String(workerA._id));
    expect(atReturn.body.find((row: { asset: { _id: string } }) => row.asset._id === String(asset._id)).state.holderId).toBeNull();
  });

  it('rejects an impossible backdated return without changing current state', async () => {
    const asset = await createAsset('BACK-001');
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issueBody(workerA._id, randomUUID(), '2026-09-08T09:00:00Z')).expect(201);
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/return`).send(returnBody(workerA._id, randomUUID(), '2026-09-08T08:00:00Z')).expect(422);
    expect(await movements.countDocuments({ assetId: asset._id })).toBe(1);
    expect(String((await assets.findById(asset._id))!.currentHolderId)).toBe(String(workerA._id));
  });

  it('appends a correction and uses the corrected effective time', async () => {
    const asset = await createAsset('CORR-001');
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issueBody(workerA._id, randomUUID(), '2026-09-08T09:00:00Z')).expect(201);
    const returned = await request(app.getHttpServer()).post(`/api/assets/${asset._id}/return`).send(returnBody(workerA._id, randomUUID(), '2026-09-08T12:00:00Z')).expect(201);
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/corrections`).send({ movementId: returned.body._id, recordedById: String(keeper._id), effectiveAt: '2026-09-08T11:00:00Z', reason: 'Paper docket confirmed 11:00', idempotencyKey: randomUUID() }).expect(201);
    const history = await request(app.getHttpServer()).get(`/api/assets/${asset._id}/history`).expect(200);
    expect(history.body).toHaveLength(3);
    expect(history.body[2].type).toBe('CORRECTION');
    const asOf = await request(app.getHttpServer()).get('/api/ledger/as-of?at=2026-09-08T11:30:00Z').expect(200);
    expect(asOf.body.find((row: { asset: { _id: string } }) => row.asset._id === String(asset._id)).state.holderId).toBeNull();
  });

  it('enforces out-of-service policy and cancels future reservations', async () => {
    const asset = await createAsset('OOS-001');
    await request(app.getHttpServer()).post('/api/reservations').send({ assetId: String(asset._id), workerId: String(workerA._id), startAt: '2030-01-01T09:00:00Z', endAt: '2030-01-01T12:00:00Z', idempotencyKey: randomUUID() }).expect(201);
    await request(app.getHttpServer()).patch(`/api/assets/${asset._id}/out-of-service`).send({ recordedById: String(keeper._id), effectiveAt: '2026-09-08T10:00:00Z', reason: 'Failed inspection', idempotencyKey: randomUUID() }).expect(200);
    expect((await reservations.findOne({ assetId: asset._id }))!.status).toBe('CANCELLED');
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issueBody(workerA._id)).expect(409);

    const issued = await createAsset('OOS-002');
    await request(app.getHttpServer()).post(`/api/assets/${issued._id}/issue`).send(issueBody(workerA._id)).expect(201);
    await request(app.getHttpServer()).patch(`/api/assets/${issued._id}/out-of-service`).send({ recordedById: String(keeper._id), effectiveAt: '2026-09-08T10:00:00Z', reason: 'Attempt while issued', idempotencyKey: randomUUID() }).expect(409);
  });

  it('protects a reservation window and fulfils pickup atomically', async () => {
    const asset = await createAsset('PICKUP-001');
    const created = await request(app.getHttpServer()).post('/api/reservations').send({ assetId: String(asset._id), workerId: String(workerA._id), startAt: '2030-01-01T09:00:00Z', endAt: '2030-01-01T12:00:00Z', idempotencyKey: randomUUID() }).expect(201);
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send(issueBody(workerB._id, randomUUID(), '2030-01-01T10:00:00Z')).expect(409);
    await request(app.getHttpServer()).post(`/api/assets/${asset._id}/issue`).send({ ...issueBody(workerA._id, randomUUID(), '2030-01-01T10:00:00Z'), reservationId: created.body._id }).expect(201);
    const reservation = await reservations.findById(created.body._id);
    expect(reservation?.status).toBe('FULFILLED');
    expect(reservation?.fulfilledByMovementId).not.toBeNull();
    const projection = await assets.findById(asset._id);
    expect(projection?.currentDueAt?.toISOString()).toBe('2030-01-01T18:00:00.000Z');
  });

  it('cancels active reservations idempotently and marks expired ones missed', async () => {
    const asset = await createAsset('LIFE-001');
    const active = await reservations.create({ assetId: asset._id, workerId: workerA._id, startAt: new Date('2030-01-01T09:00:00Z'), endAt: new Date('2030-01-01T12:00:00Z'), idempotencyKey: randomUUID() });
    const expired = await reservations.create({ assetId: asset._id, workerId: workerB._id, startAt: new Date('2026-01-01T09:00:00Z'), endAt: new Date('2026-01-01T12:00:00Z'), idempotencyKey: randomUUID() });
    const cancelBody = { recordedById: String(keeper._id), reason: 'Worker no longer requires equipment' };
    await request(app.getHttpServer()).patch(`/api/reservations/${active._id}/cancel`).send(cancelBody).expect(200);
    await request(app.getHttpServer()).patch(`/api/reservations/${active._id}/cancel`).send(cancelBody).expect(200);
    await request(app.getHttpServer()).get('/api/reservations').expect(200);
    expect((await reservations.findById(active._id))?.status).toBe('CANCELLED');
    expect((await reservations.findById(expired._id))?.status).toBe('MISSED');
  });
});
