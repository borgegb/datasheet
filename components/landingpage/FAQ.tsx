import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQProps {
  question: string;
  answer: string;
  value: string;
}

const FAQList: FAQProps[] = [
  {
    question: "What file formats can I generate?",
    answer:
      "You can instantly generate both PDF and Microsoft Word (.docx) documents.",
    value: "item-1",
  },
  {
    question: "Is it possible to customize the datasheet templates?",
    answer:
      "Yes, while we offer professional pre-defined templates, options for custom branding and layout adjustments are available (potentially as a premium feature or future update).",
    value: "item-2",
  },
  {
    question: "How is product data stored?",
    answer:
      "Your product data is securely stored in our database, linked to your user account, allowing you to easily manage and re-generate datasheets.",
    value: "item-3",
  },
  {
    question: "Can I upload product images?",
    answer:
      "Absolutely! You can easily upload product images which can be automatically included in your generated datasheets.",
    value: "item-4",
  },
  {
    question: "Do you offer support?",
    answer:
      "Yes, please use the contact form below for any inquiries or support requests.",
    value: "item-5",
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="container py-24 sm:py-32">
      <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">
        Frequently Asked Questions
      </h2>

      <Accordion type="single" collapsible className="w-full md:w-3/4 mx-auto">
        {FAQList.map(({ question, answer, value }: FAQProps) => (
          <AccordionItem key={value} value={value}>
            <AccordionTrigger className="text-left">
              {question}
            </AccordionTrigger>
            <AccordionContent>{answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
 