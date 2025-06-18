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
        "The enhanced product description, MUST be 500 characters or less (including spaces and punctuation)",
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

**CRITICAL CONSTRAINT: The enhanced description MUST be 500 characters or less (including spaces and punctuation). This is a hard limit.**

Current Description: "${currentDescription}" (${
      currentDescription.length
    } characters)

${contextInfo ? `Additional Context:\n${contextInfo}` : ""}

Requirements:
- **MAXIMUM 500 characters total (including spaces and punctuation)**
- Make it professional and compelling for potential customers
- Include relevant technical details naturally if specifications are provided
- Highlight key benefits and selling points if features are available
- Use proper product terminology and industry language
- Focus on what makes this product valuable to customers
- Maintain accuracy - don't invent specifications or features not provided

**REMEMBER: Count every character including spaces. Stay well under 500 characters to ensure compliance.**

Enhance the description to be marketing-ready while staying technically accurate and within the 500 character limit.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content:
            "You are an expert product marketing copywriter specialising in industrial and technical products. Create compelling, accurate product descriptions that highlight benefits whilst maintaining technical credibility. CRITICAL: You MUST keep all descriptions to 500 characters or less (including spaces and punctuation). This is a hard constraint - count every character carefully. If you're close to the limit, prioritise the most important selling points. Use British English spelling, terminology, and phrasing throughout (e.g., 'optimise' not 'optimize', 'colour' not 'color', 'realise' not 'realize', 'centre' not 'center').",
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
      max_tokens: 600, // Reduced to encourage shorter responses
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

    // Validate character limit and provide warning if truncated
    if (result.enhanced_description.length > 500) {
      console.warn(
        `AI generated description was ${result.enhanced_description.length} characters, truncating to 500`
      );
      result.enhanced_description =
        result.enhanced_description.substring(0, 497) + "...";
    }

    return NextResponse.json({
      enhancedDescription: result.enhanced_description,
      characterCount: result.enhanced_description.length,
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
