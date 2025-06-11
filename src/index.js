import connectDB from "./db/index.js";
import app from "./app.js";
import dotenv from "dotenv";
dotenv.config({
    path: "./.env"
});


// database connection

connectDB()
.then(()=>{
    app.listen(process.env.PORT || 8000,()=>{
        console.log("Server is running on port:", process.env.PORT || 8000);
    })
})
.catch((error) => {
    console.error("Database connection failed:", error);
});