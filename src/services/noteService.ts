import mongoose from "mongoose";
import Note, { INote, INoteItem } from "../models/Note";

function normalizeDateToDay(date: Date | string): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const noteService = {
  async listByUser(userId: string | mongoose.Types.ObjectId, start?: string, end?: string) {
    const query: any = { user: new mongoose.Types.ObjectId(userId) };
    if (start && end) {
      const s = normalizeDateToDay(start);
      const e = normalizeDateToDay(end);
      query.date = { $gte: s, $lte: e };
    }
    return Note.find(query).sort({ date: 1 }).lean();
  },

  async getByDate(userId: string | mongoose.Types.ObjectId, date: string | Date) {
    const d = normalizeDateToDay(date);
    return Note.findOne({ user: new mongoose.Types.ObjectId(userId), date: d });
  },

  async createItems(userId: string | mongoose.Types.ObjectId, date: string | Date, items: INoteItem[]) {
    if (!Array.isArray(items) || items.length === 0) throw new Error("items phải là mảng và không rỗng");
    const d = normalizeDateToDay(date);
    const userObjId = new mongoose.Types.ObjectId(userId);
    const query = { user: userObjId, date: d };

    // Nếu đã có document => push các items mới vào mảng items (append)
    // Nếu chưa có => upsert tạo mới với items được chèn
    const update = {
      $push: { items: { $each: items } },
      $setOnInsert: { user: userObjId, date: d },
    };

    const doc = await Note.findOneAndUpdate(query, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    if (!doc) throw new Error("Không thể thêm note");
    return doc;
  },

  async updateItems(noteId: string, userId: string | mongoose.Types.ObjectId, items: INoteItem[]) {
    const note = await Note.findById(noteId);
    if (!note) throw new Error("Note không tồn tại");
    if (!note.user.equals(new mongoose.Types.ObjectId(userId))) throw new Error("Không có quyền");
    note.items = items;
    return note.save();
  },

  async remove(noteId: string, userId: string | mongoose.Types.ObjectId) {
    const note = await Note.findById(noteId);
    if (!note) throw new Error("Note không tồn tại");
    if (!note.user.equals(new mongoose.Types.ObjectId(userId))) throw new Error("Không có quyền");
    return Note.deleteOne({ _id: noteId });
  },
};

export default noteService;