import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    baseDomain: { type: String, required: true },
  },
  { timestamps: true },
);

export const Project = mongoose.model('Project', projectSchema);