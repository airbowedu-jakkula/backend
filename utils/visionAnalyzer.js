const { GoogleGenerativeAI } = require("@google/generative-ai");
const env = require("../config/env");

let genAI = null;

function getGenAI() {
  const key = env.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!genAI && key) {
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

/**
 * Normalizes location name to canonical center format (distinguishing Consular vs OFC/VAC).
 */
function canonicalLocation(loc) {
  if (!loc) return "CHENNAI VAC";
  const s = String(loc).trim().toUpperCase();
  const isVAC = s.includes("VAC") || s.includes("OFC") || s.includes("BIOMETRIC");
  let city = "CHENNAI";
  if (s.includes("HYDERABAD")) city = "HYDERABAD";
  else if (s.includes("MUMBAI")) city = "MUMBAI";
  else if (s.includes("KOLKATA")) city = "KOLKATA";
  else if (s.includes("DELHI")) city = "NEW DELHI";
  else if (s.includes("CHENNAI")) city = "CHENNAI";
  else if (s.includes("BENGALURU") || s.includes("BANGALORE")) city = "BENGALURU";
  else return s;
  return isVAC ? `${city} VAC` : city;
}

/**
 * Analyzes a US visa appointment screenshot using Gemini Vision AI.
 * Extracts: Center location, availability status, earliest date, total open dates,
 * total slots count across all time slots, and time slot details.
 *
 * @param {string} base64DataUrl Base64 PNG/JPEG screenshot data URL
 * @returns {Promise<object|null>} Structured analysis object or null if failed
 */
async function analyzeScreenshotWithVision(base64DataUrl) {
  if (!base64DataUrl) return null;

  const ai = getGenAI();
  if (!ai) {
    console.log("[VisionAnalyzer] GEMINI_API_KEY not configured — skipping Vision AI analysis.");
    return null;
  }

  try {
    const matches = base64DataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s);
    if (!matches) {
      console.warn("[VisionAnalyzer] Invalid base64 screenshot format");
      return null;
    }

    const mimeType = matches[1];
    const imageBytes = matches[2];

    // Use gemini-3.6-flash for fastest, high-accuracy vision analysis with guaranteed JSON output
    const model = ai.getGenerativeModel({
      model: "gemini-3.6-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 1500,
      },
    });

    const prompt = `
You are an expert automated US Visa Appointment portal inspector. Analyze this official US Visa Scheduling / OFC appointment card screenshot with 100% accuracy.

Analyze the image and extract the following details into valid JSON:
1. "location": The selected OFC/Consulate Post from dropdown or text (e.g. "CHENNAI", "CHENNAI VAC", "HYDERABAD", "HYDERABAD VAC", "MUMBAI", "MUMBAI VAC", "NEW DELHI", "NEW DELHI VAC", "KOLKATA", "KOLKATA VAC").
2. "available": Boolean (true if genuine appointment slots or selectable highlighted calendar dates are open; false if 'No Slots Available', 'No Appointments Available', or calendar has 0 selectable dates).
3. "earliestDate": The earliest bookable appointment date in short format like "15 Sep, 2026", "05 Oct, 2026", or "18 Jun, 2027". Note: If dates are in MM/DD/YYYY format like 10/05/2026, parse correctly (e.g. "05 Oct, 2026"). If unavailable, return "No Dates Available".
4. "totalDates": The total number of open/highlighted clickable date cells visible on the calendar across all months (as a string number e.g. "1", "5", "12"). If unavailable, return "0".
5. "slots": CRITICAL - In the appointment time slots table with columns Date / Time / Availability, you MUST SUM all numbers in the "Availability" column across all time rows for the earliest date.
   Example: If the table rows show:
   10:15 | Availability: 12
   10:45 | Availability: 17
   11:15 | Availability: 21
   11:45 | Availability: 4
   You MUST SUM: 12 + 17 + 21 + 4 = 54! (Do NOT return "4" and do NOT count the number of rows). Return the sum as a string number e.g. "54". If no availability numbers are present, return the count of time slot rows. If unavailable, return "0".
6. "earliestTime": The earliest appointment time slot (e.g. "10:15 AM", "10:15", "08:30 AM"). If none, return "".
7. "summary": A concise 1-line description of the slot availability (e.g. "Earliest 05 Oct, 2026 at 10:15 (54 slots open)" or "5 Dates Open · Earliest 15 Sep, 2026 · 54 Total Slots").

8. "isError": Boolean (true if the screenshot shows an error message like 'An error has occurred', 'System Error', 'Access Denied', 'Forbidden', 'Something went wrong', 'Application error', 'Service unavailable', 'Session Expired', or server error screen; false otherwise).

Strict Rules:
- If the screenshot shows an error message, exception, server down, or access denied message, set "isError": true, "available": false, "earliestDate": "No Dates Available", "totalDates": "0", "slots": "0", "summary": "Portal error page".
- If the screenshot shows "No Slots Available" or "There are currently no appointments available", set "isError": false, "available": false, "earliestDate": "No Dates Available", "totalDates": "0", "slots": "0".
- If the screenshot shows "Loading..." or is actively loading with no calendar/banner painted yet, set "isError": false, "available": false, "earliestDate": "No Dates Available", "totalDates": "0", "slots": "0", "summary": "Loading in progress".
- Do NOT confuse the server timestamp clock with the appointment date.
- Return ONLY a valid JSON object. Do not include markdown code block backticks (\`\`\`json), explanations, or surrounding text.
`;

    const startMs = Date.now();
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBytes,
          mimeType: mimeType,
        },
      },
    ]);

    const duration = Date.now() - startMs;
    const rawText = result.response.text().trim();
    let cleanJson = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    
    // Extract JSON object if surrounded by extra text
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }
    // Remove trailing commas before closing braces/brackets
    cleanJson = cleanJson.replace(/,\s*([}\]])/g, "$1");

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.warn("[VisionAnalyzer] Failed to parse JSON. Raw output:", rawText);
      throw parseErr;
    }

    const isError = Boolean(parsed.isError || /error|exception|denied|forbidden|unavailable/i.test(parsed.summary || ""));
    const location = canonicalLocation(parsed.location);
    const available = isError ? false : Boolean(parsed.available);
    const earliestDate = isError || !available ? "No Dates Available" : (parsed.earliestDate || "Available");
    const totalDates = isError || !available ? "0" : String(parsed.totalDates || "1");
    const slots = isError || !available ? "0" : String(parsed.slots || "1");
    const earliestTime = isError ? "" : (parsed.earliestTime || "");
    const earliest = isError ? "Portal error page" : (parsed.summary || (earliestTime ? `${earliestDate} ${earliestTime} (${slots} open)` : earliestDate));

    console.log(
      `[VisionAnalyzer] ✅ Vision AI analyzed in ${duration}ms: ${location} | ${isError ? "⚠️ ERROR SCREEN" : available ? "🟢 OPEN" : "🔴 NO SLOTS"} | Date: ${earliestDate} | Slots: ${slots} | Dates Open: ${totalDates}`
    );

    return {
      isError,
      location,
      available,
      earliestDate,
      totalDates,
      slots,
      earliestTime,
      earliest,
      summary: parsed.summary || earliest,
      durationMs: duration,
    };
  } catch (err) {
    console.warn("[VisionAnalyzer] Vision AI analysis error:", err.message);
    return null;
  }
}

module.exports = {
  analyzeScreenshotWithVision,
  canonicalLocation,
};
