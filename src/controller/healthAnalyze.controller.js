import path from "path"
import fs from "fs/promises"
import { createHash } from "crypto"
import { fileURLToPath } from "url"
import { createRequire } from "module"
import { GoogleGenerativeAI } from "@google/generative-ai"
import dotenv from "dotenv"
import asyncHandler from "../utils/asyncHandler.js"
import { processImageData } from "./product.controller.js"
import jwt from "jsonwebtoken"
import HealthProfile from "../models/healthProfile.model.js"

// Load environment variables
dotenv.config({ path: "./.env" })

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const HEALTH_CONFIG = {
  CACHE_DIR: path.join(__dirname, "../../.cache/health"),
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hours
  GEMINI_MODEL: "gemini-1.5-flash",
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 90000, // 90 seconds for complex analysis
  GENERATION_CONFIG: {
    temperature: 0.1, // Very low for consistent health advice
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 8192, // Increased for more detailed analysis
  },
}

// Initialize Gemini for health analysis
let healthModel
try {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required")
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  healthModel = genAI.getGenerativeModel({
    model: HEALTH_CONFIG.GEMINI_MODEL,
    generationConfig: HEALTH_CONFIG.GENERATION_CONFIG,
  })
} catch (error) {
  console.error("Failed to initialize Gemini for health analysis:", error.message)
  process.exit(1)
}

// Custom error classes
class HealthAnalysisError extends Error {
  constructor(message, code = "HEALTH_ANALYSIS_ERROR") {
    super(message)
    this.name = "HealthAnalysisError"
    this.code = code
  }
}

class DatabaseError extends Error {
  constructor(message, code = "DATABASE_ERROR") {
    super(message)
    this.name = "DatabaseError"
    this.code = code
  }
}

/**
 * Enhanced system prompt for comprehensive health-based food analysis
 */
const createHealthAnalysisPrompt = (foodData, userHealthConditions) => {
  const conditionsText = userHealthConditions
    .map(
      (condition) =>
        `- ${condition.name}: ${condition.description || "No description"} (Severity: ${condition.severity || "Not specified"}, Type: ${condition.type})`,
    )
    .join("\n")

  return `
You are a certified nutritionist, registered dietitian, and medical dietary consultant with expertise in clinical nutrition. Provide a comprehensive health analysis of this food product for a user with specific health conditions.

USER'S HEALTH CONDITIONS:
${conditionsText}

FOOD PRODUCT DATA:
${JSON.stringify(foodData, null, 2)}

ANALYSIS REQUIREMENTS:
You must provide an extremely detailed analysis that includes:
1. Overall recommendation with safety scoring
2. Detailed ingredient-by-ingredient analysis with health impacts
3. Comprehensive nutritional analysis with condition-specific impacts
4. Portion guidance and consumption recommendations
5. Alternative product suggestions
6. Specific warnings and medical disclaimers

CRITICAL SAFETY NOTES:
- Be conservative with recommendations for serious health conditions
- Always recommend consulting healthcare providers
- Flag any ingredients that could cause adverse reactions
- Consider drug-nutrient interactions
- Provide specific guidance for each health condition

REQUIRED JSON RESPONSE FORMAT (MUST BE EXACTLY THIS STRUCTURE):
{
  "id": "${foodData.productName?.toLowerCase().replace(/\s+/g, "-") || "unknown-product"}-${Date.now()}",
  "name": "${foodData.productName || "Unknown Product"}",
  "brand": "${foodData.brand || "Unknown Brand"}",
  "recommendation": "highly_recommended|recommended|moderate_caution|not_recommended|strongly_avoid",
  "summary": "Brief one-sentence summary of the recommendation",
  "recommendationDetail": "Detailed explanation of why this recommendation was made, mentioning specific nutrients/ingredients and health conditions",
  "pros": [
    "Detailed benefit 1: Explain the nutrient/ingredient, its health benefit, and why it's good for the user's conditions",
    "Detailed benefit 2: Include specific amounts and percentages where relevant"
  ],
  "cons": [
    "Detailed concern 1: Explain the problematic nutrient/ingredient, why it's concerning, and specific health risks",
    "Detailed concern 2: Include specific amounts and how they relate to daily limits"
  ],
  "ingredients": [
    {
      "name": "Ingredient Name",
      "impact": "good|neutral|bad",
      "description": "Brief description of what this ingredient is",
      "summary": "Detailed summary of this ingredient's role and health implications",
      "benefits": ["Specific benefit 1", "Specific benefit 2"],
      "concerns": ["Specific concern 1", "Specific concern 2"],
      "safeConsumption": {
        "recommendation": "Specific recommendation for this ingredient given user's health conditions",
        "limits": "Specific daily/weekly limits if applicable",
        "alternatives": "Healthier alternatives to this ingredient"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Specific impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Specific impact on this condition if applicable"
      }
    }
  ],
  "nutrients": {
    "calories": {
      "amount": ${foodData.nutrition?.calories || 0},
      "unit": "kcal",
      "dailyValue": "percentage of daily value",
      "impact": "good|neutral|bad",
      "summary": "Detailed analysis of calorie content and its implications",
      "benefits": ["Benefit if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Specific recommendation for calorie intake",
        "dailyRecommendedIntake": "Recommended daily calories for user's profile",
        "percentOfDaily": "percentage"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    },
    "total_fat": {
      "amount": ${foodData.nutrition?.macros?.totalFat || 0},
      "unit": "g",
      "dailyValue": "percentage",
      "impact": "good|neutral|bad",
      "summary": "Analysis of total fat content",
      "benefits": ["Benefits if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Fat intake recommendation",
        "dailyRecommendedIntake": "Daily fat recommendation",
        "percentOfDaily": "percentage"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    },
    "saturated_fat": {
      "amount": ${foodData.nutrition?.macros?.saturatedFat || 0},
      "unit": "g",
      "dailyValue": "percentage",
      "impact": "good|neutral|bad",
      "summary": "Analysis of saturated fat content",
      "benefits": ["Benefits if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Saturated fat recommendation",
        "dailyRecommendedIntake": "Daily saturated fat limit",
        "percentOfDaily": "percentage"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    },
    "sodium": {
      "amount": ${foodData.nutrition?.micronutrients?.sodium || 0},
      "unit": "mg",
      "dailyValue": "percentage",
      "impact": "good|neutral|bad",
      "summary": "Analysis of sodium content",
      "benefits": ["Benefits if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Sodium intake recommendation",
        "dailyRecommendedIntake": "Daily sodium limit for user's conditions",
        "percentOfDaily": "percentage"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    },
    "total_carbohydrates": {
      "amount": ${foodData.nutrition?.macros?.totalCarbs || 0},
      "unit": "g",
      "dailyValue": "percentage",
      "impact": "good|neutral|bad",
      "summary": "Analysis of carbohydrate content",
      "benefits": ["Benefits if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Carbohydrate recommendation",
        "dailyRecommendedIntake": "Daily carb recommendation",
        "percentOfDaily": "percentage or N/A for diabetes"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    },
    "dietary_fiber": {
      "amount": ${foodData.nutrition?.macros?.dietaryFiber || 0},
      "unit": "g",
      "dailyValue": "percentage",
      "impact": "good|neutral|bad",
      "summary": "Analysis of fiber content",
      "benefits": ["Benefits if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Fiber recommendation",
        "dailyRecommendedIntake": "Daily fiber recommendation",
        "percentOfDaily": "percentage"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    },
    "sugars": {
      "amount": ${foodData.nutrition?.macros?.totalSugars || 0},
      "unit": "g",
      "dailyValue": null,
      "impact": "good|neutral|bad",
      "summary": "Analysis of sugar content",
      "benefits": ["Benefits if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Sugar intake recommendation",
        "dailyRecommendedIntake": "Daily sugar limit",
        "percentOfDaily": "percentage of general recommendation"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    },
    "protein": {
      "amount": ${foodData.nutrition?.macros?.protein || 0},
      "unit": "g",
      "dailyValue": "percentage",
      "impact": "good|neutral|bad",
      "summary": "Analysis of protein content",
      "benefits": ["Benefits if any"],
      "concerns": ["Concerns if any"],
      "safeConsumption": {
        "recommendation": "Protein recommendation",
        "dailyRecommendedIntake": "Daily protein recommendation",
        "percentOfDaily": "percentage"
      },
      "healthImpact": {
        "${userHealthConditions[0]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition",
        "${userHealthConditions[1]?.name.toLowerCase().replace(/\s+/g, "_") || "general"}": "Impact on this condition if applicable"
      }
    }
  },
  "alternatives": [
    {
      "id": "alternative-1-id",
      "name": "Alternative Product Name",
      "brand": "Brand Name",
      "benefits": ["Specific benefit 1", "Specific benefit 2", "Specific benefit 3"]
    },
    {
      "id": "alternative-2-id", 
      "name": "Alternative Product Name 2",
      "brand": "Brand Name 2",
      "benefits": ["Specific benefit 1", "Specific benefit 2", "Specific benefit 3"]
    }
  ],
  "overallRecommendation": "highly_recommended|recommended|moderate_caution|not_recommended|strongly_avoid",
  "safetyScore": "number between 0-100",
  "suitabilityAnalysis": {
    "beneficial": [
      {
        "aspect": "Specific beneficial aspect",
        "reason": "Detailed explanation",
        "healthBenefit": "Specific health benefit",
        "relatedConditions": ["condition names that benefit"]
      }
    ],
    "concerns": [
      {
        "aspect": "Specific concerning aspect",
        "severity": "low|moderate|high|critical",
        "reason": "Detailed explanation",
        "healthRisk": "Specific health risk",
        "relatedConditions": ["condition names affected"],
        "mitigation": "How to reduce risk"
      }
    ]
  },
  "portionGuidance": {
    "recommendedServing": "Specific serving size recommendation",
    "frequency": "daily|weekly|occasionally|rarely|never",
    "reasoning": "Detailed reasoning for portion guidance"
  },
  "alternativeSuggestions": [
    {
      "suggestion": "Alternative suggestion",
      "reason": "Why this alternative is better"
    }
  ],
  "keyWarnings": ["Critical warning 1", "Critical warning 2"],
  "medicalDisclaimer": "Standard medical disclaimer about consulting healthcare providers",
  "confidence": "number between 0-100"
}

IMPORTANT INSTRUCTIONS:
1. Analyze EVERY ingredient in the ingredients list with detailed health impacts
2. Analyze ALL major nutrients with specific daily value percentages
3. Consider drug-nutrient interactions for medications
4. Provide specific portion sizes and frequency recommendations
5. Include at least 3 alternative product suggestions
6. Be extremely detailed in your analysis - this is for medical/health purposes
7. Calculate accurate daily value percentages based on standard recommendations
8. Adjust recommendations based on severity of health conditions
9. Include specific warnings for each health condition
10. Ensure all numeric values are realistic and accurate

Provide the most comprehensive, detailed, and medically sound analysis possible. This analysis will be used by healthcare providers and patients for dietary decisions.`
}

/**
 * Fetch user's health conditions from HealthProfile model
 */
const getUserHealthConditions = async (userId) => {
  try {
    console.log(`Fetching health profile for user: ${userId}`)

    // Find the user's health profile
    const healthProfile = await HealthProfile.findOne({ userId }).lean()

    if (!healthProfile) {
      console.log(`No health profile found for user: ${userId}`)
      return []
    }

    // Extract health conditions from the profile
    const healthConditions = []

    // Add chronic diseases
    if (healthProfile.chronicDiseases && healthProfile.chronicDiseases.length > 0) {
      healthProfile.chronicDiseases.forEach((disease) => {
        healthConditions.push({
          id: disease._id || disease.id,
          name: disease.name,
          description: disease.description || `Chronic disease: ${disease.name}`,
          severity: disease.severity || "moderate",
          type: "chronic_disease",
          diagnosed_date: disease.diagnosedDate || healthProfile.createdAt,
          status: "active",
        })
      })
    }

    // Add allergies as health conditions
    if (healthProfile.allergies && healthProfile.allergies.length > 0) {
      healthProfile.allergies.forEach((allergy) => {
        healthConditions.push({
          id: allergy._id || allergy.id,
          name: `${allergy.name} Allergy`,
          description: `Allergic reaction to ${allergy.name}. Severity: ${allergy.severity || "unknown"}`,
          severity: allergy.severity || "moderate",
          type: "allergy",
          status: "active",
        })
      })
    }

    // Add dietary restrictions as health-related conditions
    if (healthProfile.dietaryRestrictions && healthProfile.dietaryRestrictions.length > 0) {
      healthProfile.dietaryRestrictions.forEach((restriction) => {
        healthConditions.push({
          id: restriction._id || restriction.id,
          name: `${restriction.name} Dietary Restriction`,
          description: restriction.description || `Dietary restriction: ${restriction.name}`,
          severity: "moderate",
          type: "dietary_restriction",
          status: "active",
        })
      })
    }

    // Add medications that might affect food choices
    if (healthProfile.medications && healthProfile.medications.length > 0) {
      healthProfile.medications.forEach((medication) => {
        healthConditions.push({
          id: medication._id || medication.id,
          name: `Medication: ${medication.name}`,
          description: `Currently taking ${medication.name}${medication.dosage ? ` (${medication.dosage})` : ""}. May have food interactions.`,
          severity: "moderate",
          type: "medication",
          status: "active",
        })
      })
    }

    console.log(`Found ${healthConditions.length} health conditions for user: ${userId}`)
    return healthConditions
  } catch (error) {
    console.error(`Error fetching health conditions for user ${userId}:`, error)
    throw new DatabaseError(`Failed to fetch user health conditions: ${error.message}`, "USER_HEALTH_FETCH_ERROR")
  }
}

/**
 * Generate cache key for health analysis
 */
const generateHealthCacheKey = async (foodData, userHealthConditions) => {
  const hashInput = JSON.stringify({
    foodData: {
      productName: foodData.productName,
      ingredients: foodData.ingredients,
      nutrition: foodData.nutrition,
      allergens: foodData.allergens,
    },
    conditions: userHealthConditions.map((c) => ({ id: c.id, name: c.name, type: c.type })),
  })

  const hash = createHash("sha256")
  hash.update(hashInput)
  return hash.digest("hex")
}

/**
 * Cache management for health analysis
 */
const getCachedHealthAnalysis = async (cacheKey) => {
  try {
    const cachePath = path.join(HEALTH_CONFIG.CACHE_DIR, `${cacheKey}.json`)
    const stats = await fs.stat(cachePath)
    const cacheAge = Date.now() - stats.mtime.getTime()

    if (cacheAge > HEALTH_CONFIG.CACHE_TTL) {
      await fs.unlink(cachePath).catch(() => {})
      return null
    }

    const cacheData = await fs.readFile(cachePath, "utf8")
    const parsed = JSON.parse(cacheData)

    if (!parsed.timestamp || !parsed.result) {
      await fs.unlink(cachePath).catch(() => {})
      return null
    }

    return parsed.result
  } catch (error) {
    return null
  }
}

const cacheHealthAnalysis = async (cacheKey, result) => {
  try {
    await fs.mkdir(HEALTH_CONFIG.CACHE_DIR, { recursive: true })

    const cacheData = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        result,
        version: "2.0",
      },
      null,
      2,
    )

    const cachePath = path.join(HEALTH_CONFIG.CACHE_DIR, `${cacheKey}.json`)
    const tempPath = `${cachePath}.tmp`

    await fs.writeFile(tempPath, cacheData)
    await fs.rename(tempPath, cachePath)
  } catch (error) {
    console.warn("Failed to cache health analysis:", error.message)
  }
}

/**
 * Process health analysis with Gemini
 */
const processHealthAnalysis = async (foodData, userHealthConditions, retryCount = 0) => {
  const startTime = Date.now()

  try {
    const prompt = createHealthAnalysisPrompt(foodData, userHealthConditions)

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Health analysis timeout")), HEALTH_CONFIG.REQUEST_TIMEOUT)
    })

    // Process with Gemini
    const processPromise = (async () => {
      const result = await healthModel.generateContent(prompt)
      const response = await result.response
      return response.text()
    })()

    const text = await Promise.race([processPromise, timeoutPromise])

    const processingTime = Date.now() - startTime
    console.log(`Health analysis completed in ${processingTime}ms`)

    // Extract and validate JSON
    const cleanedText = text.trim()
    let jsonMatch = cleanedText.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      const codeBlockMatch = cleanedText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
      if (codeBlockMatch) {
        jsonMatch = [codeBlockMatch[1]]
      }
    }

    if (!jsonMatch) {
      throw new HealthAnalysisError("No valid JSON found in health analysis response", "NO_JSON")
    }

    let parsedResult
    try {
      parsedResult = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError.message)
      console.error("Raw JSON:", jsonMatch[0].substring(0, 500))
      throw new HealthAnalysisError(`Failed to parse health analysis JSON: ${parseError.message}`, "INVALID_JSON")
    }

    // Validate required fields
    if (!parsedResult.recommendation || !parsedResult.safetyScore) {
      throw new HealthAnalysisError("Invalid health analysis response structure", "INVALID_STRUCTURE")
    }

    return parsedResult
  } catch (error) {
    console.error(`Health analysis attempt ${retryCount + 1} failed:`, error.message)

    // Retry logic
    if (retryCount < HEALTH_CONFIG.MAX_RETRIES && isRetryableError(error)) {
      const delay = HEALTH_CONFIG.RETRY_DELAY * Math.pow(2, retryCount)
      console.log(`Retrying health analysis in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return processHealthAnalysis(foodData, userHealthConditions, retryCount + 1)
    }

    throw error
  }
}

/**
 * Check if error is retryable
 */
const isRetryableError = (error) => {
  const retryableErrors = ["timeout", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "Rate limit exceeded"]

  return retryableErrors.some((retryableError) => error.message.toLowerCase().includes(retryableError.toLowerCase()))
}

/**
 * Main health analysis controller
 */
const analyzeHealthSuitability = asyncHandler(async (req, res) => {
  const requestId = req.headers["x-request-id"] || Date.now().toString()
  const startTime = Date.now()

  // Get user ID from refresh token
  const incomingRefreshToken = req.cookies.refreshToken

  if (!incomingRefreshToken) {
    return res.status(401).json({
      statusCode: 401,
      message: "Authentication failed. Refresh token is required.",
      requestId,
    })
  }

  let userId
  try {
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    userId = decodedToken?._id

    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        message: "Invalid refresh token - missing user ID",
        requestId,
      })
    }
  } catch (error) {
    return res.status(401).json({
      statusCode: 401,
      message: "Invalid refresh token",
      error: error.message,
      requestId,
    })
  }

  console.log(`[${requestId}] Health analysis request started for user: ${userId}`)

  try {
    // Validate file exists in request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "NO_FILE",
        message: "No food product image provided",
        requestId,
      })
    }

    // Step 1: Process the food image using the existing controller
    console.log(`[${requestId}] Processing food image...`)
    const foodAnalysisResult = await processImageData(req.file, { requestId })

    if (!foodAnalysisResult.success) {
      return res.status(400).json({
        success: false,
        error: "FOOD_ANALYSIS_FAILED",
        message: "Failed to analyze food image",
        details: foodAnalysisResult.error,
        requestId,
      })
    }

    const foodData = foodAnalysisResult.data
    console.log(`[${requestId}] Food analysis completed: ${foodData.productName}`)

    // Step 2: Fetch user's health conditions from HealthProfile
    console.log(`[${requestId}] Fetching user health conditions...`)
    const userHealthConditions = await getUserHealthConditions(userId)

    if (!userHealthConditions || userHealthConditions.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          recommendation: "no_health_data",
          message:
            "No health conditions found for analysis. Food analysis provided without health-specific recommendations.",
          foodData,
          safetyScore: 75,
          overallRecommendation: "moderate_caution",
        },
        metadata: {
          processingTime: Date.now() - startTime,
          requestId,
          userId,
        },
      })
    }

    console.log(`[${requestId}] Found ${userHealthConditions.length} health conditions`)

    // Step 3: Check cache for health analysis
    const cacheKey = await generateHealthCacheKey(foodData, userHealthConditions)
    const cachedResult = await getCachedHealthAnalysis(cacheKey)

    if (cachedResult) {
      const processingTime = Date.now() - startTime
      console.log(`[${requestId}] Health analysis cache hit (${processingTime}ms)`)

      return res.status(200).json({
        success: true,
        data: {
          ...cachedResult,
          foodData,
          userConditions: userHealthConditions.map((c) => ({
            id: c.id,
            name: c.name,
            severity: c.severity,
            type: c.type,
          })),
        },
        metadata: {
          fromCache: true,
          processingTime,
          requestId,
          userId,
          cacheKey,
        },
      })
    }

    // Step 4: Perform health analysis with Gemini
    console.log(`[${requestId}] Performing comprehensive health analysis...`)
    const healthAnalysis = await processHealthAnalysis(foodData, userHealthConditions)

    // Step 5: Cache the result
    await cacheHealthAnalysis(cacheKey, healthAnalysis)

    const processingTime = Date.now() - startTime
    console.log(`[${requestId}] Comprehensive health analysis completed successfully (${processingTime}ms)`)

    // Step 6: Return comprehensive response
    res.status(200).json({
      success: true,
      data: {
        ...healthAnalysis,
        foodData,
        userConditions: userHealthConditions.map((c) => ({
          id: c.id,
          name: c.name,
          severity: c.severity,
          type: c.type,
          status: c.status,
        })),
      },
      metadata: {
        fromCache: false,
        processingTime,
        requestId,
        userId,
        cacheKey,
        analysisDate: new Date().toISOString(),
        version: "2.0",
      },
    })
  } catch (error) {
    const processingTime = Date.now() - startTime
    console.error(`[${requestId}] Health analysis failed (${processingTime}ms):`, {
      error: error.message,
      code: error.code,
      userId,
    })

    // Determine appropriate status code
    let statusCode = 500
    if (error instanceof DatabaseError) {
      statusCode = 503
    } else if (error instanceof HealthAnalysisError) {
      statusCode = 502
    }

    res.status(statusCode).json({
      success: false,
      error: error.code || "HEALTH_ANALYSIS_ERROR",
      message: error.message,
      requestId,
      metadata: {
        processingTime,
        timestamp: new Date().toISOString(),
        userId,
      },
    })
  }
})


export { analyzeHealthSuitability }
