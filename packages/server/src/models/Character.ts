import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ICharacterAnimation {
  id: string;
  name: string;
  glbPath: string;
}

export interface ICharacter extends Document {
  _id: mongoose.Types.ObjectId;
  playerId?: mongoose.Types.ObjectId;
  originalImagePath: string;
  description?: string;
  generatedImagePath?: string;
  meshyTaskId?: string;
  modelUrl?: string;
  thumbnailUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  jobProgress?: number;
  error?: string;
  rigTaskId?: string;
  riggedModelPath?: string;
  animations?: ICharacterAnimation[];
  createdAt: Date;
  updatedAt: Date;
}

const characterAnimationSchema = new Schema<ICharacterAnimation>(
  { id: String, name: String, glbPath: String },
  { _id: false }
);

const characterSchema = new Schema<ICharacter>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'Player' },
    originalImagePath: { type: String, required: true },
    description: String,
    generatedImagePath: String,
    meshyTaskId: String,
    modelUrl: String,
    thumbnailUrl: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    jobProgress: Number,
    error: String,
    rigTaskId: String,
    riggedModelPath: String,
    animations: [characterAnimationSchema],
  },
  { timestamps: true }
);

export const Character: Model<ICharacter> =
  mongoose.models.Character ?? mongoose.model<ICharacter>('Character', characterSchema);
