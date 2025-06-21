import path from "path";
import fs from "fs/promises";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import mime from "mime-types";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: "./.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// configuration with validation
const CONFIG = {
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"],
  ALLOWED_MIME_TYPES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  CACHE_DIR: path.join(__dirname, "../../.cache"),
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours
  GEMINI_MODEL: "gemini-1.5-flash",
  MAX_RETRIES: 5,
  RETRY_DELAY: 1000, // 1 second
  REQUEST_TIMEOUT: 30000, // 30 seconds
  RATE_LIMIT: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
  SAFETY_SETTINGS: [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_NONE",
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_NONE",
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_NONE",
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_NONE",
    },
  ],
  GENERATION_CONFIG: {
    temperature: 0.3, // Lower for more consistent results
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 4096, // Increased for detailed responses
  },
};

//system prompt
const SYSTEM_PROMPT = `
You are an expert nutritionist and food analyst. Analyze the food product packaging image and extract information with high precision.

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON, no additional text
- Use null for missing data, never leave fields undefined
- Be conservative with health scores - base on actual nutritional content
- Identify all forms of sugar (sucrose, fructose, glucose, etc.)
- Flag artificial additives and preservatives

REQUIRED JSON STRUCTURE:
{
  "productName": "string",
  "brand": "string", 
  "category": "string",
  "ingredients": [
    {
      "name": "string",
      "order": number,
      "isAllergen": boolean,
      "isAdditive": boolean,
      "isSugar": boolean,
      "concerns": ["string"]
    }
  ],
  "nutrition": {
    "servingSize": "string",
    "servingsPerContainer": number,
    "calories": number,
    "macros": {
      "protein": number,
      "totalCarbs": number,
      "dietaryFiber": number,
      "totalSugars": number,
      "addedSugars": number,
      "totalFat": number,
      "saturatedFat": number,
      "transFat": number
    },
    "micronutrients": {
      "sodium": number,
      "cholesterol": number,
      "vitamins": [{"name": "string", "amount": "string", "dv": number}],
      "minerals": [{"name": "string", "amount": "string", "dv": number}]
    }
  },
  "allergens": ["string"],
  "dietaryInfo": {
    "isVegan": boolean,
    "isVegetarian": boolean,
    "isGlutenFree": boolean,
    "isKeto": boolean,
    "isDairy": boolean
  },
  "healthMetrics": {
    "healthScore": number,
    "processingLevel": "unprocessed|minimally processed|processed|ultra-processed",
    "novaGroup": number,
    "warnings": ["string"],
    "benefits": ["string"]
  },
  "confidence": number
}`;

// Custom error classes for better error handling
class ValidationError extends Error {
  constructor(message, code = "VALIDATION_ERROR") {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

class ProcessingError extends Error {
  constructor(message, code = "PROCESSING_ERROR") {
    super(message);
    this.name = "ProcessingError";
    this.code = code;
  }
}

class GeminiError extends Error {
  constructor(message, code = "GEMINI_ERROR") {
    super(message);
    this.name = "GeminiError";
    this.code = code;
  }
}

// Initialize Gemini with error handling
let model;
try {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({
    model: CONFIG.GEMINI_MODEL,
    safetySettings: CONFIG.SAFETY_SETTINGS,
    generationConfig: CONFIG.GENERATION_CONFIG,
  });
} catch (error) {
  console.error("Failed to initialize Gemini:", error.message);
  process.exit(1);
}

/**
 * Enhanced default food data structure with better typing
 */
const getDefaultFoodData = () => ({
  productName: null,
  brand: null,
  category: null,
  ingredients: [],
  nutrition: {
    servingSize: null,
    servingsPerContainer: null,
    calories: null,
    macros: {
      protein: null,
      totalCarbs: null,
      dietaryFiber: null,
      totalSugars: null,
      addedSugars: null,
      totalFat: null,
      saturatedFat: null,
      transFat: null,
    },
    micronutrients: {
      sodium: null,
      cholesterol: null,
      vitamins: [],
      minerals: [],
    },
  },
  allergens: [],
  dietaryInfo: {
    isVegan: null,
    isVegetarian: null,
    isGlutenFree: null,
    isKeto: null,
    isDairy: null,
  },
  healthMetrics: {
    healthScore: null,
    processingLevel: null,
    novaGroup: null,
    warnings: [],
    benefits: [],
  },
  confidence: 0,
});

/*
 file validation with detailed error messages
 */
const validateUploadedFile = (file) => {
  if (!file) {
    throw new ValidationError("No file provided", "NO_FILE");
  }

  const fileExt = path.extname(file.originalname).toLowerCase();
  const mimeType = mime.lookup(fileExt) || file.mimetype;

  if (!CONFIG.ALLOWED_EXTENSIONS.includes(fileExt)) {
    throw new ValidationError(
      `Invalid file extension '${fileExt}'. Allowed: ${CONFIG.ALLOWED_EXTENSIONS.join(", ")}`,
      "INVALID_EXTENSION"
    );
  }

  if (!CONFIG.ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ValidationError(
      `Invalid MIME type '${mimeType}'. Allowed: ${CONFIG.ALLOWED_MIME_TYPES.join(", ")}`,
      "INVALID_MIME_TYPE"
    );
  }

  if (file.size > CONFIG.MAX_FILE_SIZE) {
    throw new ValidationError(
      `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds limit of ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
      "FILE_TOO_LARGE"
    );
  }

  // Additional security checks
  if (file.originalname.includes("..") || file.originalname.includes("/")) {
    throw new ValidationError("Invalid filename", "INVALID_FILENAME");
  }
};

/* file hash generation with error handling */
const generateFileHash = async (filePath) => {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = createHash("sha256");
    hashSum.update(fileBuffer);
    return hashSum.digest("hex");
  } catch (error) {
    throw new ProcessingError(
      `Failed to generate file hash: ${error.message}`,
      "HASH_ERROR"
    );
  }
};

/* cache management with better error handling */
const getCachedResult = async (cachePath) => {
  try {
    const stats = await fs.stat(cachePath);
    const cacheAge = Date.now() - stats.mtime.getTime();

    if (cacheAge > CONFIG.CACHE_TTL) {
      await safeUnlink(cachePath);
      return null;
    }

    const cacheData = await fs.readFile(cachePath, "utf8");
    const parsed = JSON.parse(cacheData);

    // Validate cache structure
    if (!parsed.timestamp || !parsed.result) {
      await safeUnlink(cachePath);
      return null;
    }

    return parsed.result;
  } catch (error) {
    // Cache miss or corrupted cache
    await safeUnlink(cachePath);
    return null;
  }
};

/* cache storage with atomic writes
 */
const cacheResult = async (cachePath, result) => {
  try {
    await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });

    const cacheData = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        result,
        version: "1.0",
      },
      null,
      2
    );

    // Atomic write using temporary file
    const tempPath = `${cachePath}.tmp`;
    await fs.writeFile(tempPath, cacheData);
    await fs.rename(tempPath, cachePath);
  } catch (error) {
    console.warn("Failed to cache result:", error.message);
  }
};

/**
 * Enhanced safe file deletion
 */
const safeUnlink = async (filePath) => {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch (error) {
    // File doesn't exist or can't be deleted - not critical
    if (error.code !== "ENOENT") {
      console.warn(`Could not delete file ${filePath}:`, error.message);
    }
  }
};

/**
 * Sleep utility for retry logic
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 Gemini processing with retry logic and better error handling
 */
const processWithGemini = async (imagePath, retryCount = 0) => {
  const startTime = Date.now();

  try {
    // Validate image file exists and is readable
    await fs.access(imagePath, fs.constants.R_OK);

    const imageBuffer = await fs.readFile(imagePath);
    const mimeType = mime.lookup(imagePath) || "image/jpeg";

    const imageData = {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType,
      },
    };

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Request timeout")),
        CONFIG.REQUEST_TIMEOUT
      );
    });

    // Process with Gemini
    const processPromise = (async () => {
      const result = await model.generateContent([SYSTEM_PROMPT, imageData]);
      const response = await result.response;
      return response.text();
    })();

    const text = await Promise.race([processPromise, timeoutPromise]);

    const processingTime = Date.now() - startTime;
    console.log(`Gemini processing completed in ${processingTime}ms`);

    // Enhanced JSON extraction and validation
    const cleanedText = text.trim();
    let jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      // Try to find JSON in code blocks
      const codeBlockMatch = cleanedText.match(
        /```(?:json)?\s*(\{[\s\S]*\})\s*```/
      );
      if (codeBlockMatch) {
        jsonMatch = [codeBlockMatch[1]];
      }
    }

    if (!jsonMatch) {
      throw new GeminiError(
        "No valid JSON found in Gemini response",
        "NO_JSON"
      );
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      throw new GeminiError(
        `Failed to parse JSON: ${parseError.message}`,
        "INVALID_JSON"
      );
    }

    // Validate required fields
    if (typeof parsedResult !== "object" || parsedResult === null) {
      throw new GeminiError("Invalid response structure", "INVALID_STRUCTURE");
    }

    // Merge with default structure and validate
    const result = mergeWithDefaults(parsedResult);
    return result;
  } catch (error) {
    console.error(
      `Gemini processing attempt ${retryCount + 1} failed:`,
      error.message
    );

    // Retry logic for transient errors
    if (retryCount < CONFIG.MAX_RETRIES && isRetryableError(error)) {
      const delay = CONFIG.RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Retrying in ${delay}ms...`);
      await sleep(delay);
      return processWithGemini(imagePath, retryCount + 1);
    }

    // If all retries failed or non-retryable error, return default data
    console.error(
      "All Gemini processing attempts failed, returning default data"
    );
    return getDefaultFoodData();
  }
};

/**
 * Check if error is retryable
 */
const isRetryableError = (error) => {
  const retryableErrors = [
    "Request timeout",
    "ECONNRESET",
    "ENOTFOUND",
    "ETIMEDOUT",
    "Rate limit exceeded",
  ];

  return retryableErrors.some((retryableError) =>
    error.message.includes(retryableError)
  );
};

/**
 * Merge parsed result with default structure
 */
const mergeWithDefaults = (parsedResult) => {
  const defaultData = getDefaultFoodData();

  return {
    ...defaultData,
    ...parsedResult,
    nutrition: {
      ...defaultData.nutrition,
      ...(parsedResult.nutrition || {}),
      macros: {
        ...defaultData.nutrition.macros,
        ...(parsedResult.nutrition?.macros || {}),
      },
      micronutrients: {
        ...defaultData.nutrition.micronutrients,
        ...(parsedResult.nutrition?.micronutrients || {}),
      },
    },
    dietaryInfo: {
      ...defaultData.dietaryInfo,
      ...(parsedResult.dietaryInfo || {}),
    },
    healthMetrics: {
      ...defaultData.healthMetrics,
      ...(parsedResult.healthMetrics || {}),
    },
    // Ensure arrays are properly formatted
    ingredients: Array.isArray(parsedResult.ingredients)
      ? parsedResult.ingredients
      : [],
    allergens: Array.isArray(parsedResult.allergens)
      ? parsedResult.allergens
      : [],
    // Validate confidence score
    confidence:
      typeof parsedResult.confidence === "number" &&
      parsedResult.confidence >= 0 &&
      parsedResult.confidence <= 100
        ? parsedResult.confidence
        : 0,
  };
};

// Main function which take the image file and gave back the result
const processImageData = async (file, options = {}) => {
  const requestId = options.requestId || Date.now().toString();
  const startTime = Date.now();

  console.log(`[${requestId}] Processing image data started`);

  if (!file) {
    const error = new ValidationError("No file provided", "NO_FILE");
    console.log(`[${requestId}] No file provided`);
    throw error;
  }

  const imagePath = path.resolve(file.path);
  let cacheKey = null;

  try {
    // Validate file
    validateUploadedFile(file);
    console.log(`[${requestId}] File validation passed: ${file.originalname}`);

    // Generate cache key
    cacheKey = await generateFileHash(imagePath);
    const cachePath = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);

    // Check cache
    const cachedResult = await getCachedResult(cachePath);
    if (cachedResult) {
      const processingTime = Date.now() - startTime;
      console.log(
        `[${requestId}] Cache hit, returning cached result (${processingTime}ms)`
      );

      return {
        success: true,
        data: cachedResult,
        metadata: {
          fromCache: true,
          model: CONFIG.GEMINI_MODEL,
          timestamp: new Date().toISOString(),
          processingTime,
          requestId,
          cacheKey,
        },
      };
    }

    // Process with Gemini
    console.log(`[${requestId}] Cache miss, processing with Gemini`);
    const result = await processWithGemini(imagePath);

    // Cache the result
    await cacheResult(cachePath, result);

    const processingTime = Date.now() - startTime;
    console.log(
      `[${requestId}] Processing completed successfully (${processingTime}ms)`
    );

    return {
      success: true,
      data: result,
      metadata: {
        fromCache: false,
        model: CONFIG.GEMINI_MODEL,
        timestamp: new Date().toISOString(),
        processingTime,
        requestId,
        cacheKey,
      },
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[${requestId}] Processing failed (${processingTime}ms):`, {
      error: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });

    // Return error object instead of sending response
    return {
      success: false,
      error: {
        code: error.code || "UNKNOWN_ERROR",
        message: error.message,
        type: error.name,
      },
      metadata: {
        processingTime,
        timestamp: new Date().toISOString(),
        requestId,
        cacheKey,
      },
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack,
      }),
    };
  } finally {
    // Always cleanup uploaded file
    await safeUnlink(imagePath);
    console.log(`[${requestId}] Cleanup completed`);
  }
};

export { processImageData };
