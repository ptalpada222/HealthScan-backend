import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
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
    res.status(500).json({
      statusCode: 500,
      message:
        "Something went wrong while generating access tokens and refresh tokens",
    });
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //Taking user details from request body
  const { email, phoneNumber, password } = req.body;

  // Validate that all fields are provided
  if ([email, phoneNumber, password].some((field) => field?.trim() === "")) {
    return res.status(400).json({
      statusCode: 400,
      message: "All fields are required",
    });
  }

  // Check if user already exists with the same email or phone number
  const existingUser = await User.findOne({
    $or: [{ email }, { phoneNumber }],
  });

  // If user already exists, throw an error
  if (existingUser) {
    return res.status(409).json({
      statusCode: 409,
      message: "User already exists with this email or phone number",
    });
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
    return res.status(500).json({
      statusCode: 500,
      message: "Something went wrong while creating user",
    });
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
    return res.status(400).json({
      statusCode: 400,
      message: "Email and password are required",
    });
  }

  const user = await User.findOne({ email });

  // If user does not exist, throw an error
  if (!user) {
    return res.status(404).json({
      statusCode: 404,
      message: "User not found with this email",
    });
  }

  // Check if password is correct
  const isPasswordCorrect = await user.isPasswordCorrect(password);

  if (!isPasswordCorrect) {
    return res.status(401).json({
      statusCode: 401,
      message: "Incorrect password",
    });
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
    return res.status(400).json({
      statusCode: 400,
      message: "Anauthentication failed. Refresh token is required.",
    });
  }

  try {
    const decodeToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodeToken?._id);

    // If user does not exist, throw an error
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "Invalid refresh token",
      });
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      return res.status(401).json({
        statusCode: 401,
        message: "Refresh token is expired or used",
      });
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
    return res.status(401).json({
      statusCode: 401,
      message: error?.message || "Invalid refresh token",
    });
  }
});

export { registerUser, loginUser, refreshAccessToken };
