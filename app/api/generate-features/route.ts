import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the schema for structured output
const featuresSchema = {
  type: "object" as const,
  properties: {
    features: {
      type: "array" as const,
      items: {
        type: "string" as const,
        description: "A key feature of the product",
      },
      minItems: 5,
      maxItems: 5,
      description: "Exactly 5 key features for the product",
    },
  },
  required: ["features"] as const,
  additionalProperties: false,
};

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const {
      productTitle,
      productCode,
      description,
      currentKeyFeatures,
      specifications,
    } = await request.json();

    if (!productTitle && !description) {
      return NextResponse.json(
        { error: "Product title or description is required" },
        { status: 400 }
      );
    }

    // Build context from current data
    let contextInfo = `Product Title: ${productTitle || "N/A"}
Product Code: ${productCode || "N/A"}
Description: ${description || "No description provided"}`;

    // Add current features if they exist
    if (currentKeyFeatures?.trim()) {
      contextInfo += `\n\nCurrent Key Features:\n${currentKeyFeatures}`;
    }

    // Add specifications for additional context
    if (
      specifications &&
      Array.isArray(specifications) &&
      specifications.length > 0
    ) {
      contextInfo += `\n\nTechnical Specifications:\n`;
      specifications.forEach((spec: any) => {
        if (spec.label && spec.value) {
          contextInfo += `- ${spec.label}: ${spec.value}\n`;
        }
      });
    }

    const hasExistingFeatures = currentKeyFeatures?.trim();
    const instruction = hasExistingFeatures
      ? "enhance or add to the existing features"
      : "generate 5 compelling key features";

    const prompt = `${
      instruction.charAt(0).toUpperCase() + instruction.slice(1)
    } for this product:

${contextInfo}

${
  hasExistingFeatures
    ? `Requirements for enhancing/adding features:
- Build upon and complement the existing features listed above
- Add new features that aren't already covered
- Ensure all features work together as a cohesive set
- Don't duplicate or contradict existing features
- If existing features are good, you may keep some and improve others
- Total should be exactly 5 features (including any you keep from existing)`
    : `Requirements for new features:`
}
- Specific and technical where appropriate
- Marketing-focused to highlight benefits
- Professional and industry-appropriate
- Clear and concise (each feature should be 1-2 sentences max)
- Focused on what makes this product valuable to customers

Generate exactly 5 features total.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content:
            "You are an expert product marketing specialist. Generate compelling, accurate key features for products based on their details. Use British English spelling, terminology, and phrasing throughout (e.g., 'optimise' not 'optimize', 'colour' not 'color', 'realise' not 'realize', 'centre' not 'center').",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_features",
          strict: true,
          schema: featuresSchema,
        },
      },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const message = completion.choices[0]?.message;

    if (message.refusal) {
      return NextResponse.json(
        {
          error: "Request was refused by the AI model",
          refusal: message.refusal,
        },
        { status: 400 }
      );
    }

    if (!message.content) {
      return NextResponse.json(
        { error: "No content generated" },
        { status: 500 }
      );
    }

    const result = JSON.parse(message.content);

    return NextResponse.json({
      features: result.features,
      usage: completion.usage,
    });
  } catch (error: any) {
    console.error("Error generating features:", error);
    return NextResponse.json(
      { error: `Failed to generate features: ${error.message}` },
      { status: 500 }
    );
  }
}
