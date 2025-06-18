import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the schema for structured output
const specificationsSchema = {
  type: "object" as const,
  properties: {
    specifications: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          label: {
            type: "string" as const,
            description:
              "The specification parameter name (e.g., 'Voltage', 'Weight', 'Dimensions')",
          },
          value: {
            type: "string" as const,
            description:
              "The specification value with units (e.g., '24V', '15kg', '300mm x 200mm')",
          },
        },
        required: ["label", "value"] as const,
        additionalProperties: false,
      },
      minItems: 5,
      maxItems: 5,
      description: "Exactly 5 technical specifications for the product",
    },
  },
  required: ["specifications"] as const,
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

    const { productTitle, productCode, description } = await request.json();

    if (!productTitle && !description) {
      return NextResponse.json(
        { error: "Product title or description is required" },
        { status: 400 }
      );
    }

    const prompt = `Generate 5 realistic technical specifications for this product:

Product Title: ${productTitle || "N/A"}
Product Code: ${productCode || "N/A"}
Description: ${description || "No description provided"}

The specifications should be:
- Technical and measurable parameters
- Industry-appropriate for the product type
- Include proper units where applicable
- Realistic values based on the product description
- Common specifications that customers would expect to see

Examples of good specifications:
- Weight: 15kg
- Dimensions: 300mm x 200mm x 150mm
- Power: 240V AC
- Capacity: 50 litres
- Material: Stainless Steel
- Operating Temperature: -10°C to +60°C
- Pressure Rating: 10 bar

Generate exactly 5 specifications with both label and value.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content:
            "You are an expert technical product specialist. Generate accurate, realistic technical specifications for products based on their details. Always include appropriate units and realistic values. Use British English spelling, terminology, and phrasing throughout (e.g., 'optimise' not 'optimize', 'colour' not 'color', 'realise' not 'realize', 'centre' not 'center').",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_specifications",
          strict: true,
          schema: specificationsSchema,
        },
      },
      temperature: 0.3, // Lower temperature for more consistent technical specs
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
      specifications: result.specifications,
      usage: completion.usage,
    });
  } catch (error: any) {
    console.error("Error generating specifications:", error);
    return NextResponse.json(
      { error: `Failed to generate specifications: ${error.message}` },
      { status: 500 }
    );
  }
}
