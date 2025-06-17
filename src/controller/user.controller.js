import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";

const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access tokens and refresh tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //Taking user details from request body
  const { email, phoneNumber, password } = req.body;

  // Validate that all fields are provided
  if ([email, phoneNumber, password].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  // Check if user already exists with the same email or phone number
  const existingUser = await User.findOne({
    $or: [{ email }, { phoneNumber }],
  });

  // If user already exists, throw an error
  if (existingUser) {
    throw new ApiError(
      409,
      "User already exists with this email or phone number"
    );
  }

  // Create a new user
  const user = await User.create({
    email,
    phoneNumber,
    password,
  });

  // If user creation fails, throw an error
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while creating user");
  }

  //return response with created user details
  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User created successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  //Taking user details from request body
  const { email, password } = req.body;

  //check if email and password are provided
  if (!email) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email });

  // If user does not exist, throw an error
  if (!user) {
    throw new ApiError(404, "User not found with this email");
  }

  // Check if password is correct
  const isPasswordCorrect = await user.isPasswordCorrect(password);

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Incorrect password");
  }

  //generate access and refresh tokens
  const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true, // Set to true if using HTTPS
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  // Check if refresh token is provided
  if (!incomingRefreshToken) {
    throw new ApiError(
      400,
      "Anauthentication failed. Refresh token is required."
    );
  }

  try {
    const decodeToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodeToken?._id);

    // If user does not exist, throw an error
    if (!user) {
      throw new ApiError(404, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true, // Set to true if using HTTPS
    };

    //generate new access and refresh tokens
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    //return res
    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Tokens refreshed successfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

export { registerUser, loginUser, refreshAccessToken };
