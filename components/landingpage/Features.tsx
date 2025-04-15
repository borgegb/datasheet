import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  FileTextIcon,
  FileType2Icon,
  ImageIcon,
  SettingsIcon,
  FileInputIcon,
} from "lucide-react"; // Using lucide icons

interface FeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: FeatureProps[] = [
  {
    icon: <FileInputIcon size={28} />, // Use appropriate icons
    title: "Easy Data Input",
    description: "Intuitive web-based forms for entering product details.",
  },
  {
    icon: <FileTextIcon size={28} />,
    title: "Professional Templates",
    description: "Multiple predefined templates ensuring brand consistency.",
  },
  {
    icon: <FileType2Icon size={28} />,
    title: "Multi-format Output",
    description: "Instant download in PDF or Microsoft Word formats.",
  },
  {
    icon: <ImageIcon size={28} />,
    title: "Image Handling",
    description: "Effortlessly upload and position product images.",
  },
  {
    icon: <SettingsIcon size={28} />,
    title: "Customization Options",
    description:
      "Optional language selection and customizable branding elements.",
  },
];

export default function Features() {
  return (
    <section id="features" className="container py-24 sm:py-32 space-y-8">
      <h2 className="text-3xl lg:text-4xl font-bold md:text-center">
        Key Features
      </h2>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map(({ icon, title, description }: FeatureProps) => (
          <Card
            key={title}
            className="flex flex-col items-center text-center p-6"
          >
            <CardHeader className="pb-4">
              <div className="mb-4">{icon}</div>
              <CardTitle className="mb-2">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
 