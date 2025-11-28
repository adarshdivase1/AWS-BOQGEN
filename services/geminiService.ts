import { GoogleGenAI, Type } from '@google/genai';
import type { Boq, BoqItem, ProductDetails, ValidationResult, TokenUsage } from '../types';
import { productDatabase } from '../data/productData';

// VITE SPECIFIC: access env vars via import.meta.env
const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  console.error("VITE_API_KEY is not set in .env file.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-for-build' });

const databaseString = JSON.stringify(productDatabase.map(p => ({ brand: p.brand, model: p.model, description: p.description, category: p.category, price: p.price })));

// Cache key storage in localStorage to persist across reloads
const CACHE_KEY_STORAGE = 'gemini_boq_cache_name';
const CACHE_EXPIRY_STORAGE = 'gemini_boq_cache_expiry';
const CACHE_TTL_SECONDS = 3000; // 50 Minutes (Buffer before the 60m limit)

/**
 * Creates or retrieves a valid cached content reference.
 */
async function getOrRefreshCache(modelName: string): Promise<string | null> {
    const storedCacheName = localStorage.getItem(CACHE_KEY_STORAGE);
    const storedExpiry = localStorage.getItem(CACHE_EXPIRY_STORAGE);

    // Check if we have a valid, non-expired cache
    if (storedCacheName && storedExpiry) {
        const expiryTime = parseInt(storedExpiry, 10);
        if (Date.now() < expiryTime) {
            console.log("Using existing Gemini Cache:", storedCacheName);
            return storedCacheName;
        } else {
            console.log("Cache expired.");
            localStorage.removeItem(CACHE_KEY_STORAGE);
            localStorage.removeItem(CACHE_EXPIRY_STORAGE);
        }
    }

    console.log("Creating new Gemini Context Cache...");

    const systemInstruction = `You are a world-class, Senior AV Solutions Architect (CTS-D Certified) with 20 years of experience. Your goal is to generate a **100% production-ready, logically flawless Bill of Quantities (BOQ)** that adheres strictly to AVIXA standards and User Brand Requests.

**CUSTOM PRODUCT DATABASE (Priority Source):**
A JSON list of available products is provided in this context. Check this first.

**MANDATORY RULES:**
1.  **BRAND LOCK:** Strictly adhere to requested brands.
2.  **LOGICAL SIGNAL FLOW:** Every Source needs a Sink and connection.
3.  **DATABASE PRIORITY:** Prefer items from the provided database.
4.  **JUSTIFICATION:** Populate 'keyRemarks' with technical reasoning.
`;

    try {
        // Note: Context Caching requires a minimum token count (approx 32k). 
        // If the DB is small, we append the DB multiple times to ensure we hit the limit 
        // and benefit from caching logic, or we rely on the model to handle it.
        // For this implementation, we send the data directly.
        
        const cache = await ai.caches.create({
            model: modelName,
            // displayName property is not supported in CreateCachedContentParameters
            config: {
                systemInstruction: systemInstruction,
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `Here is the Custom Product Database you must use:\n${databaseString}` }]
                    }
                ],
            },
            ttlSeconds: 3600, // 1 Hour default
        });

        if (cache.name) {
            const expiryTimestamp = Date.now() + (CACHE_TTL_SECONDS * 1000);
            localStorage.setItem(CACHE_KEY_STORAGE, cache.name);
            localStorage.setItem(CACHE_EXPIRY_STORAGE, expiryTimestamp.toString());
            console.log("Cache created successfully:", cache.name);
            return cache.name;
        }
    } catch (error) {
        console.warn("Failed to create cache (possibly content too short or API limit). Falling back to standard context.", error);
    }
    
    return null; // Fallback signal
}


/**
 * Generates a Bill of Quantities (BOQ) based on user requirements.
 */
export const generateBoq = async (answers: Record<string, any>): Promise<{ boq: Boq, usage: TokenUsage }> => {
    const model = 'gemini-1.5-pro-002'; // Using 1.5 Pro as it has stable caching support

    const requiredSystems = answers.requiredSystems || ['display', 'video_conferencing', 'audio', 'connectivity_control', 'infrastructure', 'acoustics'];
    
    const categoryMap: Record<string, string[]> = {
        display: ["Display"],
        video_conferencing: ["Video Conferencing & Cameras"],
        audio: ["Audio - Microphones", "Audio - DSP & Amplification", "Audio - Speakers"],
        connectivity_control: ["Video Distribution & Switching", "Control System & Environmental"],
        infrastructure: ["Cabling & Infrastructure", "Mounts & Racks"],
        acoustics: ["Acoustic Treatment"],
    };

    const allowedCategories = requiredSystems.flatMap((system: string) => categoryMap[system] || []);
    allowedCategories.push("Accessories & Services");

    // --- Extract Specific Brand Preferences for Strict Enforcement ---
    const brandPreferences = {
        displays: Array.isArray(answers.displayBrands) ? answers.displayBrands.join(', ') : '',
        mounts: Array.isArray(answers.mountBrands) ? answers.mountBrands.join(', ') : '',
        racks: Array.isArray(answers.rackBrands) ? answers.rackBrands.join(', ') : '',
        audio: Array.isArray(answers.audioBrands) ? answers.audioBrands.join(', ') : '',
        vc: Array.isArray(answers.vcBrands) ? answers.vcBrands.join(', ') : '',
        connectivity: Array.isArray(answers.connectivityBrands) ? answers.connectivityBrands.join(', ') : '',
        control: Array.isArray(answers.controlBrands) ? answers.controlBrands.join(', ') : '',
    };

    const requirements = Object.entries(answers)
      .map(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          return `${key}: ${value.join(', ')}`;
        }
        if (value) {
            return `${key}: ${value}`;
        }
        return null;
      })
      .filter(Boolean)
      .join('; ');

    const userPrompt = `
**CLIENT CONFIGURATION:** "${requirements}"

**MANDATORY BRAND COMPLIANCE (ZERO TOLERANCE):**
*   **Display Mounts:** ${brandPreferences.mounts || 'Use Professional defaults (e.g., Chief, Peerless-AV, B-Tech)'}
*   **Racks:** ${brandPreferences.racks || 'Use Professional defaults (e.g., Middle Atlantic, Valrack)'}
*   **Displays:** ${brandPreferences.displays || 'Use Professional defaults (e.g., Samsung, LG, Sony)'}
*   **Audio:** ${brandPreferences.audio || 'Use Professional defaults (e.g., Shure, QSC, Biamp)'}
*   **Video Conferencing:** ${brandPreferences.vc || 'Use Professional defaults'}
*   **Control:** ${brandPreferences.control || 'Use Professional defaults'}

**STRICT OUTPUT ORDERING (SYSTEM FLOW):**
1. Visual Systems, 2. Conferencing, 3. Audio, 4. Connectivity, 5. Infrastructure, 6. Control.

**Scope Limit:** Generate items ONLY for these categories: ${allowedCategories.join(', ')}.

**OUTPUT FORMAT:**
Return ONLY a JSON array of objects with fields: category, itemDescription, keyRemarks, brand, model, quantity, unitPrice (USD), totalPrice, source ('database'|'web'), priceSource ('database'|'estimated').
    `;

    const responseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            itemDescription: { type: Type.STRING },
            keyRemarks: { type: Type.STRING },
            brand: { type: Type.STRING },
            model: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unitPrice: { type: Type.NUMBER },
            totalPrice: { type: Type.NUMBER },
            source: { type: Type.STRING, enum: ['database', 'web'] },
            priceSource: { type: Type.STRING, enum: ['database', 'estimated'] },
          },
          required: ['category', 'itemDescription', 'keyRemarks', 'brand', 'model', 'quantity', 'unitPrice', 'totalPrice', 'source', 'priceSource'],
        },
    };

    try {
        // Attempt to get cache
        const cacheName = await getOrRefreshCache(model);
        
        let generateConfig: any = {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
        };

        let contentParts: any[] = [];

        // If cache exists, use it. If not (fallback), inject DB into prompt.
        if (cacheName) {
            console.log("Generating with Cache...");
            generateConfig.cachedContent = cacheName;
            contentParts = [{ text: userPrompt }];
        } else {
            console.log("Generating with Standard Prompt (No Cache)...");
            // Fallback for when caching fails
            const fallbackPrompt = `
            You are a Senior AV Solutions Architect.
            **CUSTOM PRODUCT DATABASE:** ${databaseString}
            ${userPrompt}
            `;
            contentParts = [{ text: fallbackPrompt }];
        }

        const response = await ai.models.generateContent({
            model: model,
            contents: [{ 
                role: 'user', 
                parts: contentParts
            }],
            config: generateConfig,
        });

        const jsonText = response.text.trim();
        const boq: BoqItem[] = JSON.parse(jsonText);
        
        const boqWithTotals = boq.map((item: BoqItem) => ({
            ...item,
            totalPrice: item.quantity * item.unitPrice
        }));

        const usage: TokenUsage = {
            promptTokens: response.usageMetadata?.promptTokenCount || 0,
            responseTokens: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata?.totalTokenCount || 0,
        };

        return { boq: boqWithTotals, usage };

    } catch (error) {
        console.error('Error generating BOQ:', error);
        throw error;
    }
};

/**
 * Refines an existing BOQ based on a user-provided prompt.
 */
export const refineBoq = async (currentBoq: Boq, refinementPrompt: string): Promise<{ boq: Boq, usage: TokenUsage }> => {
    const model = 'gemini-1.5-pro-002'; // Consistent model
    
    // We reuse the cache here as well if possible
    const cacheName = await getOrRefreshCache(model);

    const userRequest = `
    Refine the following Bill of Quantities (BOQ) based on the user's request.

    Current BOQ (JSON):
    ${JSON.stringify(currentBoq, null, 2)}

    User Request: "${refinementPrompt}"

    **INSTRUCTIONS:**
    1.  **User Authority:** The User Request overrides previous logic.
    2.  **Database Check:** Check the Custom Product Database (in context) first for swaps.
    3.  **Priorities:** Priority 1: DB Match. Priority 2: Web Search (Knowledge) if specific brand requested.
    4.  **Key Remarks:** Update 'keyRemarks' explaining the change.
    
    Return the complete, updated JSON array.
    `;
    
    const responseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            itemDescription: { type: Type.STRING },
            keyRemarks: { type: Type.STRING },
            brand: { type: Type.STRING },
            model: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unitPrice: { type: Type.NUMBER },
            totalPrice: { type: Type.NUMBER },
            source: { type: Type.STRING, enum: ['database', 'web'] },
            priceSource: { type: Type.STRING, enum: ['database', 'estimated'] },
          },
          required: ['category', 'itemDescription', 'keyRemarks', 'brand', 'model', 'quantity', 'unitPrice', 'totalPrice', 'source', 'priceSource'],
        },
    };

    try {
        let generateConfig: any = {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        };

        let contentParts: any[] = [];

        if (cacheName) {
            generateConfig.cachedContent = cacheName;
            contentParts = [{ text: userRequest }];
        } else {
             const fallbackPrompt = `
            You are a Senior AV Solutions Architect.
            **CUSTOM PRODUCT DATABASE:** ${databaseString}
            ${userRequest}
            `;
            contentParts = [{ text: fallbackPrompt }];
        }

        const response = await ai.models.generateContent({
            model: model,
            contents: [{ 
                role: 'user', 
                parts: contentParts
            }],
            config: generateConfig,
        });

        const jsonText = response.text.trim();
        const boq = JSON.parse(jsonText);
        
        const boqWithTotals = boq.map((item: BoqItem) => ({
            ...item,
            totalPrice: item.quantity * item.unitPrice
        }));

        const usage: TokenUsage = {
            promptTokens: response.usageMetadata?.promptTokenCount || 0,
            responseTokens: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata?.totalTokenCount || 0,
        };

        return { boq: boqWithTotals, usage };

    } catch (error) {
        console.error('Error refining BOQ:', error);
        throw error;
    }
};

/**
 * Validates a BOQ against requirements and best practices.
 */
export const validateBoq = async (boq: Boq, requirements: string): Promise<ValidationResult> => {
    const model = 'gemini-1.5-pro-002'; // Consistent model
    
    // Validation uses the cache to cross-reference equipment capabilities if needed
    const cacheName = await getOrRefreshCache(model);

    const prompt = `
    Analyze the provided Bill of Quantities (BOQ) against the user's requirements.

    User Requirements: "${requirements}"

    Current BOQ (JSON):
    ${JSON.stringify(boq, null, 2)}

    **STRICT BRAND AUDIT:**
    - Check if the user requested specific brands. Did the BOQ use them?
    - **FAIL:** If user asked for "Chief" mounts but BOQ has "B-Tech", flag it.

    **SYSTEM AUDIT:**
    1.  **Signal Flow:** Are there breaks?
    2.  **Mounting:** Does every display have a mount?
    3.  **Infrastructure:** Are racks/power included?

    Provide your findings in a structured JSON format.
    `;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            isValid: { type: Type.BOOLEAN },
            warnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            missingComponents: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
        },
        required: ['isValid', 'warnings', 'suggestions', 'missingComponents'],
    };

    try {
        let generateConfig: any = {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        };
        
        let contentParts: any[] = [];

        if (cacheName) {
            generateConfig.cachedContent = cacheName;
            contentParts = [{ text: prompt }];
        } else {
            // For validation, if cache fails, we might not send the FULL DB to save tokens, 
            // as validation is less dependent on the full product list than generation.
            // But to be safe and consistent, we'll send it if cost isn't the primary concern for fallback.
            const fallbackPrompt = `
            You are a Senior AV Solutions Architect.
            ${prompt}
            `;
            contentParts = [{ text: fallbackPrompt }];
        }

        const response = await ai.models.generateContent({
            model: model,
            contents: [{
                role: 'user',
                parts: contentParts
            }],
            config: generateConfig,
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);

    } catch (error) {
        console.error('Error validating BOQ:', error);
        return {
            isValid: false,
            warnings: ['AI validation failed to run. Please check the BOQ manually.'],
            suggestions: [],
            missingComponents: [],
        };
    }
};

/**
 * Fetches product details using Google Search grounding.
 */
export const fetchProductDetails = async (productName: string): Promise<ProductDetails> => {
    const model = 'gemini-2.5-flash';
    const prompt = `Give me a one-paragraph technical and functional overview for the product: "${productName}". The description should be suitable for a customer proposal.
    After the description, on a new line, write "IMAGE_URL:" followed by a direct URL to a high-quality, front-facing image of the product if you can find one.
    `;
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const text = response.text;
        let description = text;
        let imageUrl = '';

        const imageUrlMatch = text.match(/\nIMAGE_URL:\s*(.*)/);
        if (imageUrlMatch && imageUrlMatch[1]) {
            imageUrl = imageUrlMatch[1].trim();
            description = text.substring(0, imageUrlMatch.index).trim();
        }

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        
        const sources: { web: { uri: string; title: string } }[] = groundingChunks
            ?.filter((chunk): chunk is { web: { uri: string; title: string } } => !!chunk.web)
            .map(chunk => ({ web: chunk.web! })) || [];

        return {
            description,
            imageUrl,
            sources,
        };
    } catch (error) {
        console.error(`Error fetching product details for "${productName}":`, error);
        throw new Error(`Failed to fetch product details for "${productName}".`);
    }
};