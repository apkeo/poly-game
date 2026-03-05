import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IPlayer extends Document {
  _id: mongoose.Types.ObjectId;
  login: string;
  createdAt: Date;
  updatedAt: Date;
}

const LOGIN_REGEX = /^[a-z0-9]+$/;

export function validateLogin(login: string): boolean {
  return typeof login === 'string' && login.length >= 1 && login.length <= 64 && LOGIN_REGEX.test(login);
}

const playerSchema = new Schema<IPlayer>(
  {
    login: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export const Player: Model<IPlayer> =
  mongoose.models.Player ?? mongoose.model<IPlayer>('Player', playerSchema);
