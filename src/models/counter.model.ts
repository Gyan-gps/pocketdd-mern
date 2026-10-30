// AUTO_INCREMENT replacement: one sequence per collection (`<collection>`) or embedded child table
// (`<collection>.<field>`). Holds the last id handed out; see db/mongo.ts nextId().
import { Schema, model } from 'mongoose';

export const counterSchema = new Schema(
  {
    _id: { type: String },
    seq: { type: Number },
  },
  { collection: 'counters', versionKey: false, timestamps: false, strict: false, autoIndex: false, autoCreate: false, id: false },
);

export const Counter = model('Counter', counterSchema);
