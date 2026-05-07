import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface CropAnalysisResult {
  crop_detected: string;
  possible_disease: string;
  confidence_score: string;
  symptoms_observed: string[];
  affected_areas_description?: string;
  environmental_factors?: string[];
  affected_bounding_box?: number[];
  detailed_explanation: string;
  treatment_recommendations: string[];
  preventive_measures: string[];
  risk_assessment?: {
     severity: string;
     spread_potential: string;
     estimated_yield_loss: string;
  };
}

export interface UserProfile {
  location: string;
  primaryCrops: string;
  soilType: string;
  language?: string;
}

export interface MultiCropAnalysisResult {
  results: CropAnalysisResult[];
}

export interface FarmAdvisory {
  weatherData: {
    temperature: string;
    humidity: string;
    windSpeed: string;
    rainfallHistory: string;
  };
  pestDiseaseWarnings: {
    title: string;
    description: string;
    severity: 'High' | 'Moderate' | 'Low';
  }[];
  plantingRecommendations: {
    title: string;
    action: string;
  }[];
}

export async function fetchRealWeatherData(location: string) {
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) return null;
    const { latitude, longitude, name, country } = geoData.results[0];

    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=precipitation_sum&past_days=7&forecast_days=1`);
    const weatherData = await weatherRes.json();

    const current = weatherData.current;
    const daily = weatherData.daily;
    const totalRainfall7Days = daily.precipitation_sum.reduce((a: number, b: number) => a + (b || 0), 0);

    return {
       locationName: `${name}, ${country}`,
       temperature: `${current.temperature_2m}°C`,
       humidity: `${current.relative_humidity_2m}%`,
       windSpeed: `${current.wind_speed_10m} km/h`,
       rainfall7Days: `${totalRainfall7Days.toFixed(1)} mm`
    };
  } catch (e) {
    console.error("Failed to fetch weather", e);
    return null;
  }
}

export async function generateFarmAdvisory(userProfile: UserProfile): Promise<FarmAdvisory> {
  const weatherContextObj = await fetchRealWeatherData(userProfile.location || '');
  const weatherString = weatherContextObj 
    ? `REAL WEATHER DATA for ${weatherContextObj.locationName}:\n- Temp: ${weatherContextObj.temperature}\n- Humidity: ${weatherContextObj.humidity}\n- Wind: ${weatherContextObj.windSpeed}\n- Past 7 Days Rainfall: ${weatherContextObj.rainfall7Days}`
    : "No real-time weather available. Estimate based on typical seasonal climate.";

  const profileContext = `
Location: ${userProfile.location || 'Unknown'} (Resolved to: ${weatherContextObj ? weatherContextObj.locationName : 'Unknown'})
Primary Crops: ${userProfile.primaryCrops || 'Unknown'}
Soil Type: ${userProfile.soilType || 'Unknown'}
Preferred Language: ${userProfile.language || 'English'}
  `;

  const promptString = `You are an expert agronomist and meteorologist. Based on the user's location, crop profile, and the REAL-TIME weather data provided, generate a highly detailed farm advisory.
If a Preferred Language is specified, you MUST translate the ENTIRE output (including text in your JSON response) to that language!

User Profile:
${profileContext}

Current Weather Context:
${weatherString}

Provide:
1. 'weatherData': Reflect the exact weather conditions provided in the Current Weather Context. If real data is not available, estimate them realistically.
2. 'pestDiseaseWarnings': precise pest/disease outbreak warnings based on EXACTLY these weather conditions and the user's primary crops.
3. 'plantingRecommendations': fine-tuned planting and treatment recommendations based on the weather data and soil type.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: promptString,
    config: {
      temperature: 0.2, // low temp for more factual/consistent response
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          weatherData: {
            type: Type.OBJECT,
            properties: {
              temperature: { type: Type.STRING, description: "e.g., '28°C'" },
              humidity: { type: Type.STRING, description: "e.g., '65%'" },
              windSpeed: { type: Type.STRING, description: "e.g., '12 km/h'" },
              rainfallHistory: { type: Type.STRING, description: "e.g., '15mm in the last 7 days. Below average for this season.'" }
            },
            required: ["temperature", "humidity", "windSpeed", "rainfallHistory"]
          },
          pestDiseaseWarnings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                severity: { type: Type.STRING, description: "'High', 'Moderate', or 'Low'" }
              },
              required: ["title", "description", "severity"]
            }
          },
          plantingRecommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "e.g., 'Week 1', 'Immediate Action', etc." },
                action: { type: Type.STRING }
              },
              required: ["title", "action"]
            }
          }
        },
        required: ["weatherData", "pestDiseaseWarnings", "plantingRecommendations"]
      }
    }
  });

  if (!response.text) {
      throw new Error("No response generated by the AI.");
  }
  
  return JSON.parse(response.text) as FarmAdvisory;
}

export async function analyzeCropImage(base64Data: string, mimeType: string, userProfile?: UserProfile | null): Promise<MultiCropAnalysisResult> {
  let profileContext = "";
  if (userProfile && (userProfile.location || userProfile.primaryCrops || userProfile.soilType || userProfile.language)) {
      profileContext = `
The user has provided the following context about their farm:
${userProfile.location ? `- Location: ${userProfile.location}` : ""}
${userProfile.primaryCrops ? `- Primary Crops: ${userProfile.primaryCrops}` : ""}
${userProfile.soilType ? `- Soil Type: ${userProfile.soilType}` : ""}
${userProfile.language ? `- Preferred Language: ${userProfile.language}` : ""}

Please tailor the recommendations, prevention tips, and environmental factors to consider this context if applicable (e.g., local climate patterns, soil suitability, or crop rotation with their primary crops).
IMPORTANT: If a Preferred Language is specified, you MUST provide ALL analysis, explanations, and recommendations in that language.
`;
  }

  const promptString = `You are an expert agronomist, plant pathologist, and agricultural AI identifying crop diseases.
${profileContext}
Analyze the provided image of a plant or leaf.
If there are multiple distinct crops or multiple plants visible, detect and analyze EACH crop/plant separately. 
If there's only one, return a single result in the array.
For EACH detected crop/plant:
1. Identify the specific crop.
2. Detect any possible disease, pest damage, nutrient deficiency, or environmental stress symptom. IMPORTANT: Be extremely careful not to confuse normal botanical growth stages (such as natural growth flushes, new reddish or pale green leaves common in mango or cocoa plants) with diseases. Do NOT classify natural anatomical features as an 'Affected Area'.
3. Provide a realistic confidence score as a percentage (e.g., "60%", "85%", "95%"). Do NOT simply output "90%" every time. The confidence score MUST critically reflect how closely the image matches the textbook symptoms of the disease. If the image is blurry, ambiguous, or the symptoms are general, you must output a lower confidence score (e.g. 50-70%). Only output high confidence (90%+) if the symptoms are distinctly and undeniably characteristic of that specific disease.
4. Pinpoint the exact location of the symptoms (e.g., "margins of lower leaves", "interveinal chlorosis") and write this in 'affected_areas_description'. State "None" if healthy.
5. Provide the spatial bounding box [ymin, xmin, ymax, xmax] normalized from 0 to 1000 of the highly affected region in 'affected_bounding_box'. Return an empty array if healthy or undetectable.
6. Provide a human-friendly detailed explanation.
7. Provide a risk assessment containing severity, spread potential, and estimated yield loss.
8. List potential 'environmental_factors' (e.g., extreme humidity, poor drainage) that favor this issue.
9. Provide actionable treatment steps (immediate actions, suggested methods, dosage/guidelines, safety). Provide general healthy crop maintenance if healthy.
10. Provide prevention tips (long-term practices, soil/spacing, resistant varieties).

If the image is too blurry, or does not contain a plant, set 'possible_disease' to 'Invalid Image', 'crop_detected' to 'Unknown', and provide appropriate advice in the explanation.`;

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: mimeType,
    },
  };
  const textPart = { text: promptString };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: [imagePart, textPart] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                crop_detected: { 
                  type: Type.STRING, 
                  description: "Name of the crop" 
                },
                possible_disease: { 
                  type: Type.STRING, 
                  description: "Name of the disease or issue. 'None detected' if healthy. 'Invalid Image' if not a plant / blurry." 
                },
                confidence_score: { 
                  type: Type.STRING, 
                  description: "Confidence percentage, e.g., '92%'" 
                },
                symptoms_observed: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING }, 
                  description: "Visual symptoms of the issue" 
                },
                affected_areas_description: {
                  type: Type.STRING,
                  description: "Verbal description of where the symptoms are located on the plant or leaf."
                },
                environmental_factors: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Potential environmental factors contributing to the issue (leave empty if none)."
                },
                affected_bounding_box: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: "An array of 4 integers [ymin, xmin, ymax, xmax] representing the normalized bounding box (0-1000) of the primary affected area. Leave empty if none."
                },
                detailed_explanation: { 
                  type: Type.STRING, 
                  description: "Detailed explanation of the issue" 
                },
                treatment_recommendations: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING }, 
                  description: "Actionable treatments to resolve the issue" 
                },
                preventive_measures: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING }, 
                  description: "Prevention methods and long-term practices" 
                },
                risk_assessment: {
                  type: Type.OBJECT,
                  properties: {
                     severity: { type: Type.STRING, description: "'Low', 'Moderate', 'High', or 'N/A' if healthy" },
                     spread_potential: { type: Type.STRING, description: "Description of how easily it spreads (e.g. 'Highly contagious via wind' or 'Localized issue')" },
                     estimated_yield_loss: { type: Type.STRING, description: "e.g. 'Up to 20% if left untreated'" }
                  }
                }
              },
              required: [
                "crop_detected",
                "possible_disease",
                "confidence_score",
                "symptoms_observed",
                "detailed_explanation",
                "treatment_recommendations",
                "preventive_measures"
              ]
            }
          }
        },
        required: ["results"]
      }
    }
  });
  
  if (!response.text) {
      throw new Error("No response generated by the AI.");
  }
  
  return JSON.parse(response.text) as MultiCropAnalysisResult;
}
