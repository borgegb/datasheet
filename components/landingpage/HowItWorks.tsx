import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface StepProps {
  title: string;
  description: string;
  imageSrc: string;
}

const steps: StepProps[] = [
  {
    title: "Enter Product Information",
    description:
      "Use our intuitive web form to input all necessary product details.",
    imageSrc: "https://source.unsplash.com/random/400x300/?form,data,input",
  },
  {
    title: "Select Template & Format",
    description:
      "Choose from professional templates and select PDF or Word output.",
    imageSrc:
      "https://source.unsplash.com/random/400x300/?template,document,design",
  },
  {
    title: "Download or Email Datasheet",
    description:
      "Instantly generate and download your datasheet, or email it directly.",
    imageSrc:
      "https://source.unsplash.com/random/400x300/?download,email,share",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="container text-center py-24 sm:py-32 bg-muted/50"
    >
      <h2 className="text-3xl md:text-4xl font-bold ">How It Works</h2>
      <p className="md:w-3/4 mx-auto mt-4 mb-8 text-xl text-muted-foreground">
        Generate your professional datasheet in just 3 simple steps.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map(({ title, description, imageSrc }: StepProps, index) => (
          <Card
            key={title}
            className="relative overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300"
          >
            <CardHeader className="p-6">
              <Badge variant="secondary" className="absolute top-4 left-4">
                Step {index + 1}
              </Badge>
              <div className="mt-8 mb-4 h-48 flex items-center justify-center rounded-md overflow-hidden bg-background">
                <Image
                  src={imageSrc}
                  alt={`Step ${index + 1} illustration`}
                  width={300}
                  height={225}
                  className="object-cover w-full h-full"
                />
              </div>
              <CardTitle className="mb-2 pt-4">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
 