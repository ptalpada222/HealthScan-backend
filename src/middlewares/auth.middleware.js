import jwt from "jsonwebtoken";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import User from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    //get the access token from the request headers or cookies
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    // Check if access token is provided or not
    if (!token) {
      new ApiError(401, "Unauthorized request");
    }

    const decodeToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decodeToken?._id).select(
      "-password -refreshToken"
    );

    if(!user){
        new ApiError(401, "Invalid access token");
    }

    // Attach user to the request object
    req.user = user;
    next();

  } catch (error) {
    throw new ApiError(401, error?.message, "Invalid access token");
  }
});
