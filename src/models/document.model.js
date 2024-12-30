import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  metadata_small: {
    type: String,
    required: true
  },
  metadata_big_1: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata_big_2: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata_big_3: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export const Document = mongoose.model('Document', documentSchema);