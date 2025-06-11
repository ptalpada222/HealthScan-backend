import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
    },
    refreshToken:{
        type: String      
    }
},{timestamps:true});

// Pre is Hook . This will store the password in hash format before saving it to the database.
userSchema.pre("save", async function(next){
    if(!this.isModified("password")){
        return next();
    }

    this.password = await bcrypt.hash(this.password, 10);
    next();
})

userSchema.methods.isPasswordCorrect = async function(password)
{
    return await bcrypt.compare(password, this.password);
}

//generateAccessToken is used to generate the access token for the user.
userSchema.methods.generateAccessToken = function() {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
        }
    );
}

userSchema.methods.generateRefreshToken = function() {
    return jwt.sign(
        {
            _id:this._id
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
        }
    )
}


const User = mongoose.model("User", userSchema);

export default User;
