import express, { urlencoded } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

//Cors defines for cross-origin resource sharing which allows the server to accept requests from different origins.
const app = express();
app.use(cors(
    {
        origin: process.env.CORS_ORIGIN, // Allow all origins by default
        credentials: true,
    }
));

app.use(express.json({limit: "16kb"})); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: "16kb" })); // Parse URL-encoded bodies
app.use(express.static("public")); // Serve static files from the "public" directory
app.use(cookieParser());

export default app;