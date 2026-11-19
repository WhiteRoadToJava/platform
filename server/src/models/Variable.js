import mongoose from 'mongoose';

const variableSchema = new mongoose.Schema(
  {
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    environment: { type: mongoose.Schema.Types.ObjectId, ref: 'Environment', required: true },
    key: { type: String, required: true },
    valueEncrypted: { type: String, required: true },
    sensitive: { type: Boolean, default: false },
  },
  { timestamps: true },
);

variableSchema.index({ service: 1, environment: 1, key: 1 }, { unique: true });

export const Variable = mongoose.model('Variable', variableSchema);