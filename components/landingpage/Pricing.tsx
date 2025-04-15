import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface PlanProps {
  title: string;
  price: string;
  period: string;
  features: string[];
  buttonText: string;
  buttonVariant: "default" | "outline";
  isPopular?: boolean;
}

const plans: PlanProps[] = [
  {
    title: "Basic",
    price: "$0",
    period: "/month",
    features: ["10 datasheets / month", "Basic templates"],
    buttonText: "Get Started",
    buttonVariant: "outline",
  },
  {
    title: "Pro",
    price: "$29",
    period: "/month",
    features: ["Unlimited datasheets", "Premium templates"],
    buttonText: "Get Started",
    buttonVariant: "default", // Default will be blue based on Shadcn theme
    isPopular: true,
  },
  {
    title: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Unlimited datasheets", "Custom templates", "Priority support"],
    buttonText: "Contact Sales",
    buttonVariant: "outline",
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="container py-24 sm:py-32">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
        Pricing Plans
      </h2>
      <p className="text-xl text-muted-foreground text-center mb-8">
        Choose the plan that fits your needs.
      </p>

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {plans.map(
          ({
            title,
            price,
            period,
            features,
            buttonText,
            buttonVariant,
            isPopular,
          }) => (
            <Card
              key={title}
              className={`flex flex-col justify-between p-6 ${
                isPopular ? "border-2 border-primary shadow-lg" : "shadow-md"
              }`}
            >
              <CardHeader className="pb-4">
                {isPopular && (
                  <div className="text-xs uppercase font-bold text-primary text-center tracking-wider mb-2">
                    Most Popular
                  </div>
                )}
                <CardTitle className="text-2xl text-center mb-1">
                  {title}
                </CardTitle>
                <div className="text-center">
                  <span className="text-4xl font-bold">{price}</span>
                  <span className="text-muted-foreground">{period}</span>
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-2">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center">
                      <Check className="text-green-500 mr-2 h-4 w-4" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button variant={buttonVariant} className="w-full" asChild>
                  {/* Link appropriately based on button text */}
                  <Link
                    href={
                      buttonText === "Contact Sales"
                        ? "/#contact"
                        : "/auth/sign-up"
                    }
                  >
                    {buttonText}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          )
        )}
      </div>
    </section>
  );
}
 