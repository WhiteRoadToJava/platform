import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema(
  { passwordHash: { type: String, required: true } },
  { timestamps: true },
);

export const Admin = mongoose.model('Admin', adminSchema);