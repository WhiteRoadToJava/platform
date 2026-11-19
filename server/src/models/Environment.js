import mongoose from 'mongoose';

const environmentSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['production', 'preview'], required: true },
    branch: String,
    activeAt: Date,
    stoppedAt: Date,
    stopReason: { type: String, enum: ['auto', 'manual'] },
    database: {
      name: String,
      username: String,
      passwordEncrypted: String,
      refreshedAt: Date,
    },
  },
  { timestamps: true },
);

environmentSchema.index({ project: 1, name: 1 }, { unique: true });

export const Environment = mongoose.model('Environment', environmentSchema);