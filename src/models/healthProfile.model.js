import mongoose from "mongoose";
import User from "./user.model.js"; 

const healthProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: User,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
      required: true,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: true,
    },
    heightCm: {
      type: Number,
      required: true,
    },
    weightKg: {
      type: Number,
      required: true,
    },
    healthConditions: {
      type: [String], // e.g., ['Diabetes Type 1', 'Asthma']
      default: [],
    },
    otherHealthConditions: {
      type: [String],
      default: [],
    },
    healthGoals: {
      type: [String], // e.g., ['Lose Weight', 'Build Muscle']
      default: [],
    },
    otherHealthGoals: {
      type: [String],
      default: [],
    },
    dietaryRestrictions: {
      type: [String], // e.g., ['Vegan', 'Keto']
      default: [],
    },
    otherDietaryRestrictions: {
      type: [String],
      default: [],
    },
    foodAllergies: {
      type: [String], // e.g., ['Peanuts', 'Milk']
      default: [],
    },
    otherAllergies: {
      type: [String],
      default: [],
    },
    dietaryPreferences: {
      preferredCuisines: {
        type: [String],
        default: [],
      },
      mealFrequency: {
        type: String,
        enum: ["2-3 meals per day", "3-4 meals per week", "5+ meals per week"],
        default: "",
      },
      snackingHabits: {
        type: String,
        enum: ["Frequently snack", "Occasionally snack", "Rarely snack"],
        default: "",
      },
    },
    additionalInformation: {
      type: [String],
      default: [],
    },
    uploadedFiles: {
      type: [String], // Store file paths or cloud URLs
      default: [],
    },
  },
  { timestamps: true }
);

const HealthProfile = mongoose.model("HealthProfile", healthProfileSchema);

export default HealthProfile;
