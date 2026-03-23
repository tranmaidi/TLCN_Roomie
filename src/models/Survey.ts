import mongoose, { Document, Schema } from "mongoose";

export interface ISurveyAnswer {
  questionId: string;
  value: any;
}

export interface ISurvey extends Document {
  user: mongoose.Types.ObjectId;
  answers: ISurveyAnswer[];
  skipped?: boolean;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const SurveySchema = new Schema<ISurvey>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, unique: true },
    answers: { type: [{ questionId: String, value: Schema.Types.Mixed }], default: [] },
    skipped: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

const Survey = mongoose.model<ISurvey>("Survey", SurveySchema);
export default Survey;