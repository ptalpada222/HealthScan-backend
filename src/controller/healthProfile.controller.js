import HealthProfile from "../models/healthProfile.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

//utiliity function which take the string and convert into array by separting by comma
const toArray = (str) => {
  if (!str || typeof str !== "string") return [];
  return str
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

// Create or Update Health Profile
const createOrUpdateHealthProfile = asyncHandler(async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies.refreshToken;

    if (!incomingRefreshToken) {
      return res.status(401).json({
        statusCode: 401,
        message: "Authentication failed. Refresh token is required.",
      });
    }
    const decodeToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const userId = decodeToken?._id;
    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid refresh token",
      });
    }
    const {
      fullName,
      age,
      gender,
      heightCm,
      weightKg,
      healthConditions = [],
      healthGoals = [],
      dietaryRestrictions = [],
      foodAllergies = [],
      dietaryPreferences = {},
      uploadedFiles = [],
    } = req.body;

    const {
      preferredCuisines = "",
      mealFrequency = "",
      snackingHabits = "",
    } = dietaryPreferences;

    const parsedProfile = {
      fullName,
      age,
      gender,
      heightCm,
      weightKg,
      healthConditions: Array.isArray(healthConditions)
        ? healthConditions
        : toArray(healthConditions),
      otherHealthConditions: toArray(req.body.otherHealthConditions),
      healthGoals: Array.isArray(healthGoals)
        ? healthGoals
        : toArray(healthGoals),
      otherHealthGoals: toArray(req.body.otherHealthGoals),
      dietaryRestrictions: Array.isArray(dietaryRestrictions)
        ? dietaryRestrictions
        : toArray(dietaryRestrictions),
      otherDietaryRestrictions: toArray(req.body.otherDietaryRestrictions),
      foodAllergies: Array.isArray(foodAllergies)
        ? foodAllergies
        : toArray(foodAllergies),
      otherAllergies: toArray(req.body.otherAllergies),
      dietaryPreferences: {
        preferredCuisines: toArray(preferredCuisines),
        mealFrequency,
        snackingHabits,
      },
      additionalInformation: toArray(req.body.additionalInformation),
      uploadedFiles,
    };

    // Basic validation for required fields
    if (!fullName || !age || !gender || !heightCm || !weightKg) {
      return res.status(400).json({
        statusCode: 400,
        message: "Full name, age, gender, height, and weight are required",
      });
    }

    // Check if profile already exists for this user
    const existingProfile = await HealthProfile.findOne({ userId });

    let healthProfile;
    if (existingProfile) {
      // Update existing profile
      healthProfile = await HealthProfile.findOneAndUpdate(
        { userId },
        parsedProfile,
        { new: true, runValidators: true }
      );
    } else {
      // Create new profile
      healthProfile = new HealthProfile({ userId, ...parsedProfile });
      await healthProfile.save();
    }
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          healthProfile,
          existingProfile
            ? "Health profile updated successfully"
            : "Health profile created successfully"
        )
      );
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      message: "Something went wrong while creating or updating health profile",
    });
  }
});

export { createOrUpdateHealthProfile };
