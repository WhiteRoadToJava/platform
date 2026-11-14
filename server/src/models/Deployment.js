import mongoose from 'mongoose';

const deploymentSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    environment: { type: mongoose.Schema.Types.ObjectId, ref: 'Environment', required: true },
    status: {
      type: String,
      enum: ['queued', 'building', 'built', 'failed', 'cancelled'],
      default: 'queued',
    },
    branch: String,
    commitSha: String,
    commitMessage: String,
    buildType: String,
    image: String,
    error: String,
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true },
);

deploymentSchema.index({ service: 1, createdAt: -1 });
deploymentSchema.index({ status: 1, createdAt: 1 });

export const Deployment = mongoose.model('Deployment', deploymentSchema);