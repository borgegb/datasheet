"use client"; // Need client component for form handling

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(""); // For feedback (e.g., "Message sent!")

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("Sending...");

    // Replace with your actual form submission logic
    // e.g., using an API endpoint or a service like Formspree/Resend
    console.log("Form submitted:", { name, email, message });
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network delay

    setStatus("Message sent successfully!");
    setName("");
    setEmail("");
    setMessage("");
    setTimeout(() => setStatus(""), 3000); // Clear status after 3 seconds
  };

  return (
    <section id="contact" className="container py-24 sm:py-32">
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl md:text-4xl font-bold">
            Contact Us
          </CardTitle>
          <CardDescription>
            Have questions? Reach out and we'll get back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your message..."
                required
                rows={5}
              />
            </div>
            <Button type="submit" className="w-full">
              Send Message
            </Button>
            {status && (
              <p className="text-center text-sm text-muted-foreground mt-2">
                {status}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
 