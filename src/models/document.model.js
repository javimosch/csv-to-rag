import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true,
    index: true
  },
  metadata_small: {
    type: String,
    required: true
  },
  metadata_big_1: {
    type: mongoose.Schema.Types.Mixed
  },
  metadata_big_2: {
    type: mongoose.Schema.Types.Mixed
  },
  metadata_big_3: {
    type: mongoose.Schema.Types.Mixed
  },
  namespace: {
    type: String,
    default: 'default'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Remove single index on code since we'll use a compound index
documentSchema.index({ code: 1, namespace: 1 }, { unique: true });

// Compound index for efficient querying by fileName
documentSchema.index({ fileName: 1, code: 1 });

export const Document = mongoose.model('Document', documentSchema);