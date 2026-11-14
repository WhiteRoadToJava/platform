import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    repoUrl: { type: String, required: true },
    branch: { type: String, required: true, default: 'main' },
    buildType: {
      type: String,
      enum: ['auto', 'dockerfile', 'java', 'react', 'node'],
      default: 'auto',
    },
    internalPort: { type: Number, required: true },
    subdomain: { type: String, default: '' },
    pathPrefix: { type: String, default: '' },
    stripPrefix: { type: Boolean, default: false },
    healthcheckPath: { type: String, default: '' },
    memoryLimitMb: { type: Number, default: 512 },
    volumes: [{ containerPath: { type: String, required: true }, _id: false }],
  },
  { timestamps: true },
);

serviceSchema.index({ project: 1, slug: 1 }, { unique: true });

export const Service = mongoose.model('Service', serviceSchema);