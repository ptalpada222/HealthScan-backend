import HealthProfile from "../models/healthProfile.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

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
      healthConditions,
      otherHealthConditions,
      healthGoals,
      otherHealthGoals,
      dietaryRestrictions,
      otherDietaryRestrictions,
      foodAllergies,
      otherAllergies,
      dietaryPreferences,
      additionalInformation,
      uploadedFiles,
    } = req.body;

    // Basic validation for required fields
    if (!fullName || !age || !gender || !heightCm || !weightKg) {
      return res.status(400).json({
        statusCode: 400,
        message: "Full name, age, gender, height, and weight are required"
      });
    }

    // Check if profile already exists for this user
    const existingProfile = await HealthProfile.findOne({ userId });

    let healthProfile;
    if (existingProfile) {
      // Update existing profile
      healthProfile = await HealthProfile.findOneAndUpdate(
        { userId },
        {
          fullName,
          age,
          gender,
          heightCm,
          weightKg,
          healthConditions,
          otherHealthConditions,
          healthGoals,
          otherHealthGoals,
          dietaryRestrictions,
          otherDietaryRestrictions,
          foodAllergies,
          otherAllergies,
          dietaryPreferences,
          additionalInformation,
          uploadedFiles,
        },
        { new: true, runValidators: true }
      );
    } else {
      // Create new profile
      healthProfile = new HealthProfile({
        userId,
        fullName,
        age,
        gender,
        heightCm,
        weightKg,
        healthConditions,
        otherHealthConditions,
        healthGoals,
        otherHealthGoals,
        dietaryRestrictions,
        otherDietaryRestrictions,
        foodAllergies,
        otherAllergies,
        dietaryPreferences,
        additionalInformation,
        uploadedFiles,
      });
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
    res
      .status(500)
      .json({
        statusCode: 500,
        message: "Something went wrong while creating or updating health profile"
      });
  }
});

export { createOrUpdateHealthProfile };
