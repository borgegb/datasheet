import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the schema for structured output
const enhancedDescriptionSchema = {
  type: "object" as const,
  properties: {
    enhanced_description: {
      type: "string" as const,
      description:
        "The enhanced product description, professional and compelling, max 500 characters",
    },
  },
  required: ["enhanced_description"] as const,
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
      currentDescription,
      productTitle,
      productCode,
      specifications,
      keyFeatures,
    } = await request.json();

    if (!currentDescription?.trim()) {
      return NextResponse.json(
        { error: "Current description is required" },
        { status: 400 }
      );
    }

    // Build context from available data
    let contextInfo = "";

    if (productTitle) {
      contextInfo += `Product: ${productTitle}\n`;
    }

    if (productCode) {
      contextInfo += `Model/Code: ${productCode}\n`;
    }

    if (
      specifications &&
      Array.isArray(specifications) &&
      specifications.length > 0
    ) {
      contextInfo += `\nTechnical Specifications:\n`;
      specifications.forEach((spec: any) => {
        if (spec.label && spec.value) {
          contextInfo += `- ${spec.label}: ${spec.value}\n`;
        }
      });
    }

    if (keyFeatures?.trim()) {
      contextInfo += `\nKey Features:\n${keyFeatures}\n`;
    }

    const prompt = `Enhance the following product description to be more professional, compelling, and market-ready.

Current Description: "${currentDescription}"

${contextInfo ? `Additional Context:\n${contextInfo}` : ""}

Requirements:
- Make it professional and compelling for potential customers
- Include relevant technical details naturally if specifications are provided
- Highlight key benefits and selling points if features are available
- Keep it concise but informative (max 500 characters)
- Use proper product terminology and industry language
- Focus on what makes this product valuable to customers
- Maintain accuracy - don't invent specifications or features not provided

Enhance the description to be marketing-ready while staying technically accurate.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content:
            "You are an expert product marketing copywriter specialising in industrial and technical products. Create compelling, accurate product descriptions that highlight benefits whilst maintaining technical credibility. Always stay within the 500 character limit. Use British English spelling, terminology, and phrasing throughout (e.g., 'optimise' not 'optimize', 'colour' not 'color', 'realise' not 'realize', 'centre' not 'center').",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "enhanced_description",
          strict: true,
          schema: enhancedDescriptionSchema,
        },
      },
      temperature: 0.7,
      max_tokens: 800,
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

    // Validate character limit
    if (result.enhanced_description.length > 500) {
      result.enhanced_description =
        result.enhanced_description.substring(0, 497) + "...";
    }

    return NextResponse.json({
      enhancedDescription: result.enhanced_description,
      usage: completion.usage,
    });
  } catch (error: any) {
    console.error("Error enhancing description:", error);
    return NextResponse.json(
      { error: `Failed to enhance description: ${error.message}` },
      { status: 500 }
    );
  }
}
