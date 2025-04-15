import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TestimonialProps {
  image?: string; // Make image optional if you might not have all
  name: string;
  userName: string;
  comment: string;
}

const testimonials: TestimonialProps[] = [
  {
    // image: "/path/to/jane.jpg", // Example path
    name: "Sarah M.",
    userName: "Marketing Manager",
    comment: "This tool has saved us so much time. Highly recommended!",
  },
  {
    name: "Mark D.",
    userName: "Product Lead",
    comment:
      "The templates are sleek and professional. Our datasheets look great.",
  },
  {
    name: "David L.",
    userName: "Sales Director",
    comment:
      "Easy to use and very efficient. A must-have for product managers.",
  },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="container py-24 sm:py-32">
      <h2 className="text-3xl md:text-4xl font-bold text-center">
        What Our Users Say
      </h2>
      <p className="text-xl text-muted-foreground text-center mt-4 mb-8">
        Listen to the experiences of professionals like you.
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {testimonials.map(
          ({ image, name, userName, comment }: TestimonialProps) => (
            <Card
              key={userName}
              className="bg-muted/50 flex flex-col justify-center items-center text-center p-6 shadow-sm"
            >
              {/* Avatar */}
              <Avatar className="mb-4 h-16 w-16">
                <AvatarImage alt={`${name}'s avatar`} src={image} />
                <AvatarFallback>
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* Comment */}
              <CardContent className="pb-0">
                <p className="text-lg font-medium before:content-'\201C' after:content-'\201D'">
                  {comment}
                </p>
              </CardContent>
              {/* Name & Title */}
              <CardHeader className="pt-4 pb-0">
                <CardTitle className="text-base font-semibold">
                  {name}
                </CardTitle>
                <CardDescription>{userName}</CardDescription>
              </CardHeader>
            </Card>
          )
        )}
      </div>
    </section>
  );
}
 