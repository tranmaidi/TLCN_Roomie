import mongoose, { Document, Schema } from "mongoose";

export interface INoteItem {
  title: string;
  description?: string;
  done?: boolean;
}

export interface INote extends Document {
  user: mongoose.Types.ObjectId;
  date: Date; // normalized to day (midnight)
  items: INoteItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

const NoteItemSchema = new Schema<INoteItem>(
  {
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, maxlength: 1000, default: "" },
    done: { type: Boolean, default: false },
  },
  { _id: false }
);

const noteSchema = new Schema<INote>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    items: { type: [NoteItemSchema], default: [] },
  },
  { timestamps: true }
);

// ensure one note per user per date
noteSchema.index({ user: 1, date: 1 }, { unique: true });

const Note = mongoose.model<INote>("Note", noteSchema);
export default Note;