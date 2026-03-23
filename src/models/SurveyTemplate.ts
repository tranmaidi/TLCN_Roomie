import mongoose, { Document, Schema } from "mongoose";

export type QuestionType = "text" | "select" | "multiselect" | "number" | "date" | "checkbox";

export interface IQuestion {
  questionId: string; // unique within template, e.g. "q_city"
  label: string;
  type: QuestionType;
  options?: string[]; // for select / multiselect
  required?: boolean;
  order?: number;
  meta?: any;
}

export interface ISurveyTemplate extends Document {
  title: string;
  description?: string;
  questions: IQuestion[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    questionId: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const SurveyTemplateSchema = new Schema<ISurveyTemplate>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    questions: { type: [QuestionSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SurveyTemplateSchema.index({ isActive: 1, title: 1 });

const SurveyTemplate = mongoose.model<ISurveyTemplate>("SurveyTemplate", SurveyTemplateSchema);
export default SurveyTemplate;