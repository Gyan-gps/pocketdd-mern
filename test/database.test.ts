// The Mongoose settings in src/config/database.ts: values reach MongoDB exactly as the native driver sent them.
// Needs a local MongoDB; skipped unless MONGODB_URI points at localhost / 127.0.0.1. Uses a throwaway collection.
//   MONGODB_URI=mongodb://127.0.0.1:27017 npx tsx --test test/database.test.ts
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const MONGODB_URI = process.env.MONGODB_URI ?? '';
const IS_LOCAL_DATABASE = /localhost|127\.0\.0\.1/.test(MONGODB_URI);

describe('config/database.ts semantics', { skip: !IS_LOCAL_DATABASE && 'MONGODB_URI is not a local MongoDB' }, () => {
  const COLLECTION = `zz_database_test_${process.pid}_${Date.now()}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Probe: any;
  let database: typeof import('../src/config/database.js');

  before(async () => {
    database = await import('../src/config/database.js');
    const { mongoose } = database;
    const probeSchema = new mongoose.Schema(
      {
        _id: { type: Number },
        status: { type: Number },
        name: { type: String },
        items: [new mongoose.Schema({ id: Number, label: String, amount: String }, { _id: false })],
      },
      { collection: COLLECTION, versionKey: false, strict: false, autoIndex: false, autoCreate: false },
    );
    Probe = mongoose.model(COLLECTION, probeSchema);
    await database.connectDatabase();
    await Probe.insertMany([{ _id: 1, status: 1, name: 'one', items: [] }], { lean: true });
  });

  after(async () => {
    await Probe.collection.drop().catch(() => undefined);
    await database.disconnectDatabase();
  });

  it('never throws a CastError for a non-numeric value on a Number path (no match)', async () => {
    assert.deepEqual(await Probe.find({ status: 'abc' }).lean(), []);
    assert.equal(await Probe.countDocuments({ status: 'abc' }), 0);
  });

  it("does not cast '1' to 1", async () => {
    assert.deepEqual(await Probe.find({ status: '1' }).lean(), []);
    assert.equal((await Probe.find({ status: 1 }).lean()).length, 1);
  });

  it('allows $regex on a Number path', async () => {
    assert.deepEqual(await Probe.find({ status: { $regex: '^1' } }).lean(), []);
  });

  it('keeps subdocument field order on $push', async () => {
    await Probe.updateOne({ _id: 1 }, { $push: { items: { amount: '10.00', label: 'first', id: 7 } } });
    const row = await Probe.collection.findOne({ _id: 1 });
    assert.deepEqual(Object.keys(row.items[0]), ['amount', 'label', 'id']);
    assert.equal(row.items[0].amount, '10.00');
  });

  it('stores null for $set: { x: undefined }', async () => {
    await Probe.updateOne({ _id: 1 }, { $set: { name: undefined } });
    const row = await Probe.collection.findOne({ _id: 1 });
    assert.ok('name' in row);
    assert.equal(row.name, null);
  });

  it('lean insertMany keeps field order and applies no defaults or casting', async () => {
    await Probe.insertMany([{ _id: 2, name: 'two', status: '5', extra: 'x' }], { lean: true });
    const row = await Probe.collection.findOne({ _id: 2 });
    assert.deepEqual(Object.keys(row), ['_id', 'name', 'status', 'extra']);
    assert.equal(row.status, '5');
    assert.ok(!('items' in row));
  });
});
